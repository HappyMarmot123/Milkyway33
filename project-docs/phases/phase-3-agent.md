# Phase 3 — 에이전트 기능명세서

> 목적: 단일 응답형 채팅을 넘어, 계획 수립·도구 호출·상태 저장·사용자 승인까지 포함한 다단계 작업 실행 구조를 만든다.

---

## 1. 배경과 문제정의

현재 Milkyway-33의 채팅은 사용자가 한 번 묻고 모델이 한 번 답하는 구조다. 이 방식은 단순 질의응답에는 충분하지만, "문서를 찾아 비교하고 부족한 항목을 정리해줘", "여러 단계로 계획을 세워 진행해줘" 같은 작업에는 한계가 있다.

에이전트 기능은 모델이 다음 일을 할 수 있게 만든다.

- 사용자의 목표를 단계별 plan으로 나눈다.
- 각 단계에 필요한 도구를 선택한다.
- 도구 호출 결과를 관찰하고 다음 행동을 결정한다.
- 장기 작업 상태를 Redis에 저장해 이어서 진행한다.
- 위험한 행동은 사용자 승인 전 멈춘다.

단, Vercel serverless 환경에서는 하나의 요청이 오래 실행될 수 없다. 따라서 "한 요청에서 모든 일을 끝내는 자율 에이전트"가 아니라, 한 요청에서 제한된 step을 실행하고 상태를 저장한 뒤 `task_id`로 이어서 진행하는 구조가 필요하다.

## 2. 사용자 시나리오

### 2.1 계획 생성과 실행

1. 사용자가 "Milkyway-33 문서에서 RAG 관련 부족한 부분을 찾아 작업 목록으로 정리해줘"라고 요청한다.
2. 백엔드는 goal을 받아 planner를 실행한다.
3. planner는 `문서 검색 -> 관련 내용 요약 -> 부족한 요구사항 정리 -> 최종 답변` 같은 plan을 만든다.
4. 프론트는 `plan` 이벤트를 받아 단계 목록을 표시한다.
5. executor는 첫 번째 pending step을 실행한다.
6. 도구가 필요하면 `tool_call` 이벤트를 보내고, 결과를 `tool_result` 이벤트로 보낸다.
7. 각 단계 상태는 `task_update` 이벤트로 갱신된다.
8. 요청 제한에 도달하거나 step이 남으면 Redis에 상태를 저장하고 `task_id`를 반환한다.
9. 프론트는 사용자가 계속 진행을 누르거나 자동으로 `/agent/continue`를 호출한다.

### 2.2 사용자 승인 흐름

1. 에이전트가 위험 도구를 실행하려 한다.
2. 백엔드는 실행하지 않고 `approval_required` 이벤트를 보낸다.
3. 프론트는 `confirmation.tsx` 기반 승인 UI를 띄운다.
4. 사용자가 승인하면 `/api/v1/agent/approve`를 호출한다.
5. 거절하면 해당 step은 cancelled 또는 skipped가 된다.

초기 MVP에서는 실제 위험 도구를 제공하지 않는다. 승인 흐름은 구조만 먼저 만든다.

## 3. 범위

### 3.1 포함 범위

- Agent task id 생성
- Planner/Executor 분리
- Tool registry
- ReAct loop 기본 구조
- Redis task state 저장
- plan/task/tool/approval NDJSON 이벤트
- 안전한 초기 도구 3개
- max step 제한
- task 조회/continue/approve endpoint

### 3.2 제외 범위

- shell 실행 도구
- 파일 삭제/쓰기 도구
- 외부 이메일/결제/구매 도구
- 무제한 autonomous loop
- background worker
- multi-agent 협업의 production 구현

## 4. 시스템 구성

| 모듈 | 책임 |
|---|---|
| `backend/app/agent/tools.py` | 도구 registry와 schema |
| `backend/app/agent/planner.py` | goal을 step list로 변환 |
| `backend/app/agent/executor.py` | pending step 실행 |
| `backend/app/agent/react.py` | thought/action/observation loop |
| `backend/app/agent/state.py` | Redis task state 저장/조회 |
| `backend/app/api/endpoints/agent.py` | start/continue/approve/status endpoint |
| `src/api/agent.ts` | NDJSON client |
| chat message renderer | plan/task/tool/confirmation UI mapping |

