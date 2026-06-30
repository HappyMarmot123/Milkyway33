# Phase 5 — 개발자 도구 & 고급 기능명세서

> 목표: 프롬프트 실험, trace 분석, 데이터 export, 파이프라인 상태 확인을 쉽게 만들어 LLM 기능 개발 속도와 품질을 높인다.
> 한 줄 설명: 개발자가 채팅 화면에서 눈으로 비교하던 일을 전용 도구에서 반복 가능하게 만든다.

---

## 1. 이 기능이 필요한 이유

LLM 기능은 prompt, model, retrieval, cache, guardrail 설정이 조금만 바뀌어도 결과가 달라진다. 지금처럼 채팅 화면에서 직접 질문하고 답변을 눈으로 비교하는 방식은 반복 실험에 맞지 않는다.

개발자에게 필요한 것은 다음이다.

- 같은 질문을 여러 설정으로 나란히 비교한다.
- 한 요청이 어느 단계에서 느려졌는지 본다.
- 좋은 답변을 평가셋 후보로 내보낸다.
- 파이프라인이 어느 단계에서 실패했는지 확인한다.
- GraphRAG 같은 고급 검색 실험을 작게 검증한다.

Phase 5는 일반 사용자 기능이 아니라 내부 개발 도구다. 화면은 마케팅 페이지가 아니라 비교와 분석이 쉬운 업무형 UI여야 한다.

---

## 2. 전체 구성

Phase 5는 네 가지 도구와 하나의 실험으로 나뉜다.

| 기능 | 목적 |
|---|---|
| Prompt Playground | prompt/model 설정을 바꿔 같은 질문을 비교 |
| Trace Viewer | 요청 처리 단계와 지연/실패 원인을 확인 |
| Liked Export | 좋아요한 대화를 eval/fine-tuning 후보 JSONL로 export |
| Pipeline DAG | 데이터 파이프라인 단계별 상태와 재실행 범위 확인 |
| GraphRAG Spike | entity/relation 확장이 실제 품질을 높이는지 실험 |

---

## 3. 기능 1: Prompt Playground

### 목적

같은 질문을 여러 model/prompt 설정으로 실행하고 결과를 나란히 비교한다.

### 사용자 흐름

1. 개발자가 playground 화면을 연다.
2. 질문을 입력한다.
3. variant A와 variant B의 model, system instruction, temperature 등을 설정한다.
4. 실행 버튼을 누른다.
5. 각 variant의 답변, latency, token usage, finish reason을 비교한다.
6. 좋은 결과는 evaluation dataset 후보로 저장한다.

### API

```http
POST /api/v1/playground/run
Content-Type: application/json
```

Request:

```json
{
  "prompt": "Milkyway-33의 RAG 구조를 설명해줘",
  "system_instruction": "한국어로 짧고 정확하게 답변",
  "model": "gemini-2.5-flash",
  "temperature": 0.7,
  "top_p": 0.9,
  "top_k": 40,
  "variant": "prompt_v2"
}
```

Response:

```json
{
  "variant": "prompt_v2",
  "response": "답변 본문",
  "model_used": "gemini-2.5-flash",
  "latency_ms": 1800,
  "usage_metadata": { "total_token_count": 640 },
  "finish_reason": "STOP",
  "safety_ratings": []
}
```

### UI 요구사항

| 영역 | 요구사항 |
|---|---|
| 설정 패널 | model, system instruction, temperature, top_p, top_k 입력 |
| 비교 영역 | variant별 응답을 column 또는 tab으로 비교 |
| 지표 영역 | latency, total tokens, prompt/candidate tokens 표시 |
| 저장 기능 | 평가셋 후보로 저장 버튼 |
| 오류 표시 | 실패한 variant만 독립적으로 오류 표시 |

### 완료 기준

- [ ] 최소 2개 variant를 동시에 비교할 수 있다.
- [ ] 각 variant의 token usage와 latency가 표시된다.
- [ ] 실패한 variant가 다른 variant 결과를 지우지 않는다.
- [ ] prompt와 response를 eval dataset 후보로 저장할 수 있다.

---

## 4. 기능 2: Trace Viewer

### 목적

