# Phase 5 — 개발자 도구 & 고급

> 목표: 개발 생산성을 높이는 내부 도구와, 검색 품질을 끌어올리는 그래프 기법.
> 프론트는 이미 shadcn/ui + Storybook이 있어 도구 UI를 빠르게 붙일 수 있다.

## 5.1 Prompt Playground
- 프롬프트·모델·temperature·top_p를 바꿔가며 즉시 비교.
- **백엔드**: `/api/v1/playground/run` — 기존 `gemini_service` 재사용, `GenerateContentConfig`에 temperature/top_p/top_k 노출(현재는 system_instruction만 받음 → config 확장).
```python
# gemini.py generate_response_stream 확장
config_params = {}
if system_instruction: config_params["system_instruction"] = system_instruction
if temperature is not None: config_params["temperature"] = temperature
if top_p is not None: config_params["top_p"] = top_p
```
- **프론트**: 좌측 파라미터 패널 + 우측 N개 응답 병렬 비교. 이미 있는 `model-selector.tsx`/`prompt-input.tsx` 확장.
- 결과를 Phase 2 평가셋으로 바로 저장하는 버튼("이 케이스를 데이터셋에 추가").

## 5.2 Trace Viewer
모델 호출·tool call·retrieval·token usage를 한 화면에서.
- **데이터 모델** (Redis list 또는 신규 테이블):
```python
{
  "trace_id": "...", "ts": ..., "type": "llm|tool|retrieval",
  "input": ..., "output": ..., "tokens": {...}, "latency_ms": ..., "cost": ...
}
```
- 기존 `token_usage.py`(누적값)를 **요청별 trace**로 확장: `accumulate` 호출 시 trace 레코드도 append.
- **프론트**: 타임라인 뷰. SSE 이벤트(`thought`/`tool_call`/`sources`/`complete`)를 그대로 trace로 적재 → 재사용성 높음.
- Vercel 서버리스라 외부 옵저버빌리티(예: Langfuse) 연동도 선택지.

## 5.3 Fine-tuning 데이터 생성
- 좋은 대화 로그(👍 = Dexie `ChatMessage.liked` 이미 존재!)를 학습 포맷으로 변환.
```python
# liked 메시지 + 직전 user 턴 → (prompt, completion) 쌍
def to_sft(messages: list[dict]) -> list[dict]:
    pairs = []
    for i, m in enumerate(messages):
        if m["role"] == "assistant" and m.get("liked") and i > 0:
            pairs.append({"messages": [
                {"role": "user", "content": messages[i-1]["content"]},
                {"role": "assistant", "content": m["content"]},
            ]})
    return pairs
```
- 정제: PII 마스킹(4.3 재사용), 중복 제거(0.3 재사용), 품질 필터(judge 점수 임계).
- 출력: JSONL(OpenAI/Gemini 튜닝 포맷). DPO용 선호쌍(👍 vs 👎)도 구성 가능.

## 5.4 그래프 설계 / 구현
### A. 지식 그래프 + GraphRAG
- 문서에서 엔티티·관계 추출(LLM) → 노드/엣지 저장 → 멀티홉 질의에 강함.
```python
# 추출: "A는 B에 의존한다" → (A)-[:DEPENDS_ON]->(B)
# 저장: 경량은 Redis 인접리스트, 본격은 그래프DB
# 검색: 벡터로 진입점 찾고 → 그래프 N-hop 확장 → 컨텍스트 보강
```
- 효과: "X와 관련된 모든 것" 류 질의, 설명가능성(근거 경로) 향상.

### B. 파이프라인 DAG (운영 그래프)
- Phase 0 파이프라인(crawl→clean→chunk→embed→load)을 **의존성 그래프**로 명시.
- 노드별 캐싱·부분 재실행·실패 격리. 시작은 단순 함수 체인, 확장 시 Prefect/Dagster 류.

## 완료 기준
- [ ] Playground에서 temperature/top_p 바꿔 응답 비교 가능
- [ ] 한 요청의 LLM/tool/retrieval/토큰이 trace로 한 화면에 표시
- [ ] 👍 로그가 SFT JSONL로 export됨 (PII 마스킹 포함)
- [ ] (선택) GraphRAG로 멀티홉 질의 1건 이상 개선 시연

## 전체 로드맵으로
→ [README / 로드맵 인덱스](../LLM-ENGINEERING-ROADMAP.md)