## 5. 상태 모델

### 5.1 Redis key

```text
agent:{task_id}:plan
agent:{task_id}:progress
agent:{task_id}:pending_approval
agent:{task_id}:trace
```

모든 key는 TTL을 가진다. 기본 TTL은 24시간이다. 만료된 task는 복구할 수 없으며 사용자에게 "작업 상태가 만료되었습니다"라고 안내한다.

### 5.2 Plan object

```json
{
  "task_id": "agent_docs_review_001",
  "goal": "Milkyway-33 문서에서 RAG 관련 부족한 부분 정리",
  "status": "running",
  "steps": [
    {
      "id": "step_1",
      "title": "관련 문서 검색",
      "description": "RAG와 데이터 파이프라인 문서를 검색한다.",
      "tool": "search_docs",
      "args": {"query": "Milkyway-33 RAG 기능명세"},
      "status": "done",
      "result_ref": "agent:agent_docs_review_001:progress:step_1"
    }
  ],
  "created_at": "2026-06-30T00:00:00Z",
  "expires_at": "2026-07-01T00:00:00Z"
}
```

### 5.3 Step status

| 상태 | 의미 |
|---|---|
| `pending` | 아직 실행 전 |
| `running` | 현재 실행 중 |
| `waiting_approval` | 사용자 승인 대기 |
| `done` | 성공 |
| `failed` | 실패 |
| `skipped` | 승인 거절 또는 조건상 생략 |
| `cancelled` | 사용자가 작업 취소 |

## 6. API 계약

### 6.1 Start

```http
POST /api/v1/agent/start
Content-Type: application/json
```

Request:

```json
{
  "goal": "Milkyway-33 문서를 검토하고 RAG 구현 Task를 정리해줘",
  "mode": "planner_executor",
  "max_steps": 5
}
```

Response/stream events:

```json
{"status":"plan","task_id":"agent_1","steps":[{"id":"step_1","title":"문서 검색","status":"pending"}]}
{"status":"task_update","task_id":"agent_1","step_id":"step_1","state":"running"}
{"status":"tool_call","name":"search_docs","input":{"query":"Milkyway-33 RAG"}}
{"status":"tool_result","name":"search_docs","output":"검색 결과 요약"}
{"status":"task_update","task_id":"agent_1","step_id":"step_1","state":"done"}
{"status":"complete","task_id":"agent_1","response":"작업 요약"}
```

### 6.2 Continue

```http
POST /api/v1/agent/continue
```

Request:

```json
{"task_id":"agent_1","max_steps":3}
```

기존 plan에서 다음 pending step부터 실행한다.

### 6.3 Approve

```http
POST /api/v1/agent/approve
```

Request:

```json
{"task_id":"agent_1","step_id":"step_2","approved":true}
```

승인된 step만 실행한다. 승인 대기 상태가 아닌 step에 approve 요청이 오면 409로 응답한다.

### 6.4 Status

```http
GET /api/v1/agent/{task_id}
```

현재 plan, progress, pending approval 여부를 반환한다.

## 7. 도구 정책

### 7.1 초기 허용 도구

| 도구 | 설명 | 위험도 |
|---|---|---|
| `search_docs` | RAG vector store에서 문서 검색 | 낮음 |
| `summarize_context` | 검색 결과 요약 | 낮음 |
| `inspect_conversation` | 현재 대화 history 요약 | 낮음 |

### 7.2 초기 금지 도구

- shell 실행
- 파일 쓰기/삭제
- 외부 이메일 전송
- 결제/구매
- credential 조회
- 사용자의 로컬 파일 무단 읽기

### 7.3 도구 schema 요구사항

각 도구는 다음 정보를 가진다.