한 요청이 어떤 단계를 거쳐 처리됐고 어디서 느려지거나 실패했는지 확인한다.

### 사용자 흐름

1. 개발자가 trace viewer를 연다.
2. `trace_id` 또는 최근 요청 목록에서 trace를 선택한다.
3. timeline에서 rate limit, guardrail, cache, retrieval, LLM, verifier 단계를 본다.
4. 특정 단계를 클릭해 metadata를 확인한다.
5. 실패나 warning이 있는 단계를 찾아 원인을 확인한다.

### 데이터 소스

Phase 4 trace event를 사용한다.

```json
{
  "trace_id": "trace_rag_20260630_001",
  "type": "llm",
  "latency_ms": 1520,
  "status": "ok",
  "metadata": {
    "model": "gemini-2.5-flash",
    "total_tokens": 640
  }
}
```

### UI 요구사항

| 영역 | 요구사항 |
|---|---|
| timeline | trace event를 시간순으로 표시 |
| 상세 패널 | event 클릭 시 metadata 표시 |
| latency | 단계별 ms와 전체 ms 표시 |
| 실패 강조 | error/warning 상태를 눈에 띄게 표시 |
| retrieval 상세 | source title, score, chunk id 표시 |
| tool 상세 | tool name, args, result 요약 표시 |

### 보안 요구사항

Trace Viewer에는 API key, prompt 원문에 포함된 PII, credential이 그대로 노출되면 안 된다. Phase 4 masking 결과만 표시한다.

### 완료 기준

- [ ] `trace_id`로 요청 전체 흐름을 볼 수 있다.
- [ ] retrieval과 LLM 지연을 구분해서 확인할 수 있다.
- [ ] 실패한 단계와 error metadata가 표시된다.
- [ ] source score와 chunk id를 확인할 수 있다.

---

## 5. 기능 3: Liked Message Export

### 목적

사용자가 좋아요를 누른 좋은 답변을 evaluation dataset 또는 fine-tuning 후보 데이터로 내보낸다.

### 사용자 흐름

1. 사용자가 채팅 답변에 좋아요를 누른다.
2. 개발자가 export 화면을 연다.
3. liked assistant message와 바로 앞 user message pair를 확인한다.
4. export 전 샘플과 총 건수를 본다.
5. PII 마스킹과 중복 제거를 적용한다.
6. JSONL 파일로 다운로드한다.

### 데이터 소스

Dexie `messages` 테이블에서 다음 조건을 만족하는 데이터를 찾는다.

- assistant message
- `liked === true`
- 바로 앞 message가 user message

### Export 포맷

```json
{"messages":[{"role":"user","content":"질문"},{"role":"assistant","content":"좋아요 받은 답변"}],"metadata":{"conversation_id":"conv_1","source":"milkyway-local-liked","pii_masked":true}}
```

### 요구사항

| ID | 요구사항 |
|---|---|
| P5-Export-01 | export 전에 후보 건수와 샘플 3개를 보여준다. |
| P5-Export-02 | PII 마스킹을 적용한다. |
| P5-Export-03 | 같은 user/assistant pair는 중복 제거한다. |
| P5-Export-04 | 서버 업로드 없이 브라우저에서 JSONL로 다운로드한다. |
| P5-Export-05 | 후보가 없으면 다운로드 버튼을 비활성화한다. |

### 주의

Dexie 데이터는 사용자 브라우저 로컬 데이터다. 이 기능은 기본적으로 서버 업로드를 하지 않는다.

---

## 6. 기능 4: Pipeline DAG

### 목적

Phase 0 데이터 파이프라인이 어느 단계까지 성공했고 어디서 실패했는지 확인한다.

### 사용자 흐름

1. 개발자가 pipeline을 실행한다.
2. 각 단계가 시작/완료/실패 상태를 DAG metadata에 남긴다.
3. 실패 시 어떤 단계부터 다시 실행해야 하는지 확인한다.
4. input hash가 같은 단계는 재실행을 생략할 수 있다.

### DAG node

