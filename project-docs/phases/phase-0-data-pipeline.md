# Phase 0 — 데이터 파이프라인 기능명세서

> 목적: RAG가 검색할 수 있는 문서 컬렉션을 오프라인에서 만들고 Qdrant에 안정적으로 적재한다.
> 이 문서는 "무슨 파일을 만들지"보다 먼저, 어떤 사용자 문제를 해결하고 어떤 상태가 완료인지 설명한다.

---

## 1. 배경과 문제정의

Milkyway-33은 현재 Gemini 기반 스트리밍 채팅은 구현되어 있지만, 모델이 답변 전에 참고할 수 있는 외부 지식 저장소가 없다. 사용자가 프로젝트 문서, 기술 문서, 운영 정책을 물어보면 모델은 대화 history와 일반 지식에만 의존한다. 이 상태에서는 다음 문제가 생긴다.

- 답변이 실제 프로젝트 코드/문서와 어긋날 수 있다.
- 답변 근거가 없어서 사용자가 신뢰하기 어렵다.
- 같은 질문을 해도 어떤 문서를 참고했는지 확인할 수 없다.
- Phase 1 RAG API를 구현해도 검색할 데이터가 없으면 검증할 수 없다.

Phase 0의 목표는 "검색 가능한 도서관"을 먼저 만드는 것이다. 웹페이지나 문서에서 본문을 수집하고, 불필요한 텍스트와 민감정보를 정리하고, 검색하기 좋은 chunk로 나눈 뒤, embedding vector와 metadata를 VectorDB에 넣는다.

중요한 제약은 Vercel serverless 함수의 실행 시간이다. 크롤링, 대량 정제, batch embedding은 오래 걸릴 수 있으므로 `/api/v1/chat` 요청 안에서 실행하면 안 된다. Phase 0은 반드시 로컬 CLI 또는 별도 batch job으로 실행되는 오프라인 파이프라인이어야 한다.

## 2. 대상 사용자와 사용 시나리오

### 2.1 주요 사용자

| 사용자 | 목적 |
|---|---|
| 개발자 | RAG 검색 대상 문서를 수집하고 Qdrant에 적재한다. |
| LLM/RAG 실험자 | chunk size, overlap, 정제 규칙을 바꿔 검색 품질을 비교한다. |
| 운영자 | 파이프라인 실행 결과를 보고 실패 URL, 적재 건수, 중복 여부를 확인한다. |

### 2.2 기본 사용 흐름

1. 개발자는 `backend/pipeline/urls.txt`에 수집 대상 URL을 한 줄에 하나씩 작성한다.
2. `backend/.env`에 `GOOGLE_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`를 설정한다.
3. `cd backend && uv run python -m pipeline.run --urls pipeline/urls.txt`를 실행한다.
4. 파이프라인은 URL별 HTML을 가져와 본문을 추출하고 `backend/data/bronze/`에 저장한다.
5. 정제 단계는 본문을 normalize하고, 보일러플레이트와 PII를 제거한 뒤 `backend/data/silver/`에 저장한다.
6. 청킹 단계는 정제 문서를 검색 단위 chunk로 나누고 `backend/data/gold/chunks.jsonl`에 저장한다.
7. embedding 단계는 chunk text를 Gemini embedding model로 vector화한다.
8. 적재 단계는 Qdrant `milkyway_docs` 컬렉션을 확인/생성하고 chunk vector를 upsert한다.
9. 실행이 끝나면 `backend/data/reports/pipeline-<run_id>.json`에 결과 리포트가 남는다.

### 2.3 재실행 흐름

같은 URL 목록으로 파이프라인을 다시 실행하면 동일 문서와 동일 chunk는 같은 id를 가져야 한다. Qdrant는 insert가 아니라 upsert로 처리되므로, 같은 문서가 중복으로 쌓이지 않아야 한다. 이것은 RAG 검색 결과가 중복 chunk로 도배되는 문제를 막기 위한 핵심 요구사항이다.

## 3. 범위

### 3.1 포함 범위

- URL 목록 기반 웹 문서 수집
- 정적 HTML 본문 추출
- Bronze/Silver/Gold 중간 산출물 저장
- 텍스트 정규화
- 보일러플레이트 제거
- 이메일, 전화번호, 주민등록번호, API key 형태 PII 마스킹
- 중복 문서 제거
- chunk 생성과 metadata 부여
- Gemini embedding 생성
- Qdrant collection 생성과 vector upsert
- 실행 리포트 생성
- pytest 기반 unit/smoke test

### 3.2 제외 범위

