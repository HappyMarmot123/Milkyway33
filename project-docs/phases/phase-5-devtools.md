# Phase 5 — 개발자 도구 & 고급 기능명세서

> 목적: 프롬프트 실험, trace 분석, 학습 데이터 export, Graph/DAG 실험을 통해 LLM 기능 개발 속도와 품질을 높인다.

---

## 1. 배경과 문제정의

LLM 기능은 prompt, model, retrieval, guardrail, cache 설정이 조금만 바뀌어도 결과가 크게 달라진다. 지금처럼 채팅 화면에서 직접 질문하고 답변을 눈으로 비교하는 방식은 반복 실험에 적합하지 않다.

개발자에게 필요한 것은 다음이다.

- 같은 질문을 여러 prompt/model 설정으로 나란히 비교
- 한 요청에서 retrieval, LLM, tool, verifier가 얼마나 걸렸는지 확인
- 좋은 답변을 evaluation/fine-tuning 데이터로 내보내기
- 데이터 파이프라인이 어느 단계에서 실패했는지 추적
- 장기적으로 GraphRAG 같은 고급 검색 실험을 안전하게 시도

Phase 5는 일반 사용자 기능이 아니라 개발/운영 생산성 도구다. 따라서 화면은 화려한 마케팅 페이지가 아니라 내부 도구답게 조밀하고 비교하기 쉬워야 한다.

## 2. 범위

### 포함 범위

- Prompt Playground
- Trace Viewer
- liked 대화 기반 JSONL export
- Pipeline DAG metadata
- GraphRAG spike 설계

### 제외 범위

- 일반 사용자용 관리자 콘솔
- 조직/권한 관리
- 외부 fine-tuning job 자동 실행
- 결제/사용량 과금 대시보드

## 3. Prompt Playground 기능명세

### 3.1 사용자 시나리오

개발자는 playground 화면에서 같은 질문을 두 개 이상의 variant로 실행한다. 왼쪽 패널에서 model, system instruction, temperature, top_p, top_k를 조정하고, 오른쪽 비교 영역에서 응답 본문, token usage, latency, finish reason을 나란히 본다. 좋은 케이스는 evaluation dataset 후보로 저장한다.