```json
{
  "node_id": "chunk",
  "depends_on": ["clean"],
  "input_hash": "silver-hash",
  "output_path": "data/gold/chunks.jsonl",
  "status": "done",
  "started_at": "2026-06-30T00:00:00Z",
  "finished_at": "2026-06-30T00:00:05Z",
  "count": 120
}
```

### 상태

| 상태 | 의미 |
|---|---|
| `pending` | 아직 실행 전 |
| `running` | 실행 중 |
| `done` | 성공 |
| `failed` | 실패 |
| `skipped` | input hash가 같아 생략 |

### 완료 기준

- [ ] node별 상태와 count가 report에 남는다.
- [ ] failed node와 그 이후 dependent node만 재실행할 수 있다.
- [ ] DAG report를 사람이 읽을 수 있는 표로 출력할 수 있다.

---

## 7. 기능 5: GraphRAG Spike

### 목적

Vector search만으로 부족한 multi-hop 질문에서 entity/relation 확장이 도움이 되는지 작게 실험한다.

### 실험 흐름

1. 문서 chunk에서 entity와 relation을 추출한다.
2. edge를 JSONL 또는 Redis에 저장한다.
3. vector search 결과 chunk의 entity를 찾는다.
4. 연결된 1-hop relation을 추가 context로 확장한다.
5. Phase 2 평가셋에서 multi-hop 질문 정확도가 개선되는지 본다.

### 실험 범위

- entity/relation 추출
- graph edge 저장
- 1-hop 확장
- 확장 context를 RAG prompt에 추가
- multi-hop 평가 케이스 3개 이상 비교

### 중단 기준

다음 중 하나라도 해당하면 GraphRAG는 보류한다.

- correctness 개선이 없다.
- token cost가 과도하게 증가한다.
- 잘못된 entity/relation이 많다.
- 구현 복잡도에 비해 사용자 가치가 낮다.

GraphRAG는 MVP 기능이 아니라 spike다. 결과가 좋아야 정식 기능으로 승격한다.

---

## 8. 제외 범위

Phase 5 MVP에서는 다음을 하지 않는다.

- 일반 사용자용 관리자 콘솔
- 조직/권한 관리
- 외부 fine-tuning job 자동 실행
- 결제/사용량 과금 대시보드
- trace의 장기 보관 정책

---

## 9. 테스트 기준

| 테스트 | 확인할 내용 |
|---|---|
| playground API | parameter 전달과 response shape |
| playground UI | variant 비교와 실패 variant 표시 |
| trace viewer | timeline 정렬, error 표시 |
| export | liked pair 추출, PII 마스킹, JSONL 생성 |
| DAG | node dependency, failed node 재실행 범위 |
| GraphRAG spike | 평가셋에서 개선 여부 측정 |

---

## 10. 완료 기준

- [ ] Playground에서 2개 이상 variant를 비교한다.
- [ ] 각 variant의 latency/token/finish reason을 표시한다.
- [ ] Trace Viewer에서 `trace_id` 기준 timeline을 확인한다.
- [ ] liked message 기반 JSONL export가 가능하다.
- [ ] export 전 PII 마스킹과 중복 제거가 적용된다.
- [ ] Pipeline DAG report가 node별 상태와 count를 보여준다.
- [ ] GraphRAG spike는 평가 지표로 계속/보류를 판단한다.

---

## 11. 작업 분리

1. Playground backend endpoint 구현
2. Playground comparison UI 구현
3. eval dataset 후보 저장 구조 구현
4. trace 저장소/API 구현
5. Trace Viewer timeline UI 구현
6. liked message export 로직 구현
7. PII masking과 preview UI 구현
8. Pipeline DAG metadata writer 구현
9. GraphRAG spike script 작성
10. 테스트와 문서 갱신

---

## 12. 다른 Phase와 연결

Phase 5는 앞선 Phase가 만든 기능을 더 잘 보고, 비교하고, 재사용하기 위한 도구다.

| 선행 Phase | Phase 5에서 사용하는 것 |
|---|---|
| Phase 0 | Pipeline DAG |
| Phase 1 | RAG playground와 retrieval trace |
| Phase 2 | eval dataset 후보 저장과 비교 지표 |
| Phase 3 | agent tool trace |
| Phase 4 | trace schema, PII masking, cache/router metadata |
