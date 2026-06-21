# Phase 2 — 평가 & 모델 성능 파악

> 목표: "느낌"이 아니라 **수치**로 RAG·모델 품질을 측정하고 회귀를 막는다.
> 이미 `token_usage.py`(비용)와 `model-info` 엔드포인트가 있으니, 여기에 품질 축을 더한다.

## 추가 파일
```
backend/eval/
  dataset.jsonl        # 평가셋: 입력/기대출력/근거
  judge.py             # LLM-as-judge 채점기
  metrics.py           # recall@k, precision@k, groundedness 등
  run_eval.py          # 러너 (CLI) → 결과 리포트
  reports/             # 실행별 결과 (git-ignore 또는 커밋)
```

## 2.1 평가셋 포맷 — `eval/dataset.jsonl`
```jsonl
{"id": "q1", "question": "Milkyway-33의 rate limit 정책은?", "expected": "일 13회, 10초 쿨다운", "gold_sources": ["rate_limit.py"]}
{"id": "q2", "question": "어떤 벡터DB를 쓰나?", "expected": "Qdrant", "gold_sources": ["phase-0"]}
```
- `gold_sources`: 검색이 맞춘 출처인지 비교(retrieval 평가용).
- `expected`: 답변 정확도(LLM-judge) 기준.

## 2.2 Retrieval 지표 — `eval/metrics.py`
```python
def recall_at_k(retrieved: list[str], gold: list[str], k: int) -> float:
    top = set(retrieved[:k])
    return len(top & set(gold)) / max(1, len(gold))

def precision_at_k(retrieved: list[str], gold: list[str], k: int) -> float:
    top = retrieved[:k]
    if not top:
        return 0.0
    return sum(1 for r in top if r in set(gold)) / len(top)

def mrr(retrieved: list[str], gold: list[str]) -> float:
    for i, r in enumerate(retrieved):
        if r in set(gold):
            return 1 / (i + 1)
    return 0.0
```

## 2.3 답변 품질 지표 (LLM-as-judge) — `eval/judge.py`
측정 항목:
- **Groundedness**: 답변이 검색된 컨텍스트에 근거하는가 (0~1)
- **Hallucination rate**: 컨텍스트에 없는 주장 비율
- **Answer correctness**: `expected`와 의미 일치도

```python
JUDGE_PROMPT = """다음을 JSON으로만 채점하라.
질문: {q}
컨텍스트: {ctx}
모델답변: {ans}
기대답변: {expected}

{{"groundedness": 0~1, "correctness": 0~1, "hallucinated": true/false, "reason": "..."}}"""

async def judge(q, ctx, ans, expected) -> dict:
    res = await gemini_service.client.aio.models.generate_content(
        model=gemini_service.model_name,
        contents=JUDGE_PROMPT.format(q=q, ctx=ctx, ans=ans, expected=expected),
    )
    return json.loads(res.text.strip().strip("```json").strip("```"))
```
> 주의: judge 모델은 답변 생성 모델과 **다른/상위 모델**을 쓰면 편향이 준다(예: 생성=flash-lite, judge=flash).

## 2.4 러너 — `eval/run_eval.py`
```python
# 각 질문에 대해: RAG 실행 → retrieval/judge 점수 → 집계
# 출력: reports/2026-06-21T1530.json + 콘솔 요약 표
# 집계 지표: avg recall@5, avg groundedness, hallucination %, avg correctness, 총비용/지연
```
실행:
```bash
cd backend && uv run python -m eval.run_eval --dataset eval/dataset.jsonl
```

## 2.5 A/B 테스트 (프롬프트/모델 비교)
- 같은 `dataset.jsonl`을 변형 A(프롬프트 v1)·B(v2)로 실행 → 지표 diff.
- 승률 = B가 A보다 correctness 높은 질문 비율.
- 비교 축: correctness, groundedness, **비용(token_usage)**, p50/p95 지연.

| variant | recall@5 | groundedness | hallucination | correctness | $/req |
|---|---|---|---|---|---|
| A (flash-lite, prompt v1) | 0.72 | 0.85 | 6% | 0.78 | ... |
| B (flash-lite, prompt v2) | 0.74 | 0.91 | 3% | 0.83 | ... |

## 2.6 회귀 테스트로 고정
- `backend/tests/`(이미 pytest 구성됨)에 **임계값 게이트** 추가:
```python
def test_rag_quality_gate():
    report = load_latest_report()
    assert report["avg_groundedness"] >= 0.80
    assert report["hallucination_rate"] <= 0.10
```
- CI에서 평가셋 일부(스모크 5~10문항)만 돌려 PR 회귀 차단.

## 완료 기준
- [ ] 20문항 이상 평가셋 구축
- [ ] recall@k / groundedness / hallucination / correctness 자동 산출
- [ ] 리포트가 `reports/`에 타임스탬프로 저장
- [ ] A/B 1회 수행 → 더 나은 variant 채택 근거 확보
- [ ] 품질 게이트 테스트가 pytest에 존재

## 다음 단계
→ [Phase 3 — 에이전트](./phase-3-agent.md)
