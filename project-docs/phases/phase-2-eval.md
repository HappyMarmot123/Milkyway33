# Phase 2 — 평가 & 모델 성능 기능명세서

> 목표: RAG와 모델 응답 품질을 감으로 판단하지 않고, 반복 가능한 지표로 관리한다.
> 한 줄 설명: 같은 질문 세트를 계속 실행해서 검색 품질, 답변 정확도, 환각, 비용, 지연을 비교한다.

---

## 1. 이 기능이 필요한 이유

RAG를 붙였다고 해서 답변 품질이 자동으로 좋아지는 것은 아니다. 다음 문제가 생길 수 있다.

- 검색 결과가 정답 문서를 포함하지 않는다.
- 검색은 맞았지만 답변이 문서와 다르게 나온다.
- citation 번호가 실제 source와 맞지 않는다.
- prompt를 바꿨더니 비용은 늘고 정확도는 떨어진다.
- cache나 model routing을 켠 뒤 품질이 조용히 나빠진다.

Phase 2의 목적은 이런 변화를 숫자로 확인하는 것이다. "좋아 보인다"가 아니라 "recall@5가 0.70에서 0.82로 올랐다"처럼 말할 수 있어야 한다.

---

## 2. 사용자 경험

### 2.1 개발자가 평가를 실행하는 흐름

1. 개발자는 평가 질문을 `backend/eval/dataset.jsonl`에 작성한다.
2. `uv run python -m eval.run_eval --dataset eval/dataset.jsonl --variant rag_prompt_v1`을 실행한다.
3. 평가 러너는 각 질문으로 RAG 검색과 답변 생성을 실행한다.
4. 검색 결과가 정답 출처를 포함하는지 계산한다.
5. 답변이 근거에 맞는지 LLM judge가 평가한다.
6. 결과를 JSON report와 Markdown summary로 저장한다.
7. 다른 prompt/model variant로 다시 실행해 두 결과를 비교한다.

### 2.2 사용 예시

개발자가 RAG prompt를 수정했다고 가정한다.

수정 전:

```bash
uv run python -m eval.run_eval --dataset eval/dataset.jsonl --variant rag_prompt_v1
```

수정 후:

```bash
uv run python -m eval.run_eval --dataset eval/dataset.jsonl --variant rag_prompt_v2
uv run python -m eval.compare --base rag_prompt_v1 --target rag_prompt_v2
```

비교 결과는 다음처럼 보여야 한다.

```text
recall@5:        0.72 -> 0.80 (+0.08)
groundedness:    0.81 -> 0.86 (+0.05)
hallucination:   0.10 -> 0.06 (-0.04)
avg latency:     2100ms -> 2450ms (+350ms)
total tokens:    15,000 -> 18,400 (+3,400)
```

---

## 3. 전체 처리 흐름

```text
dataset.jsonl
  -> dataset validation
  -> 각 질문 실행
  -> retrieval 결과 수집
  -> answer generation 결과 수집
  -> retrieval metric 계산
  -> LLM judge 평가
  -> report 저장
  -> variant 비교
```

평가는 production traffic에 직접 붙지 않는다. 로컬 명령이나 별도 CI job으로 실행한다.

---

## 4. 기능 1: 평가셋 관리

### 목적

반복해서 실행할 질문, 기대답변, 정답 출처를 파일로 관리한다.

### 파일 형식

평가셋은 JSONL이다. 한 줄이 하나의 평가 케이스다.

```json
{"id":"rag-rate-limit-001","question":"Milkyway-33의 일일 채팅 제한은?","expected_answer":"IP 기준 일일 13회 요청 제한과 쿨다운이 있다.","gold_sources":["backend/app/services/rate_limit.py"],"tags":["ops","baseline"],"difficulty":"easy"}
```

### 필수 필드

| 필드 | 설명 |
|---|---|
| `id` | 평가 케이스 고유 ID |
| `question` | 사용자 질문 |
| `expected_answer` | 의미상 포함되어야 할 핵심 답변 |
| `gold_sources` | 검색 결과에 포함되어야 하는 정답 출처 |

### 선택 필드

| 필드 | 설명 |
|---|---|
| `tags` | `rag`, `ops`, `safety`, `frontend` 같은 분류 |
| `difficulty` | `easy`, `medium`, `hard` |
| `notes` | 채점 시 참고할 설명 |

### 검증

평가 실행 전에 전체 dataset을 먼저 검증한다.

| 오류 | 처리 |
|---|---|
| JSON parse 실패 | 몇 번째 줄인지 표시하고 실행 중단 |
| 필수 필드 누락 | case id와 누락 필드 출력 후 중단 |
| id 중복 | 중복 id 목록 출력 후 중단 |
| 빈 질문 | 실행 중단 |

---

## 5. 기능 2: Retrieval 평가

### 목적

RAG 검색이 정답 문서를 찾았는지 확인한다.

### 입력

- 평가 케이스의 `question`
- 평가 케이스의 `gold_sources`
- RAG 검색 결과의 `retrieved_sources`

### 지표

| 지표 | 의미 |
|---|---|
| recall@k | 정답 출처가 top-k 안에 들어왔는가 |
| precision@k | top-k 결과 중 정답 출처 비율 |
| MRR | 첫 번째 정답 출처가 몇 번째에 나왔는가 |

### 초기 목표

| 지표 | 목표 |
|---|---|
| recall@5 | 0.70 이상 |
| MRR | 추세 관찰 |
| precision@5 | 검색 노이즈 확인용 보조 지표 |

recall@5가 낮으면 답변 생성 prompt를 고치기 전에 검색 품질부터 봐야 한다.

