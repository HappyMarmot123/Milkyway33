# Phase 2 — 평가 & 모델 성능 기능명세서

> 목적: RAG와 모델 응답 품질을 감이 아니라 지표로 관리하고, 변경으로 인한 품질 회귀를 막는다.

---

## 1. 배경과 문제정의

RAG를 붙인 뒤에도 "좋아진 것 같다"는 느낌만으로는 충분하지 않다. 검색 결과가 실제 정답 문서를 포함하는지, 답변이 검색 context에 근거하는지, 모델이 없는 사실을 만들어내는지, prompt 변경으로 비용과 지연이 얼마나 바뀌었는지 수치로 확인할 수 있어야 한다.

Phase 2는 RAG와 모델 설정의 품질을 자동으로 확인하는 평가 체계를 만든다. 핵심은 작은 평가셋에서 시작해, 기능을 바꿀 때마다 같은 질문을 반복 실행하고 결과를 비교하는 것이다.

## 2. 대상 사용자와 사용 시나리오

| 사용자 | 목적 |
|---|---|
| LLM 개발자 | prompt/model/RAG 설정 변경이 품질을 개선했는지 확인 |
| 백엔드 개발자 | 검색 로직 변경이 recall을 떨어뜨리지 않았는지 확인 |
| QA 담당자 | 릴리스 전 주요 질문에 대한 회귀 여부 확인 |

기본 흐름:

1. 개발자는 `backend/eval/dataset.jsonl`에 질문, 기대답변, 정답 출처를 작성한다.
2. `cd backend && uv run python -m eval.run_eval --dataset eval/dataset.jsonl --variant rag_prompt_v1`을 실행한다.
3. 러너는 각 질문에 대해 retrieval과 answer generation을 실행한다.
4. metric 모듈은 recall@k, precision@k, MRR을 계산한다.
5. judge 모듈은 groundedness, correctness, hallucination 여부를 JSON으로 채점한다.
6. 결과는 `backend/eval/reports/<run_id>.json`과 사람이 읽기 쉬운 summary로 저장된다.
7. 다른 prompt/model variant로 다시 실행해 결과를 비교한다.

## 3. 범위

### 포함 범위

- 평가셋 JSONL format
- dataset validation
- retrieval metric 계산
- LLM-as-judge 기반 답변 품질 평가
- variant A/B 비교
- report 저장
- smoke quality gate

### 제외 범위

- production traffic을 대상으로 한 온라인 A/B 테스트
- 사용자별 실험군 배정
- 평가 결과에 따른 자동 모델 교체
- 대규모 observability 플랫폼 연동

## 4. 평가셋 계약

평가셋은 JSONL이다. 한 줄이 하나의 평가 케이스다.

```json
{"id":"rag-rate-limit-001","question":"Milkyway-33의 일일 채팅 제한은?","expected_answer":"IP 기준 일일 13회 요청 제한과 쿨다운이 있다.","gold_sources":["backend/app/services/rate_limit.py"],"tags":["ops","baseline"],"difficulty":"easy"}
```

필수 필드:

| 필드 | 설명 |
|---|---|
| `id` | 평가 케이스 고유 ID |
| `question` | 사용자 질문 |
| `expected_answer` | 의미상 포함되어야 할 핵심 답변 |
| `gold_sources` | 검색 결과에 포함되어야 하는 정답 출처 ID/파일/URL |

선택 필드:

| 필드 | 설명 |
|---|---|
| `tags` | `rag`, `ops`, `safety`, `frontend` 같은 분류 |
| `difficulty` | `easy`, `medium`, `hard` |
| `notes` | 채점 시 참고할 설명 |

## 5. 평가 지표

### 5.1 Retrieval 지표

| 지표 | 의미 | 계산 |
|---|---|---|
| recall@k | 정답 출처가 top-k에 포함됐는가 | `정답으로 맞춘 gold 수 / 전체 gold 수` |
| precision@k | top-k 결과 중 정답 비율 | `정답 결과 수 / k` |
| MRR | 첫 정답 출처가 몇 번째에 나왔는가 | `1 / 첫 정답 순위` |

초기 목표:
- recall@5 >= 0.70
- MRR은 추세 관찰
- precision@k는 chunk 중복과 검색 노이즈를 확인하는 보조 지표

### 5.2 답변 품질 지표

| 지표 | 의미 | 초기 목표 |
|---|---|---|
| groundedness | 답변이 검색 context에 근거하는 정도 | 0.80 이상 |
| correctness | 기대답변과 의미가 일치하는 정도 | 0.75 이상 |
| hallucinated | context에 없는 주장을 했는지 | false 비율 90% 이상 |
| citation_valid | citation 번호가 실제 source와 맞는지 | 95% 이상 |

LLM judge는 반드시 JSON만 반환해야 한다.