- 사용자가 브라우저에서 직접 파일을 업로드하는 기능
- 실시간 채팅 중 URL을 크롤링하는 기능
- 로그인 뒤 접근 가능한 비공개 문서 수집
- robots.txt 정책 자동 해석의 완전한 구현
- 대규모 스케줄러(Prefect, Dagster 등) 도입
- GraphRAG용 entity/relation 추출

제외 범위는 기능 가치가 없다는 뜻이 아니다. Phase 0 MVP에서는 RAG 검색용 데이터 기반을 먼저 만드는 것이 목표이므로 후속 Phase로 분리한다.

## 4. 시스템 경계와 실행 환경

### 4.1 실행 위치

Phase 0 파이프라인은 FastAPI 서버가 아니라 Python CLI로 실행한다.

```bash
cd backend
uv run python -m pipeline.run --urls pipeline/urls.txt
```

### 4.2 생성/수정 파일

| 파일 | 책임 |
|---|---|
| `backend/pipeline/crawl.py` | URL fetch, 본문 추출, Bronze 저장 |
| `backend/pipeline/clean.py` | normalize, boilerplate 제거, PII 마스킹, Silver 저장 |
| `backend/pipeline/chunk.py` | chunk 생성, Gold JSONL 저장 |
| `backend/pipeline/embed.py` | Gemini embedding batch 호출과 retry |
| `backend/pipeline/load.py` | Qdrant collection 확인/생성, upsert |
| `backend/pipeline/report.py` | 실행 결과 리포트 모델과 파일 저장 |
| `backend/pipeline/run.py` | 전체 단계 orchestration |
| `backend/app/core/config.py` | Qdrant/embedding 환경변수 추가 |
| `backend/.gitignore` | `data/` 산출물 ignore |

### 4.3 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `GOOGLE_API_KEY` | 예 | 없음 | Gemini embedding API 호출 |
| `QDRANT_URL` | 예 | `http://localhost:6333` | Qdrant REST endpoint |
| `QDRANT_API_KEY` | 클라우드 사용 시 예 | 없음 | Qdrant Cloud API key |
| `QDRANT_COLLECTION` | 아니오 | `milkyway_docs` | 적재 대상 컬렉션 |
| `EMBEDDING_MODEL_NAME` | 아니오 | `text-embedding-004` | embedding model |

## 5. 데이터 흐름

```text
urls.txt
  -> crawl.py
  -> data/bronze/*.json
  -> clean.py
  -> data/silver/*.json
  -> chunk.py
  -> data/gold/chunks.jsonl
  -> embed.py
  -> load.py
  -> Qdrant collection: milkyway_docs
  -> reports/pipeline-<run_id>.json
```

각 단계는 이전 단계의 산출물을 읽고 다음 단계 산출물을 만든다. 중간 산출물을 파일로 남기는 이유는 다음과 같다.

- 실패한 단계부터 다시 실행할 수 있다.
- 정제 결과와 chunk 결과를 사람이 샘플 검수할 수 있다.
- embedding 비용을 쓰기 전에 데이터 품질을 확인할 수 있다.
- 나중에 chunking 전략을 바꿔도 Bronze/Silver를 재활용할 수 있다.

## 6. 데이터 계약

### 6.1 Bronze 문서

Bronze는 수집 직후의 원천 문서다. 원문을 보존해 재처리할 수 있어야 한다.

```json
{
  "id": "2c26b46b68ffc68f",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "raw_text": "추출된 원문 본문",
  "fetched_at": "2026-06-30T00:00:00Z",
  "content_hash": "sha256-prefix"
}
```

필드 설명:

| 필드 | 설명 |
|---|---|
| `id` | URL 기반 deterministic id. 같은 URL은 항상 같은 id |
| `source_url` | 원본 URL |
| `title` | HTML title 또는 URL fallback |
| `raw_text` | 본문 추출 결과 |
| `fetched_at` | UTC ISO timestamp |
| `content_hash` | 원문 텍스트 hash. 변경 감지와 중복 판단에 사용 |

### 6.2 Silver 문서

Silver는 검색/청킹 전에 정제된 문서다.

```json
{
  "id": "2c26b46b68ffc68f",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "clean_text": "정제된 본문",
  "pii_masked": true,
  "language": "ko",
  "content_hash": "clean-sha256-prefix"
}
```

Silver 단계에서는 `clean_text`가 사람이 읽을 수 있는 본문이어야 한다. 메뉴, 로그인, 저작권, 광고, 과도한 줄바꿈이 남아 있으면 실패로 본다.

### 6.3 Gold chunk

Gold는 VectorDB 적재 직전의 검색 단위다.

