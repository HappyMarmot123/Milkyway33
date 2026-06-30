# Phase 4 — 운영 & 안전성 기능명세서

> 목적: 비용, 지연, 안전성, 실패 복구를 관리해 LLM 기능을 실서비스 운영 수준으로 끌어올린다.

---

## 1. 배경과 문제정의

LLM 기능은 작동하는 것만으로 충분하지 않다. 운영 환경에서는 다음 문제가 반복적으로 발생한다.

- 같은 질문을 계속 LLM에 보내 비용이 증가한다.
- 쉬운 질문에도 비싼 모델을 사용한다.
- RAG 문서 안의 prompt injection 문구가 모델 지시처럼 작동할 수 있다.
- 사용자 입력이나 모델 출력에 개인정보/API key가 섞일 수 있다.
- JSON/tool/citation 출력이 깨져 후속 로직이 실패할 수 있다.
- timeout, quota, parse error 같은 일시 오류를 복구하지 못한다.

Phase 4는 이러한 문제를 처리하는 운영 계층을 만든다. 핵심은 요청 처리 pipeline을 명확히 하고, cache, routing, guardrail, verifier, trace를 각 단계에 배치하는 것이다.

## 2. 요청 처리 파이프라인

```text
request
  -> rate limit
  -> input guardrail
  -> input PII mask
  -> cache lookup
  -> model routing
  -> LLM/RAG/Agent execution
  -> output verifier
  -> output moderation/PII mask
  -> cache write
  -> token usage / trace 기록
  -> response
```

기존 `/api/v1/chat`과 새 `/rag/query`, `/agent/*`는 가능한 같은 운영 계층을 재사용한다. 단, 각 기능의 특성에 따라 적용 순서는 다를 수 있다. 예를 들어 Agent tool result는 별도 verifier가 필요하다.

## 3. 범위

### 포함 범위

- exact cache
- semantic cache
- model router
- input/output PII masking
- RAG context injection 방어
- output verifier
- retry/backoff helper
- trace event 기록
- 모델별 token/cost 집계 정합화

### 제외 범위

- 조직별 권한/role 기반 정책 엔진
- 외부 SIEM 연동
- enterprise audit log
- 법무/컴플라이언스 정책 자동 판정
- 모든 유해 콘텐츠 moderation의 완전 구현

## 4. Semantic Cache 기능명세

### 4.1 목적

동일하거나 매우 유사한 질문에 대해 LLM 호출을 생략해 비용과 지연을 줄인다.

### 4.2 Cache key

정확 일치 cache key에는 답변에 영향을 주는 설정을 포함한다.

```text
cache:exact:{mode}:{model}:{system_instruction_hash}:{question_hash}:{top_k}
```

RAG 질문에서 `top_k`, collection, prompt version이 다르면 같은 질문이라도 cache를 공유하지 않는다.

### 4.3 요구사항

| ID | 요구사항 |
|---|---|
| P4-Cache-01 | exact cache hit 시 LLM 호출 없이 cached response를 반환한다. |
| P4-Cache-02 | semantic cache는 similarity threshold 이상일 때만 사용한다. |
| P4-Cache-03 | cache hit/miss 여부를 response metadata 또는 trace에 기록한다. |
| P4-Cache-04 | cache TTL은 기능별로 설정 가능하다. |
| P4-Cache-05 | Redis 장애 시 cache miss로 간주하고 요청은 계속 처리한다. |

### 4.4 저장 데이터

```json
{
  "answer": "응답 본문",
  "sources": [],
  "model_used": "gemini-2.5-flash",
  "created_at": "2026-06-30T00:00:00Z",
  "ttl_seconds": 3600,
  "prompt_version": "rag_v1"
}
```

## 5. Model Routing 기능명세

### 5.1 목적

요청 난이도에 따라 저렴하고 빠른 모델 또는 더 강한 모델을 선택한다.

### 5.2 초기 라우팅 규칙

| 조건 | 모델 |
|---|---|
| 짧고 단순한 일반 질문 | `gemini-2.5-flash-lite` 계열 |
| 분석, 비교, 설계, 긴 답변 요청 | `gemini-2.5-flash` 계열 |
| judge/eval | 안정성이 높은 judge 전용 모델 |
| quota 오류 | fallback 모델 또는 안전한 오류 |

### 5.3 요구사항

| ID | 요구사항 |
|---|---|
| P4-Route-01 | 라우팅 결과는 `model_used`에 반영된다. |
| P4-Route-02 | 라우팅 이유는 trace metadata에 기록한다. |
| P4-Route-03 | 라우팅 규칙은 코드 상수 또는 환경변수로 조정 가능해야 한다. |
| P4-Route-04 | 강한 모델 fallback은 비용 보호 정책을 가진다. |

## 6. Guardrail/PII 기능명세

### 6.1 입력 Guardrail