```json
{
  "name": "search_docs",
  "description": "RAG 문서에서 관련 chunk를 검색한다.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {"type": "string"}
    },
    "required": ["query"]
  },
  "timeout_seconds": 10,
  "requires_approval": false
}
```

도구 입력은 실행 전 JSON schema로 검증한다. 검증 실패는 LLM에 다시 고칠 기회를 주되, 같은 step에서 1회만 재시도한다.

## 8. 기능 요구사항

| ID | 요구사항 |
|---|---|
| P3-Plan-01 | planner는 goal을 2~8개 step으로 분해한다. |
| P3-Plan-02 | 각 step은 id, title, description, tool, args, status를 가진다. |
| P3-Exec-01 | executor는 한 요청에서 `max_steps`까지만 실행한다. |
| P3-Exec-02 | 도구 결과는 progress와 trace에 저장한다. |
| P3-State-01 | Redis state는 TTL 24시간을 가진다. |
| P3-State-02 | `task_id`로 작업을 조회하고 이어서 실행할 수 있다. |
| P3-Safe-01 | 위험 도구는 approval 없이 실행하지 않는다. |
| P3-UI-01 | 프론트는 plan/task/tool/approval 이벤트를 각각 UI 컴포넌트에 매핑한다. |

## 9. 예외 처리

| 케이스 | 처리 |
|---|---|
| planner JSON parse 실패 | 같은 prompt로 1회 재시도, 실패 시 error event |
| 없는 tool 호출 | tool error를 observation으로 기록하고 다음 판단 요청 |
| tool timeout | step failed, 사용자에게 재시도 가능 안내 |
| Redis 연결 실패 | agent start/continue 실패 처리 |
| task state 만료 | 404와 "작업 상태가 만료되었습니다" |
| approval 거절 | step skipped, plan 상태 갱신 |
| max_steps 초과 | partial result와 다음 pending step 안내 |

## 10. 프론트 UI 요구사항

- Plan은 접을 수 있는 단계 목록으로 표시한다.
- 현재 실행 중 step은 loading 상태를 가진다.
- tool call은 도구 이름과 입력 요약을 표시한다.
- tool result는 긴 출력이면 접힌 상태로 표시한다.
- approval required는 사용자가 승인/거절을 명확히 선택할 수 있어야 한다.
- agent task가 만료되면 이어서 진행 버튼을 비활성화한다.

## 11. 테스트 전략

| 테스트 | 검증 내용 |
|---|---|
| planner unit | goal -> step schema validation |
| tool registry unit | schema validation, unknown tool 처리 |
| state unit | Redis mock 기반 save/get/expire |
| executor unit | max_steps, timeout, failed step 처리 |
| endpoint integration | start/continue/approve event shape |
| frontend component | plan/task/tool/confirmation 렌더링 |

## 12. 완료 기준

- [ ] `/api/v1/agent/start`가 plan 이벤트를 반환한다.
- [ ] `search_docs` 도구 호출과 결과가 스트리밍된다.
- [ ] `task_id`로 작업 상태를 조회할 수 있다.
- [ ] `max_steps` 제한이 동작한다.
- [ ] 승인 필요 step은 승인 전 실행되지 않는다.
- [ ] Redis state 만료 시 안전한 오류를 반환한다.
- [ ] 프론트에서 plan/task/tool/approval UI가 표시된다.

## 13. 작업 Task 분리

1. Agent event/type 계약 정의
2. Tool registry와 초기 safe tool 구현
3. Redis state store 구현
4. Planner 구현
5. Executor/ReAct loop 구현
6. Agent endpoint 추가
7. Frontend `streamAgent()` 추가
8. Chat message renderer에 plan/task/tool event 연결
9. Approval UI와 `/approve` 연결
10. backend/frontend 테스트 추가

## 14. Phase 4와의 연결

Agent는 도구 호출과 장기 상태를 다루기 때문에 Phase 4의 안전성 요구사항과 강하게 연결된다. 특히 tool input validation, trace 기록, PII 마스킹, verifier는 Agent 기능을 실서비스 수준으로 올리기 전에 반드시 붙어야 한다.
