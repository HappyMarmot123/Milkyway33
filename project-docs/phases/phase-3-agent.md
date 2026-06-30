# Phase 3 — 에이전트 기능명세서

> 목표: 사용자의 큰 요청을 여러 단계 작업으로 나누고, 필요한 도구를 호출하며, 중간 상태를 저장해 이어서 실행할 수 있게 한다.
> 한 줄 설명: "한 번 묻고 한 번 답하는 채팅"을 "계획을 세우고 단계별로 진행하는 작업 실행"으로 확장한다.

---

## 1. 이 기능이 필요한 이유

현재 Milkyway-33의 채팅은 사용자가 질문하면 Gemini가 한 번 답하는 구조다. 이 구조는 단순 질의응답에는 충분하지만 다음 요청에는 부족하다.

- "이 문서들을 찾아서 비교하고 부족한 점을 정리해줘."
- "RAG 구현 계획을 세우고 작업 단위로 나눠줘."
- "검색한 뒤 결과를 요약하고, 다음에 무엇을 해야 할지 제안해줘."

이런 요청은 한 번의 답변보다 여러 단계 처리가 필요하다. Phase 3은 모델이 목표를 plan으로 나누고, 각 step을 실행하고, 필요하면 도구를 호출하고, 위험한 행동 전에는 사용자 승인을 받는 구조를 만든다.

---

## 2. 사용자 경험

### 2.1 정상 작업 흐름

1. 사용자가 큰 목표를 입력한다.
2. 앱은 목표를 여러 step으로 나눈 plan을 보여준다.
3. 현재 실행 중인 step이 표시된다.
4. 도구를 호출하면 어떤 도구를 왜 쓰는지 보여준다.
5. 도구 결과가 도착하면 step 결과가 갱신된다.
6. 아직 남은 step이 있으면 "계속 진행"할 수 있다.
7. 모든 step이 끝나면 최종 요약 답변을 보여준다.

### 2.2 승인 필요 흐름

1. 에이전트가 위험한 작업을 하려고 한다.
2. 백엔드는 바로 실행하지 않고 승인 요청 이벤트를 보낸다.
3. 프론트는 승인/거절 UI를 보여준다.
4. 사용자가 승인하면 해당 step을 실행한다.
5. 사용자가 거절하면 해당 step은 건너뛰거나 취소된다.

초기 MVP에서는 실제 위험 도구를 제공하지 않는다. 승인 흐름이 제대로 동작하는 구조만 먼저 만든다.

---

## 3. 전체 처리 흐름

```text
사용자 goal
  -> agent task 생성
  -> planner가 step 목록 생성
  -> plan 이벤트 전송
  -> executor가 pending step 실행
  -> 필요한 경우 tool 호출
  -> tool result를 observation으로 저장
  -> step 상태 갱신
  -> Redis에 task state 저장
  -> max_steps에 도달하면 중단 후 task_id 반환
  -> continue 요청으로 이어서 실행
```

Vercel serverless 함수는 오래 실행될 수 없다. 따라서 한 요청에서 모든 일을 끝내는 구조가 아니라, 제한된 step만 실행하고 상태를 Redis에 저장한 뒤 `task_id`로 이어서 진행하는 구조가 필요하다.

---

## 4. 기능 1: Agent task 시작

### 목적

사용자의 목표를 받아 에이전트 작업을 시작한다.

### Endpoint

```http
POST /api/v1/agent/start
Content-Type: application/json
```

### Request