```json
{
  "id": "2c26b46b68ffc68f:0:f9c2a81d4f3e",
  "document_id": "2c26b46b68ffc68f",
  "chunk_index": 0,
  "text": "검색 대상 chunk 본문",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "token_count_estimate": 512,
  "metadata": {
    "pipeline_version": "0.1.0"
  }
}
```

Gold id는 `document_id:chunk_index:text_hash` 형식이다. chunk text가 변하면 id도 변한다. 같은 문서와 같은 chunking 설정으로 재실행하면 같은 id가 나와야 한다.

### 6.4 Qdrant payload

Qdrant에는 vector와 함께 citation에 필요한 payload를 저장한다.

```json
{
  "document_id": "2c26b46b68ffc68f",
  "chunk_id": "2c26b46b68ffc68f:0:f9c2a81d4f3e",
  "text": "검색 대상 chunk 본문",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "chunk_index": 0,
  "pipeline_version": "0.1.0"
}
```

Phase 1 RAG 응답의 source card는 이 payload를 사용한다. 따라서 `text`, `source_url`, `title`, `chunk_id`는 필수다.

## 7. 상세 기능 요구사항

### 7.1 수집

| ID | 요구사항 | 설명 |
|---|---|---|
| P0-Crawl-01 | URL 목록을 한 줄 단위로 읽는다. | 빈 줄과 `#` 주석은 무시한다. |
| P0-Crawl-02 | URL 하나의 실패가 전체 실행을 중단하지 않는다. | 실패 URL은 report에 `stage=crawl`로 기록한다. |
| P0-Crawl-03 | 본문이 비어 있으면 Bronze를 만들지 않는다. | JS 렌더링 페이지는 `empty_content`로 기록한다. |
| P0-Crawl-04 | 요청에는 명시적 User-Agent를 사용한다. | 예: `Milkyway33Bot/0.1` |
| P0-Crawl-05 | 요청 사이에는 기본 delay를 둔다. | 기본 0.7초. 사이트 부하 방지 목적 |

### 7.2 정제

| ID | 요구사항 | 설명 |
|---|---|---|
| P0-Clean-01 | Unicode normalize를 수행한다. | 서로 다른 코드 포인트의 같은 문자를 통일 |
| P0-Clean-02 | 제어문자와 과도한 줄바꿈을 제거한다. | 읽기 어려운 raw text 방지 |
| P0-Clean-03 | 반복 보일러플레이트를 제거한다. | 로그인, 회원가입, 저작권, 쿠키 배너 등 |
| P0-Clean-04 | PII를 마스킹한다. | 이메일, 전화번호, 주민번호, API key |
| P0-Clean-05 | 최소 길이와 한국어 비율을 검사한다. | 너무 짧거나 무관한 문서 제외 |
| P0-Clean-06 | content hash 기반 중복 제거를 수행한다. | 같은 본문이 여러 URL에 있을 때 중복 적재 방지 |

### 7.3 청킹

| ID | 요구사항 | 설명 |
|---|---|---|
| P0-Chunk-01 | 기본 chunk size는 512 token estimate다. | 초기값이며 CLI 옵션으로 조정 가능 |
| P0-Chunk-02 | 기본 overlap은 80 token estimate다. | 경계에 걸친 문맥 손실 완화 |
| P0-Chunk-03 | chunk metadata에 source URL과 title을 보존한다. | citation 표시용 |
| P0-Chunk-04 | chunk id는 deterministic해야 한다. | 재실행 멱등성 보장 |

### 7.4 임베딩

| ID | 요구사항 | 설명 |
|---|---|---|
| P0-Embed-01 | chunk text 목록을 batch로 embedding한다. | 기본 batch size 100 |
| P0-Embed-02 | 빈 chunk 목록이면 API를 호출하지 않는다. | 불필요한 외부 호출 방지 |
| P0-Embed-03 | 429/timeout은 지수 백오프로 재시도한다. | 일시 장애 대응 |
| P0-Embed-04 | embedding dimension을 적재 전에 확인한다. | Qdrant collection dimension mismatch 방지 |

### 7.5 적재

| ID | 요구사항 | 설명 |
|---|---|---|
| P0-Load-01 | Qdrant는 REST로 연결한다. | `prefer_grpc=False` |
| P0-Load-02 | collection이 없으면 생성한다. | dimension 768, distance cosine |
| P0-Load-03 | point id는 chunk id와 동일하게 사용한다. | upsert 멱등성 |
| P0-Load-04 | chunks와 vectors 길이가 다르면 적재를 중단한다. | 잘못된 pair 방지 |
| P0-Load-05 | upsert 결과 건수를 report에 기록한다. | 운영 확인용 |

