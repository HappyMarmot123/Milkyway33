# Milkyway-33 — LLM 엔지니어링 기능 로드맵

> LLM 개발자가 반드시 경험해봐야 하는 기능들을, **현재 Milkyway-33 스택(Vercel 서버리스 + FastAPI + Gemini + Upstash)** 위에서 구현 가능한 형태로 구체화한 문서.
> 작성일: 2026-06-21

## 📑 상세 구현 문서 (Phase별)

각 페이즈는 현재 코드 기준의 파일 경로·기능 요구사항·API/데이터 계약·예외 처리·완료 기준·작업 Task까지 포함한 상세 기능명세 문서가 있다.

| Phase | 문서 | 핵심 산출물 |
|---|---|---|
| 0 | [데이터 파이프라인](./phases/phase-0-data-pipeline.md) | Qdrant에 적재된 임베딩 |
| 1 | [RAG 코어](./phases/phase-1-rag-core.md) | citation 달린 답변 스트리밍 |
| 2 | [평가 & 모델 성능](./phases/phase-2-eval.md) | recall/groundedness 자동 측정 |
| 3 | [에이전트](./phases/phase-3-agent.md) | ReAct + planner + HITL |
| 4 | [운영 & 안전성](./phases/phase-4-ops-safety.md) | 캐싱·라우팅·guardrail 강화 |
| 5 | [개발자 도구 & 고급](./phases/phase-5-devtools.md) | playground·trace·GraphRAG |

---

## 0. 현재 구현 현황 (Baseline)

| 영역 | 구현 위치 | 상태 |
|---|---|---|
| 스트리밍 채팅 (Gemini SSE) | `backend/app/services/gemini.py` | ✅ |
| Rate limit / quota | `backend/app/services/rate_limit.py` (일 13회 + 10s 쿨다운) | ✅ |
| 공유 토큰/비용 추적 | `backend/app/services/token_usage.py` (Upstash Redis Hash) | ✅ |
| Prompt injection 방어 | `backend/app/services/guardrail.py` (정규식 기반) | 🟡 기초 |
| 대화 저장/제목 자동생성/export | Dexie(IndexedDB) + `/chat/summarize` | ✅ |
| 모델 설정(temperature/top_p 등) | `src/components/ai-elements/*` | ✅ |
| RAG/Agent **UI 스캐폴딩** | `sources`, `inline-citation`, `plan`, `task`, `tool`, `chain-of-thought`, `confirmation` | 🟡 UI만 존재, 백엔드 미구현 |

**핵심**: 출처표시·에이전트·승인 UI는 이미 있고, 이를 채울 **백엔드 로직**이 다음 단계의 주 작업이다.

### 인프라 결정: VectorDB
- **1순위: Qdrant Cloud (무료 1GB)** — 업계 표준, 하이브리드 검색 지원, 셀프호스팅 이전 가능. 서버리스에선 **REST 사용**(`prefer_grpc=False`), 클라이언트 전역 1회 생성·재사용.
- **대안: Upstash Vector** — 이미 Upstash Redis 사용 중 → 운영 통합, HTTP 전용으로 연결풀 문제 없음, dense+sparse 하이브리드 내장.
- 제약: Vercel 함수는 수명이 짧아 **연결풀을 유지 못 함** → HTTP/REST 기반 DB가 필수.

---

## Phase 0 — 데이터 파이프라인 (RAG의 토대)

데이터 품질이 RAG 품질의 상한이다. "정제되지 않은 데이터를 넣으면 정제되지 않은 답이 나온다."

### 0.1 크롤링 / 데이터 수집
- **목표**: 웹페이지·문서·API에서 원천 데이터 확보.
- **구현**: 별도 수집 스크립트(`backend/pipeline/crawl.py`) — `httpx` + `selectolax`/`trafilatura`로 본문 추출. Vercel 함수가 아닌 **로컬/배치 또는 Cron**으로 실행(서버리스 60s 제한 회피).
- **검증**: 수집 건수, 실패 URL 로그, robots.txt 준수.

### 0.2 데이터 티어 정리 (Bronze → Silver → Gold)
- **Bronze(원천)**: 크롤링 원본 그대로 저장(불변, 재처리 가능하도록).
- **Silver(정제)**: 중복 제거·정규화·PII 마스킹된 텍스트.
- **Gold(탑재용)**: 청킹 + 메타데이터 + 임베딩 직전 형태.
- **저장**: Bronze는 객체 스토리지/JSONL, Gold는 VectorDB.

### 0.3 데이터 정제
- 중복 제거(해시/MinHash), 보일러플레이트 제거, 언어 필터, 길이 필터, **PII 마스킹**(0.4 재사용).
- **검증**: 정제 전후 토큰 수·문서 수 비교, 샘플 수동 검수.

### 0.4 청킹 (Chunking)
- PDF/Markdown/HTML → 의미 단위 chunk. 고정 크기(예: 512 토큰) + **오버랩(50~100 토큰)**, 가능하면 문단/헤더 경계 기준.
- 각 chunk에 메타데이터: `source_url`, `title`, `chunk_index`, `created_at`.