```json
{
  "goal": "Milkyway-33 문서를 검토하고 RAG 구현 Task를 정리해줘",
  "mode": "planner_executor",
  "max_steps": 5
}
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `goal` | 예 | 사용자가 달성하려는 목표 |
| `mode` | 아니오 | 초기값 `planner_executor` |
| `max_steps` | 아니오 | 한 요청에서 실행할 최대 step 수 |

### 첫 이벤트

작업이 시작되면 먼저 plan이 내려와야 한다.

```json
{
  "status": "plan",
  "task_id": "agent_1",
  "steps": [
    { "id": "step_1", "title": "문서 검색", "status": "pending" },
    { "id": "step_2", "title": "검색 결과 요약", "status": "pending" }
  ]
}
```

---

## 5. 기능 2: Planner

### 목적

사용자 goal을 실행 가능한 step 목록으로 나눈다.

### 입력

- 사용자 goal
- mode
- 사용 가능한 tool 목록
- max step 제한

### 출력

Plan object:

```json
{
  "task_id": "agent_1",
  "goal": "Milkyway-33 문서를 검토하고 RAG 구현 Task를 정리",
  "status": "running",
  "steps": [
    {
      "id": "step_1",
      "title": "관련 문서 검색",
      "description": "RAG와 데이터 파이프라인 문서를 검색한다.",
      "tool": "search_docs",
      "args": { "query": "Milkyway-33 RAG 기능명세" },
      "status": "pending"
    }
  ]
}
```

### 요구사항

- step은 2~8개 사이로 만든다.
- 각 step은 사용자가 이해할 수 있는 제목을 가져야 한다.
- tool이 필요 없는 step은 `tool`을 비울 수 있다.
- 존재하지 않는 tool 이름을 만들면 executor 단계에서 오류로 처리한다.

---

## 6. 기능 3: Executor

### 목적

plan의 pending step을 순서대로 실행한다.

### 처리

1. 다음 pending step을 찾는다.
2. step 상태를 `running`으로 바꾼다.
3. tool이 있으면 tool registry에서 찾는다.
4. tool input schema를 검증한다.
5. tool을 실행한다.
6. 결과를 progress와 trace에 저장한다.
7. step 상태를 `done` 또는 `failed`로 바꾼다.
8. `max_steps`에 도달하면 멈춘다.

### Step 상태

| 상태 | 의미 |
|---|---|
| `pending` | 아직 실행 전 |
| `running` | 현재 실행 중 |
| `waiting_approval` | 사용자 승인 대기 |
| `done` | 성공 |
| `failed` | 실패 |
| `skipped` | 승인 거절 또는 조건상 생략 |
| `cancelled` | 사용자가 작업 취소 |

---

## 7. 기능 4: Tool 호출

### 목적

모델이 직접 답하기 어려운 작업을 정해진 도구로 처리한다.

### 초기 허용 도구

| 도구 | 설명 | 위험도 |
|---|---|---|
| `search_docs` | RAG vector store에서 문서 검색 | 낮음 |
| `summarize_context` | 검색 결과 요약 | 낮음 |
| `inspect_conversation` | 현재 대화 history 요약 | 낮음 |

### 초기 금지 도구

- shell 실행
- 파일 쓰기/삭제
- 외부 이메일 전송
- 결제/구매
- credential 조회
- 사용자의 로컬 파일 무단 읽기

### Tool schema

```json
{
  "name": "search_docs",
  "description": "RAG 문서에서 관련 chunk를 검색한다.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" }
    },
    "required": ["query"]
  },
  "timeout_seconds": 10,
  "requires_approval": false
}
```

### 이벤트

```json
{"status":"tool_call","task_id":"agent_1","step_id":"step_1","name":"search_docs","input":{"query":"Milkyway-33 RAG"}}
{"status":"tool_result","task_id":"agent_1","step_id":"step_1","name":"search_docs","output":"검색 결과 요약"}
```

---

## 8. 기능 5: 작업 상태 저장과 이어서 실행

### 목적

serverless 제한 때문에 한 번에 끝나지 않은 작업을 나중에 이어서 실행할 수 있게 한다.

### 저장 위치

Upstash Redis에 저장한다.

Key 예시:

```text
agent:{task_id}:plan
agent:{task_id}:progress
agent:{task_id}:pending_approval
agent:{task_id}:trace
```

기본 TTL은 24시간이다. 만료된 작업은 복구하지 않는다.

### Continue endpoint

```http
POST /api/v1/agent/continue
Content-Type: application/json
```

Request:

```json
{
  "task_id": "agent_1",
  "max_steps": 3
}
```

동작:

1. Redis에서 plan과 progress를 읽는다.
2. 다음 pending step을 찾는다.
3. 지정된 `max_steps`만큼 실행한다.
4. 상태를 다시 Redis에 저장한다.

---

## 9. 기능 6: 사용자 승인

### 목적

위험한 도구나 되돌리기 어려운 작업을 사용자 동의 없이 실행하지 않는다.

### Approval event

```json
{
  "status": "approval_required",
  "task_id": "agent_1",
  "step_id": "step_2",
  "title": "외부 작업 실행 승인",
  "description": "이 step은 승인 후 실행됩니다."
}
```

### Approve endpoint

```http
POST /api/v1/agent/approve
Content-Type: application/json
```

Request:

```json
{
  "task_id": "agent_1",
  "step_id": "step_2",
  "approved": true
}
```

승인 대기 상태가 아닌 step에 approve 요청이 오면 409로 응답한다.

---

## 10. 프론트 UI 요구사항

| UI | 요구사항 |
|---|---|
| plan | 접을 수 있는 단계 목록으로 표시 |
| task step | 현재 실행 중, 완료, 실패 상태를 구분 |
| tool call | 도구 이름과 입력 요약 표시 |
| tool result | 긴 결과는 접힌 상태로 표시 |
| approval | 승인/거절 버튼을 명확히 제공 |
| continue | 남은 step이 있으면 이어서 진행 가능 |
| expired | 작업 상태가 만료되면 이어서 진행 버튼 비활성화 |

기존 `src/components/ai-elements/plan.tsx`, `task.tsx`, `tool.tsx`, `confirmation.tsx`를 우선 조합한다.

---

## 11. 예외 처리

| 상황 | 처리 |
|---|---|
| planner JSON parse 실패 | 1회 재시도 후 error 이벤트 |
| 없는 tool 호출 | tool error를 observation으로 기록 |
| tool input schema 불일치 | 같은 step에서 1회 repair 시도 |
| tool timeout | step failed |
| Redis 연결 실패 | agent start/continue 실패 |
| task state 만료 | 404와 "작업 상태가 만료되었습니다" |
| approval 거절 | step skipped |
| max_steps 도달 | partial result와 다음 pending step 안내 |

---

## 12. 제외 범위

Phase 3 MVP에서는 다음을 하지 않는다.

- shell 실행 도구
- 파일 삭제/쓰기 도구
- 외부 이메일/결제/구매 도구
- 무제한 autonomous loop
- background worker
- multi-agent production 구현

---

## 13. 테스트 기준

| 테스트 | 확인할 내용 |
|---|---|
| planner unit | goal이 올바른 step schema로 변환되는가 |
| tool registry unit | schema validation과 unknown tool 처리 |
| state unit | Redis mock 기반 save/get/expire |
| executor unit | max_steps, timeout, failed step 처리 |
| endpoint integration | start/continue/approve event shape |
| frontend component | plan/task/tool/confirmation 렌더링 |

---

## 14. 완료 기준

- [ ] `/api/v1/agent/start`가 plan 이벤트를 반환한다.
- [ ] step 상태가 pending -> running -> done/failed로 갱신된다.
- [ ] `search_docs` 도구 호출과 결과가 스트리밍된다.
- [ ] `task_id`로 작업 상태를 조회하고 이어서 실행할 수 있다.
- [ ] `max_steps` 제한이 동작한다.
- [ ] 승인 필요 step은 승인 전 실행되지 않는다.
- [ ] Redis state 만료 시 안전한 오류가 반환된다.
- [ ] 프론트에서 plan/task/tool/approval UI가 표시된다.

---

## 15. 작업 분리

1. Agent event/type 계약 정의
2. Tool registry와 초기 safe tool 구현
3. Redis state store 구현
4. Planner 구현
5. Executor 구현
6. start/continue/approve/status endpoint 추가
7. `src/api/agent.ts` 작성
8. chat renderer에 plan/task/tool event 연결
9. approval UI 연결
10. backend/frontend 테스트 추가

---

## 16. Phase 4와 연결

Agent는 도구 호출과 장기 상태를 다루므로 안전성 요구사항이 강하다. Phase 4의 tool input validation, trace 기록, PII 마스킹, verifier는 Agent 기능을 실서비스 수준으로 올리기 전에 반드시 붙어야 한다.