```json
{"groundedness":0.9,"correctness":0.8,"hallucinated":false,"citation_valid":true,"reason":"답변이 rate_limit.py 내용과 일치한다."}
```

## 6. Report 계약

```json
{
  "run_id": "20260630T120000-rag_prompt_v1",
  "variant": "rag_prompt_v1",
  "model": "gemini-2.5-flash",
  "dataset": "eval/dataset.jsonl",
  "summary": {
    "case_count": 20,
    "avg_recall_at_5": 0.75,
    "avg_groundedness": 0.86,
    "avg_correctness": 0.8,
    "hallucination_rate": 0.05,
    "avg_latency_ms": 2100,
    "total_tokens": 15000
  },
  "cases": [
    {
      "id": "rag-rate-limit-001",
      "question": "Milkyway-33의 일일 채팅 제한은?",
      "retrieved_sources": ["backend/app/services/rate_limit.py"],
      "answer": "일일 제한은 13회입니다.",
      "scores": {
        "recall_at_5": 1,
        "groundedness": 0.9,
        "correctness": 0.8,
        "hallucinated": false
      },
      "latency_ms": 1800,
      "usage_metadata": {"total_token_count": 740}
    }
  ]
}
```

Report는 다음 두 형태로 남긴다.

- JSON: 자동 비교와 품질 gate에 사용
- Markdown summary: 사람이 PR에서 빠르게 확인

## 7. 기능 요구사항

| ID | 요구사항 |
|---|---|
| P2-Data-01 | dataset loader는 JSONL을 읽고 필수 필드 누락을 validation error로 처리한다. |
| P2-Retrieval-01 | 각 케이스마다 retrieved source list를 report에 저장한다. |
| P2-Metric-01 | recall@k, precision@k, MRR을 계산한다. |
| P2-Judge-01 | judge prompt는 JSON만 반환하도록 강제한다. |
| P2-Judge-02 | judge JSON parse 실패 시 1회 재시도한다. |
| P2-AB-01 | 같은 dataset을 두 variant로 실행하고 summary diff를 만든다. |
| P2-Gate-01 | smoke dataset은 로컬에서 빠르게 돌릴 수 있어야 한다. |

## 8. 예외 처리

| 케이스 | 처리 |
|---|---|
| dataset JSON parse 실패 | 실행 시작 전 validation error |
| 필수 필드 누락 | 케이스 ID와 누락 필드를 출력하고 중단 |
| RAG endpoint 실패 | 해당 case를 failed로 기록하고 다음 case 진행 |
| judge quota 초과 | judge_failed로 기록, retrieval metric은 유지 |
| judge JSON parse 실패 | 재시도 후 실패 기록 |
| report 저장 실패 | 콘솔에 summary 출력 후 non-zero exit |

## 9. 테스트 전략

| 테스트 | 검증 내용 |
|---|---|
| `test_eval_dataset.py` | JSONL loader와 validation |
| `test_eval_metrics.py` | recall@k, precision@k, MRR 계산 |
| `test_eval_judge.py` | judge JSON parsing과 retry |
| `test_eval_report.py` | report JSON/Markdown 저장 |
| smoke eval | 5~10개 케이스 실행 |

실제 Gemini judge 호출은 unit test에서 mock 처리한다. API 비용이 드는 end-to-end eval은 수동 명령 또는 별도 CI job으로 분리한다.

## 10. 완료 기준

- [ ] 최소 20개 평가 케이스가 있다.
- [ ] `uv run python -m eval.run_eval --dataset eval/dataset.jsonl`이 report를 생성한다.
- [ ] report summary에 retrieval, quality, latency, token 지표가 포함된다.
- [ ] A/B variant 비교 결과를 볼 수 있다.
- [ ] smoke dataset으로 빠른 회귀 검증이 가능하다.
- [ ] groundedness와 hallucination 지표가 PR 검토에 사용할 정도로 안정적이다.

## 11. 작업 Task 분리

1. `backend/eval` 폴더 구조 생성
2. `dataset.py` 작성: JSONL loader와 validation
3. `metrics.py` 작성: retrieval metric
4. `judge.py` 작성: LLM-as-judge prompt와 parser
5. `run_eval.py` 작성: 케이스 실행 orchestration
6. `report.py` 작성: JSON/Markdown 저장
7. `compare.py` 작성: A/B run summary diff
8. smoke dataset 5~10개 작성
9. pytest 추가

## 12. Phase 1/4와의 연결

Phase 2는 Phase 1 RAG 품질을 수치화하고, Phase 4 모델 라우팅/캐싱/가드레일 변경의 회귀를 감지한다. 예를 들어 semantic cache를 켠 뒤 latency는 줄었지만 correctness가 떨어질 수 있다. 이런 trade-off를 report에서 한 번에 볼 수 있어야 한다.