---

## 6. 기능 3: 답변 품질 평가

### 목적

모델 답변이 검색 context와 기대답변에 맞는지 평가한다.

### 평가 방식

LLM-as-judge를 사용한다. Judge 모델은 질문, 검색 context, 모델 답변, 기대답변을 보고 JSON으로 점수를 반환한다.

Judge 응답 예시:

```json
{
  "groundedness": 0.9,
  "correctness": 0.8,
  "hallucinated": false,
  "citation_valid": true,
  "reason": "답변이 rate_limit.py 내용과 일치한다."
}
```

### 지표

| 지표 | 의미 | 초기 목표 |
|---|---|---|
| `groundedness` | 답변이 검색 context에 근거하는 정도 | 0.80 이상 |
| `correctness` | 기대답변과 의미가 일치하는 정도 | 0.75 이상 |
| `hallucinated` | context에 없는 주장을 했는지 | false 비율 90% 이상 |
| `citation_valid` | citation 번호가 source와 맞는지 | 95% 이상 |

### 실패 처리

| 상황 | 처리 |
|---|---|
| judge JSON parse 실패 | 1회 재시도 |
| 재시도 후 실패 | 해당 case를 `judge_failed`로 기록 |
| judge quota 초과 | retrieval metric은 유지하고 judge 점수만 실패 처리 |

---

## 7. 기능 4: 평가 실행

### 목적

평가셋 전체를 실행하고 케이스별 결과를 모은다.

### 명령

```bash
cd backend
uv run python -m eval.run_eval --dataset eval/dataset.jsonl --variant rag_prompt_v1
```

### 실행 옵션

| 옵션 | 설명 |
|---|---|
| `--dataset` | 평가셋 경로 |
| `--variant` | prompt/model/retrieval 설정 이름 |
| `--limit` | 일부 케이스만 실행 |
| `--tags` | 특정 tag만 실행 |
| `--output` | report 저장 위치 |

### 케이스 처리 원칙

한 케이스가 실패해도 전체 평가를 중단하지 않는다. 해당 case를 failed로 기록하고 다음 case를 실행한다.

---

## 8. 기능 5: Report 생성

### 목적

평가 결과를 사람이 읽을 수 있고, 자동 비교도 가능한 형태로 저장한다.

### JSON report

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

### Markdown summary

Markdown summary는 PR이나 수동 검토에서 빠르게 보기 위한 문서다.

포함 항목:

- 실행 variant
- dataset 이름
- 전체 case 수
- 주요 평균 지표
- 실패 case 목록
- 이전 run 대비 변화

---

## 9. 기능 6: Variant 비교

### 목적

prompt, model, retrieval 설정 변경이 실제로 좋아졌는지 비교한다.

### 비교 대상

| 비교 항목 | 설명 |
|---|---|
| retrieval 지표 | recall@k, precision@k, MRR |
| 답변 품질 | groundedness, correctness, hallucination |
| 비용 | total token, prompt token, candidate token |
| 지연 | 평균 latency, p95 latency |
| 실패율 | failed case, judge_failed case |

### 판정 예시

| 결과 | 해석 |
|---|---|
| recall 상승, token 소폭 증가 | 개선 가능성 높음 |
| correctness 상승, hallucination 하락 | 좋은 변경 |
| latency 크게 증가, 품질 변화 없음 | 채택 보류 |
| recall 하락 | 검색 로직 회귀 가능성 |

---

## 10. 제외 범위

Phase 2 MVP에서는 다음을 하지 않는다.

- production traffic 온라인 A/B 테스트
- 사용자별 실험군 배정
- 평가 결과에 따른 자동 모델 교체
- 대규모 observability 플랫폼 연동
- 사람이 직접 라벨링하는 리뷰 도구

---

## 11. 테스트 기준

| 테스트 | 확인할 내용 |
|---|---|
| dataset loader | JSONL 읽기와 validation |
| metric 계산 | recall@k, precision@k, MRR |
| judge parser | JSON parsing, retry |
| report writer | JSON/Markdown 저장 |
| compare | 두 run summary diff |
| smoke eval | 5~10개 케이스 빠른 실행 |

실제 Gemini 호출은 unit test에서 mock 처리한다. 비용이 드는 end-to-end 평가는 수동 명령이나 별도 CI job으로 분리한다.

---

## 12. 완료 기준

- [ ] 최소 20개 평가 케이스가 있다.
- [ ] dataset validation이 필수 필드 누락과 JSON 오류를 잡는다.
- [ ] `run_eval` 명령이 JSON report와 Markdown summary를 만든다.
- [ ] retrieval 지표와 답변 품질 지표가 report에 포함된다.
- [ ] judge JSON parse 실패 시 재시도한다.
- [ ] 두 variant의 summary diff를 볼 수 있다.
- [ ] smoke dataset으로 빠른 회귀 검증이 가능하다.

---

## 13. 작업 분리

1. `backend/eval` 폴더 구조 생성
2. `dataset.py` 작성
3. `metrics.py` 작성
4. `judge.py` 작성
5. `run_eval.py` 작성
6. `report.py` 작성
7. `compare.py` 작성
8. smoke dataset 작성
9. pytest 추가

---

## 14. 다른 Phase와 연결

Phase 2는 Phase 1 RAG 품질을 검증하고, Phase 4 운영 기능의 회귀를 잡는다.

예를 들어 semantic cache를 켠 뒤 latency는 줄었지만 correctness가 떨어질 수 있다. 이런 trade-off를 평가 report에서 확인해야 한다.