### 3.2 API

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
  "usage_metadata": {"total_token_count": 640},
  "finish_reason": "STOP",
  "safety_ratings": []
}
```

### 3.3 UI 요구사항

| 영역 | 요구사항 |
|---|---|
| 설정 패널 | model, system instruction, temperature, top_p, top_k 입력 |
| 비교 영역 | variant별 응답을 column 또는 tab으로 비교 |
| 지표 | latency, total tokens, prompt/candidate tokens 표시 |
| 저장 | "평가셋 후보로 저장" 버튼 |
| 오류 | variant별 실패를 독립 표시 |

### 3.4 완료 기준

- [ ] 최소 2개 variant를 동시에 비교할 수 있다.
- [ ] token usage와 latency가 variant별로 표시된다.
- [ ] prompt와 response를 eval dataset 후보로 저장할 수 있다.
- [ ] 실패한 variant가 다른 variant 결과를 지우지 않는다.

## 4. Trace Viewer 기능명세

### 4.1 사용자 시나리오

개발자가 "왜 이 답변이 느렸지?", "검색 결과가 이상한가?", "cache hit가 됐나?"를 확인하고 싶을 때 trace viewer를 연다. 요청 하나의 trace timeline에서 rate limit, guardrail, cache, retrieval, LLM, verifier, token usage 단계를 순서대로 확인한다.

### 4.2 데이터 소스

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

### 4.3 UI 요구사항

| 요구사항 | 설명 |
|---|---|
| timeline | trace event를 시간순으로 표시 |
| 단계별 상세 | event 클릭 시 input/output/metadata 표시 |
| latency 표시 | 단계별 ms와 전체 ms 표시 |
| 실패 강조 | status가 error/warning인 event는 눈에 띄게 표시 |
| retrieval 상세 | source title, score, chunk id 표시 |
| tool 상세 | tool name, args, result 요약 표시 |

### 4.4 완료 기준

- [ ] `trace_id`로 요청 전체 흐름을 볼 수 있다.
- [ ] retrieval과 LLM 지연을 구분해서 확인할 수 있다.
- [ ] 실패한 단계와 error metadata가 표시된다.
- [ ] source score와 chunk id를 확인할 수 있다.

## 5. Fine-tuning/Eval 데이터 Export 기능명세

### 5.1 사용자 시나리오

사용자는 채팅 답변에 좋아요를 누른다. 개발자는 export 화면에서 liked assistant message와 직전 user message를 pair로 확인한다. PII 마스킹과 중복 제거를 적용한 뒤 JSONL로 다운로드한다. 이 파일은 evaluation dataset 또는 fine-tuning 후보 데이터로 사용된다.

### 5.2 데이터 소스

Dexie `messages` 테이블:

- `role === "assistant"`
- `liked === true`
- 직전 message가 `role === "user"`

### 5.3 Export 포맷

```json
{"messages":[{"role":"user","content":"질문"},{"role":"assistant","content":"좋아요 받은 답변"}],"metadata":{"conversation_id":"conv_1","source":"milkyway-local-liked","pii_masked":true}}
```

### 5.4 요구사항

| ID | 요구사항 |
|---|---|
| P5-Export-01 | export 전에 후보 건수와 샘플 3개를 보여준다. |
| P5-Export-02 | PII 마스킹을 적용한다. |
| P5-Export-03 | 같은 user/assistant pair는 중복 제거한다. |
| P5-Export-04 | 서버 업로드 없이 브라우저에서 JSONL 파일로 다운로드한다. |
| P5-Export-05 | 빈 후보 목록이면 다운로드 버튼을 비활성화한다. |

## 6. Pipeline DAG 기능명세

### 6.1 목적

Phase 0 파이프라인의 각 단계가 어떤 입력을 받아 어떤 출력을 만들었는지 기록한다. 실패 시 어느 단계부터 재실행해야 하는지 판단할 수 있게 한다.

### 6.2 DAG Node

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

### 6.3 요구사항

- 각 node는 `pending`, `running`, `done`, `failed`, `skipped` 상태를 가진다.
- input hash가 같으면 node 재실행을 생략할 수 있다.
- failed node와 이후 dependent node만 재실행할 수 있어야 한다.
- DAG report는 사람이 읽을 수 있는 표로 출력 가능해야 한다.

## 7. GraphRAG Spike 기능명세

GraphRAG는 MVP 기능이 아니라 실험이다. 목적은 vector search로 찾은 chunk 주변의 entity/relation을 확장해 multi-hop 질문 품질을 높일 수 있는지 확인하는 것이다.

### 7.1 실험 범위

- 문서 chunk에서 entity와 relation 추출
- Redis 또는 JSONL에 graph edge 저장
- vector search 결과의 entity를 시작점으로 1-hop 확장
- 확장 context를 RAG prompt에 추가
- Phase 2 평가셋에서 multi-hop 질문 3개 이상 개선되는지 확인

### 7.2 중단 기준

다음 중 하나라도 해당하면 GraphRAG는 보류한다.

- 평가셋에서 correctness 개선이 없다.
- context가 길어져 token cost가 과도하게 증가한다.
- entity extraction 품질이 낮아 잘못된 관계가 많이 생긴다.

## 8. 보안/데이터 주의사항

- liked message export는 기본적으로 로컬 다운로드만 지원한다.
- Dexie 데이터는 사용자 브라우저 로컬 데이터이므로 서버에 자동 전송하지 않는다.
- trace viewer에 prompt/API key/PII가 노출되지 않도록 masking한다.
- playground는 내부 개발 기능이므로 배포 노출 여부를 별도 flag로 제어한다.

## 9. 테스트 전략

| 테스트 | 검증 내용 |
|---|---|
| playground API test | parameter 전달, response shape |
| playground UI test | variant 비교, 실패 variant 표시 |
| trace viewer test | timeline 정렬, error 표시 |
| export test | liked pair 추출, PII 마스킹, JSONL 생성 |
| DAG test | node dependency, failed node 재실행 범위 |

## 10. 완료 기준

- [ ] Playground에서 2개 이상 variant를 비교한다.
- [ ] 각 variant의 latency/token/finish reason을 표시한다.
- [ ] Trace Viewer에서 `trace_id` 기준 timeline을 확인한다.
- [ ] liked message 기반 JSONL export가 가능하다.
- [ ] export 전 PII 마스킹과 중복 제거가 적용된다.
- [ ] Pipeline DAG report가 node별 상태와 count를 보여준다.
- [ ] GraphRAG spike는 평가 지표로 계속/보류를 판단한다.

## 11. 작업 Task 분리

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

## 12. 전체 로드맵으로

Phase 5는 Phase 0~4가 만든 데이터를 더 잘 보고, 비교하고, 재사용하기 위한 도구다. 먼저 Playground와 Trace Viewer를 구현하고, 그 다음 liked export와 Pipeline DAG를 붙인다. GraphRAG는 마지막 실험으로 둔다.
