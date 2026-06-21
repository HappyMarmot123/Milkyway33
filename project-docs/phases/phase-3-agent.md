# Phase 3 — 에이전트

> 목표: 단일 응답을 넘어 "생각→도구 호출→관찰→다음 행동" 루프와 다단계 작업 관리.
> 프론트에 `chain-of-thought.tsx`, `tool.tsx`, `plan.tsx`, `task.tsx`, `confirmation.tsx`가 이미 존재 → 백엔드 이벤트만 맞추면 시각화가 바로 붙는다.

## 서버리스 제약과 설계 원칙
- Vercel 함수 60s 제한 → **한 요청 = 한 스텝(또는 몇 스텝)**. 장기 작업은 상태를 **Upstash Redis에 저장**하고 클라이언트가 다음 스텝을 폴링/재요청.
- 모든 도구는 멱등·타임아웃·검증 가능하게.

## 추가 파일
```
backend/app/agent/
  tools.py            # 도구 레지스트리 (함수 + JSON 스키마)
  react.py            # ReAct 루프
  planner.py          # 3.2 계획 수립
  executor.py         # 3.2 단계 실행
  state.py            # 3.3 Redis 기반 작업 상태
backend/app/api/endpoints/agent.py
```

## 3.1 ReAct 루프 — `agent/react.py`
도구 정의(레지스트리):
```python
# tools.py
TOOLS = {}
def tool(name, schema):
    def deco(fn): TOOLS[name] = {"fn": fn, "schema": schema}; return fn
    return deco

@tool("search_docs", {"type": "object", "properties": {"query": {"type": "string"}}})
async def search_docs(query: str) -> str:
    from app.services.vector_store import vector_store
    from app.services.embedding import embedding_service
    hits = vector_store.search(embedding_service.embed_query(query), top_k=3)
    return "\n".join(h["text"] for h in hits)
```
루프(이벤트를 기존 SSE 포맷으로 방출 → 프론트 `tool.tsx`/`chain-of-thought.tsx`가 소비):
```python
async def react_run(goal: str, max_steps=5):
    scratchpad = []
    for step in range(max_steps):
        decision = await llm_decide(goal, scratchpad, TOOLS)  # {thought, action, action_input} or {final}
        yield {"status": "thought", "text": decision["thought"]}
        if decision.get("final"):
            yield {"status": "complete", "response": decision["final"]}; return
        yield {"status": "tool_call", "name": decision["action"], "input": decision["action_input"]}
        observation = await TOOLS[decision["action"]]["fn"](**decision["action_input"])
        yield {"status": "tool_result", "name": decision["action"], "output": observation[:500]}
        scratchpad.append((decision, observation))
    yield {"status": "complete", "response": "최대 스텝 도달"}
```
- **이벤트 매핑**: `thought`→chain-of-thought, `tool_call`/`tool_result`→tool, `complete`→메시지.

## 3.2 Planner / Executor 분리
```python
# planner.py — 작업을 단계 목록으로 분해
async def make_plan(goal: str) -> list[dict]:
    # LLM → [{"id":1,"desc":"문서 검색","tool":"search_docs"}, ...]
    ...

# executor.py — 한 번에 한 단계 실행 + 상태 갱신
async def run_step(task_id: str, step_id: int):
    plan = await state.get_plan(task_id)
    step = plan[step_id]
    result = await TOOLS[step["tool"]]["fn"](**step["args"])
    await state.mark_done(task_id, step_id, result)
```
- 프론트 `plan.tsx`(계획 표시) + `task.tsx`(단계별 진행) 연결.

## 3.3 장기 작업 상태 관리 — `agent/state.py` (Upstash Redis 재사용)
```python
from upstash_redis.asyncio import Redis
import json

class AgentState:
    def __init__(self): self._r = None
    @property
    def r(self) -> Redis:
        if self._r is None: self._r = Redis.from_env()
        return self._r

    async def save_plan(self, task_id, plan):
        await self.r.set(f"agent:{task_id}:plan", json.dumps(plan), ex=86400)
    async def get_plan(self, task_id):
        return json.loads(await self.r.get(f"agent:{task_id}:plan") or "[]")
    async def mark_done(self, task_id, step_id, result):
        await self.r.hset(f"agent:{task_id}:progress", str(step_id),
                          json.dumps({"status": "done", "result": result[:1000]}))
    async def next_pending(self, task_id):
        plan = await self.get_plan(task_id)
        prog = await self.r.hgetall(f"agent:{task_id}:progress") or {}
        for s in plan:
            if str(s["id"]) not in prog: return s
        return None

agent_state = AgentState()
```
- **실패 복구**: 스텝 결과를 Redis에 남기므로, 함수가 죽어도 `next_pending`부터 재개.
- **이어서 실행**: 클라이언트가 `task_id`로 `/agent/continue` 재호출.

## 3.4 Human-in-the-loop 승인 — `confirmation.tsx` 연결
```python
DANGEROUS = {"delete_file", "send_email", "charge_payment"}

async def maybe_pause_for_approval(task_id, step):
    if step["tool"] in DANGEROUS:
        await agent_state.r.set(f"agent:{task_id}:pending_approval",
                                json.dumps(step), ex=3600)
        return {"status": "approval_required", "step": step}  # → confirmation.tsx
    return None
# 승인 시 /agent/approve {task_id, approved: true} → 실행 재개
```
- 위험 행동(파일 삭제·결제·이메일) 전 **반드시 정지** → 사용자 승인 후 진행.

## 3.5 Multi-agent
- 역할 분리: `researcher`(검색·수집) → `coder`(초안 작성) → `reviewer`(검증).
- 구현: 각 역할별 system_instruction + 공유 scratchpad(Redis). reviewer가 reject하면 coder로 되돌림(최대 N회).
- 시작은 2-agent(생성↔검증)로 작게.

## 완료 기준
- [ ] ReAct가 도구를 호출하고 thought/tool 이벤트를 스트리밍
- [ ] planner가 만든 계획이 `plan.tsx`에 표시
- [ ] 함수 재시작 후 `task_id`로 중단 지점부터 재개
- [ ] 위험 도구 호출 시 승인 대기 → 승인 후 실행
- [ ] (선택) reviewer가 1회 이상 반려·재작성 유도

## 다음 단계
→ [Phase 4 — 운영 & 안전성](./phase-4-ops-safety.md)