## 8. 예외 처리와 실패 복구

| 실패 | 사용자/개발자에게 보이는 결과 | 복구 방법 |
|---|---|---|
| 특정 URL fetch 실패 | report에 URL과 HTTP/error 기록 | URL 수정 후 재실행 |
| 본문 추출 결과 없음 | `empty_content`로 기록 | Playwright 수집 옵션을 별도 Task로 추가 |
| PII 정규식 과탐 | 마스킹된 sample 검수 필요 | allow rule 또는 정규식 조정 |
| embedding quota 초과 | retry 후 실패 stage 기록 | batch size 축소, 시간 두고 재실행 |
| Qdrant 인증 실패 | load stage 실패 | `.env`의 URL/API key 확인 |
| dimension mismatch | 적재 중단 | collection 재생성 또는 embedding model 확인 |

파이프라인은 가능한 한 중간 산출물을 보존해야 한다. 예를 들어 Qdrant 적재가 실패해도 `gold/chunks.jsonl`은 남아야 하며, 개발자는 인증 정보를 수정한 뒤 적재 단계만 재실행할 수 있어야 한다.

## 9. 보안과 개인정보

- `backend/data/`는 git에 커밋하지 않는다.
- Bronze에는 raw text가 들어가므로 PII가 남아 있을 수 있다.
- 외부 공유나 샘플 제출에는 Silver 또는 Gold를 사용한다.
- API key 형태의 문자열은 정제 단계에서 `[API_KEY]`로 마스킹한다.
- 비공개 문서, 로그인 필요 페이지, 개인정보가 포함된 페이지는 기본 수집 대상이 아니다.

## 10. 테스트 전략

| 테스트 | 검증 내용 |
|---|---|
| `test_pipeline_ids.py` | document/chunk id deterministic 여부 |
| `test_pipeline_clean.py` | normalize, boilerplate 제거, PII 마스킹 |
| `test_pipeline_chunk.py` | chunk size/overlap, metadata 생성 |
| `test_pipeline_embed.py` | batch 분리, embedding response parsing, retry |
| `test_pipeline_load.py` | payload 구성, collection 생성, upsert 호출 |
| `test_pipeline_report.py` | report JSON 저장 |
| smoke test | 작은 URL 1~3개로 end-to-end 실행 |

외부 서비스가 필요한 Qdrant/Gemini 통합 테스트는 기본 unit test와 분리한다. 로컬 CI에서는 mock client를 사용하고, 실제 클라우드 연결은 수동 smoke test로 검증한다.

## 11. 완료 기준

- [ ] `backend/pipeline` 모듈이 stage별로 분리되어 있다.
- [ ] `backend/data/`가 git ignore되어 있다.
- [ ] Bronze/Silver/Gold 산출물이 명세된 JSON 구조를 따른다.
- [ ] 동일 URL 목록 재실행 시 Qdrant point가 중복 증가하지 않는다.
- [ ] PII 샘플이 `[EMAIL]`, `[PHONE_KR]`, `[RRN]`, `[API_KEY]`로 마스킹된다.
- [ ] Qdrant collection이 cosine distance와 올바른 vector dimension으로 생성된다.
- [ ] 실행 report에 요청 URL 수, 성공/실패/제외/적재 건수가 포함된다.
- [ ] pipeline unit test와 smoke test가 통과한다.

## 12. 작업 Task 분리

1. 파이프라인 골격 생성: `pipeline/__init__.py`, `paths.py`, `ids.py`
2. `.gitignore`에 `backend/data/` 추가
3. `crawl.py` 구현: URL 읽기, fetch, 본문 추출, Bronze 저장
4. `clean.py` 구현: normalize, boilerplate 제거, PII 마스킹, Silver 저장
5. `chunk.py` 구현: chunk 생성, Gold JSONL 저장
6. `embed.py` 구현: Gemini embedding batch/retry
7. `load.py` 구현: Qdrant collection 생성, payload 구성, upsert
8. `report.py` 구현: stage별 count/failure report
9. `run.py` 구현: CLI orchestration
10. pytest unit/smoke test 추가
11. README 또는 phase 문서에 실행 명령과 환경변수 갱신

## 13. 다음 Phase와의 연결

Phase 1 RAG 코어는 Qdrant payload의 `text`, `source_url`, `title`, `chunk_id`, `score`를 사용해 `sources` 이벤트를 만든다. 따라서 Phase 0의 데이터 계약이 흔들리면 Phase 1의 citation 표시가 깨진다. Phase 0 구현 중 payload 필드를 바꿔야 한다면 Phase 1 문서와 타입도 함께 갱신해야 한다.