### 0.5 임베딩 + 벡터 탑재
- Gemini `text-embedding-004`(무료 친화) 또는 Upstash 내장 임베딩.
- 배치 임베딩 후 VectorDB upsert. **id는 결정적 해시**로 → 재실행 시 중복 방지.

---

## Phase 1 — RAG 코어

### 1.1 임베딩 + 벡터 검색
- query 임베딩 → VectorDB top-k 검색. **코사인 유사도** 기준(Qdrant `Distance.COSINE`).
- **개념 정리**: 코사인 유사도 = 두 벡터의 방향 유사성(`cos θ = A·B / |A||B|`). 크기 무관·방향만 보므로 문서 길이 영향 적음.

### 1.2 RAG 답변 생성 + Citation
- 검색된 context를 프롬프트에 주입, **출처 번호 [1][2]** 부여 → 프론트 `sources.tsx`/`inline-citation`에 연결.
- **구현**: `backend/app/services/rag.py` + `/api/v1/rag/query` 엔드포인트.

### 1.3 Hybrid Search
- 벡터 검색(의미) + 키워드 검색(BM25/sparse) 조합 후 **RRF(Reciprocal Rank Fusion)** 로 재정렬.
- 실서비스 정확도에 크게 기여. Qdrant/Upstash Vector 하이브리드 기능 활용.

---

## Phase 2 — 평가 & 모델 성능 파악

### 2.1 RAG 평가
- 지표: **groundedness**(답이 context에 근거?), **hallucination rate**, **retrieval recall/precision@k**, 답변 정확도.
- 방법: LLM-as-judge + 정답셋. `backend/eval/` 에 데이터셋·러너 구성.

### 2.2 모델 성능 파악 / A/B 테스트
- 같은 입력에 모델/프롬프트 변형(v1/v2)을 돌려 **승률·비용·지연** 비교.
- 회귀 방지용 eval 데이터셋(입력·기대출력·채점기준) 버전 관리.

---

## Phase 3 — 에이전트

### 3.1 ReAct 루프
- 생각 → 도구 호출 → 관찰 → 다음 행동. `chain-of-thought.tsx`/`tool.tsx`에 시각화.

### 3.2 Planner / Executor 분리
- planner가 작업 목록 생성 → executor가 단계 수행. `plan.tsx`/`task.tsx` 연결.

### 3.3 장기 작업 상태 관리
- todo/plan/progress를 **Upstash Redis**에 저장 → 실패 복구·이어서 실행. (서버리스 상태유지의 핵심)

### 3.4 Human-in-the-loop 승인
- 파일 삭제·결제·이메일 등 위험 행동 전 사용자 승인. `confirmation.tsx` 활용.

### 3.5 Multi-agent
- researcher / coder / reviewer 역할 분리 협업.

---

## Phase 4 — 운영 & 안전성 고도화

### 4.1 시맨틱 캐싱
- 유사 질문/임베딩/검색 결과 캐싱 → 비용 절감. **이미 쓰는 Upstash Redis 재활용**.

### 4.2 모델 라우팅
- 쉬운 요청 → 저렴한 모델(flash-lite), 어려운 요청 → 강한 모델. 분류기 또는 휴리스틱.

### 4.3 Guardrail 강화 (현재 정규식 → 고도화)
- Prompt injection 방어(RAG 문서/웹페이지의 "이전 지시 무시" 무력화), **PII/비밀정보 탐지·마스킹**, moderation(입출력 정책 검사).

### 4.4 응답 검증기 / 실패 복구
- LLM 출력을 별도 verifier가 검사, 코드/SQL/JSON은 실행 전 검증.
- timeout·rate limit·JSON parse error·tool failure **재시도 전략**.

---

## Phase 5 — 개발자 도구 & 고급

### 5.1 Prompt Playground
- 프롬프트·모델·temperature·top_p 바꿔가며 비교.

### 5.2 Trace Viewer
- 모델 호출·tool call·retrieval 결과·token usage를 한 화면에서. (token_usage 인프라 확장)

### 5.3 Fine-tuning 데이터 생성
- 좋은 대화 로그 정제 → 학습 데이터 형태로 변환.

### 5.4 그래프 설계 / 구현
- **지식 그래프**(엔티티·관계 추출 → GraphRAG) 또는 데이터 파이프라인 **DAG**(의존성 그래프). 검색 품질·설명가능성 향상.

---

## 권장 진행 순서

1. **Phase 0 → 1** 먼저 (VectorDB 셋업 + 최소 RAG + citation). 이미 있는 `sources.tsx`가 바로 살아난다.
2. **Phase 2** 평가 붙여서 품질 측정 가능하게.
3. 이후 **Phase 3(에이전트)** / **Phase 4(운영)** 는 관심사에 따라 병행.
4. Phase 5는 개발 생산성 도구로 상시 보강.