기존 `guardrail.py`의 deny pattern, 길이 제한, 위험 shell operator 차단은 유지한다. 여기에 다음을 추가한다.

- PII 탐지/마스킹
- RAG context를 신뢰할 수 없는 데이터로 감싸기
- 출력 후 PII 재검사
- refusal suppression과 system prompt 탈취 시도 로깅

### 6.2 PII 마스킹 대상

| 유형 | 예시 | 치환 |
|---|---|---|
| 이메일 | `a@test.com` | `[EMAIL]` |
| 한국 휴대폰 | `010-1234-5678` | `[PHONE_KR]` |
| 주민등록번호 | `900101-1234567` | `[RRN]` |
| API key | `AIza...`, `sk-...` | `[API_KEY]` |

### 6.3 요구사항

| ID | 요구사항 |
|---|---|
| P4-Safe-01 | 입력과 출력에 같은 PII masking 함수를 적용할 수 있다. |
| P4-Safe-02 | RAG context 안의 지시문은 모델이 따르지 않도록 system prompt에 명시한다. |
| P4-Safe-03 | 차단 사유는 사용자에게 과도한 내부 정보를 노출하지 않는다. |
| P4-Safe-04 | guardrail 차단은 trace에 category만 기록한다. |

## 7. Verifier 기능명세

Verifier는 LLM output을 그대로 신뢰하지 않고 사용 전 검증한다.

| 대상 | 검증 |
|---|---|
| JSON output | parse 가능 여부, schema match |
| tool args | JSON schema validation |
| citation | citation 번호가 source index 범위 안인지 |
| code block | 실행 전 금지 패턴 검사 |
| RAG answer | context 밖 주장 여부 quick check |

실패 처리:

1. 같은 prompt에 "형식을 고쳐 다시 출력하라"는 repair 요청 1회
2. 그래도 실패하면 fallback response
3. 실패 정보는 trace에 기록

## 8. Trace 기능명세

Trace는 한 요청이 어떤 단계를 거쳐 처리됐는지 보여준다.

```json
{
  "trace_id": "trace_rag_20260630_001",
  "request_id": "req_20260630_001",
  "type": "retrieval",
  "started_at": "2026-06-30T00:00:00Z",
  "latency_ms": 120,
  "status": "ok",
  "metadata": {
    "collection": "milkyway_docs",
    "top_k": 5,
    "result_count": 5
  }
}
```

Trace type:
- `rate_limit`
- `guardrail`
- `cache`
- `route`
- `llm`
- `retrieval`
- `tool`
- `verify`
- `token_usage`

## 9. 예외 처리

| 케이스 | 처리 |
|---|---|
| Redis cache 장애 | cache miss로 처리, trace에 warning |
| router 예외 | 기본 모델 사용 |
| PII masking 예외 | 원문 전송 중단, 안전 오류 반환 |
| verifier 실패 | repair 1회 후 fallback |
| token usage 누산 실패 | 응답 유지, trace/log 기록 |
| moderation 차단 | 안전 안내 메시지 반환 |

## 10. 테스트 전략

| 테스트 | 검증 내용 |
|---|---|
| `test_semantic_cache.py` | exact key, TTL, Redis failure fallback |
| `test_model_router.py` | 난이도별 모델 선택 |
| `test_pii.py` | PII masking pattern |
| `test_guardrail_context.py` | RAG context injection 방어 prompt |
| `test_verifier.py` | JSON/schema/citation 검증 |
| `test_trace.py` | trace event shape |

## 11. 완료 기준

- [ ] 동일 질문 2회차에서 exact cache hit가 발생한다.
- [ ] 쉬운 질문과 복잡한 질문이 다른 모델로 라우팅된다.
- [ ] RAG 문서 안의 "이전 지시 무시" 문구가 모델 지시로 실행되지 않는다.
- [ ] 입력/출력 PII 샘플이 마스킹된다.
- [ ] JSON 출력 실패 시 repair 또는 fallback이 동작한다.
- [ ] trace에 cache, route, llm, retrieval 단계가 기록된다.
- [ ] token usage가 모델별로 분리 집계된다.

## 12. 작업 Task 분리

1. `pii.py` 작성
2. `semantic_cache.py` 작성
3. `router.py` 작성
4. `verifier.py` 작성
5. `trace.py` 작성
6. chat/rag service에 운영 pipeline 연결
7. agent tool output에 verifier 연결
8. frontend metadata 표시 여부 결정
9. pytest 추가

## 13. Phase 5와의 연결

Phase 5 Trace Viewer는 Phase 4 trace event를 데이터 소스로 사용한다. Phase 4에서 trace schema를 안정화하지 않으면 Phase 5의 개발자 도구가 매번 깨진다. 따라서 trace schema는 이 문서의 계약을 기준으로 먼저 고정한다.
