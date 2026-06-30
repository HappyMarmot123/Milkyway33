# Phase 0 — 데이터 파이프라인 기능명세서

> 목표: RAG가 검색할 수 있는 문서 데이터를 만든다.
> 한 줄 설명: URL 목록을 입력하면 문서를 수집하고, 정제하고, chunk로 나누고, embedding을 만든 뒤 Qdrant에 적재한다.

---

## 1. 이 기능이 필요한 이유

현재 Milkyway-33은 Gemini와 대화할 수 있지만, Gemini가 프로젝트 문서나 외부 문서를 직접 검색하지는 않는다. 사용자가 "이 프로젝트의 rate limit 정책이 뭐야?"라고 물어도 모델은 실제 문서를 찾아보지 않는다.

RAG를 만들려면 먼저 검색할 문서 창고가 필요하다. Phase 0은 그 문서 창고를 만드는 작업이다.

Phase 0이 끝나면 다음 상태가 되어야 한다.

- 개발자가 정한 URL 목록에서 문서 본문을 수집할 수 있다.
- 수집한 문서에서 메뉴, 광고, 중복, 개인정보를 제거할 수 있다.
- 긴 문서를 검색하기 좋은 작은 chunk로 나눌 수 있다.
- chunk마다 embedding vector를 만들 수 있다.
- Qdrant에 vector와 출처 정보를 함께 저장할 수 있다.
- 같은 파이프라인을 다시 실행해도 중복 데이터가 쌓이지 않는다.

---

## 2. 사용자와 사용 상황

### 2.1 주요 사용자

| 사용자 | 이 기능으로 하고 싶은 일 |
|---|---|
| 개발자 | RAG 검색 대상 문서를 Qdrant에 적재한다. |
| LLM/RAG 실험자 | chunk size, overlap, 정제 규칙을 바꿔 검색 품질을 비교한다. |
| 운영자 | 수집 실패 URL, 적재 건수, 중복 제거 결과를 확인한다. |

### 2.2 대표 사용 시나리오

개발자는 `backend/pipeline/urls.txt`에 수집할 URL을 적는다.

```text
https://example.com/docs/overview
https://example.com/docs/rag
https://example.com/docs/deploy
```

그 다음 다음 명령을 실행한다.

```bash
cd backend
uv run python -m pipeline.run --urls pipeline/urls.txt
```

실행 결과로 다음이 생긴다.

| 결과물 | 설명 |
|---|---|
| `backend/data/bronze/*.json` | 수집 직후 원본 문서 |
| `backend/data/silver/*.json` | 정제된 문서 |
| `backend/data/gold/chunks.jsonl` | embedding 직전 chunk 목록 |
| Qdrant `milkyway_docs` collection | vector 검색 대상 데이터 |
| `backend/data/reports/pipeline-<run_id>.json` | 실행 결과 보고서 |

---

## 3. 전체 흐름

```text
urls.txt
  -> 1. 수집
  -> 2. 정제
  -> 3. 청킹
  -> 4. 임베딩
  -> 5. Qdrant 적재
  -> 6. 리포트 생성
```

각 단계는 앞 단계 결과물을 읽고 다음 단계 결과물을 만든다. 중간 결과물을 파일로 남기는 이유는 문제가 생겼을 때 처음부터 다시 하지 않기 위해서다.

예를 들어 Qdrant 인증이 실패해도 이미 만든 `chunks.jsonl`은 남아 있어야 한다. 개발자는 인증 정보를 고친 뒤 적재 단계만 다시 실행할 수 있어야 한다.

---

## 4. 기능 1: URL 문서 수집

### 목적

URL 목록에서 HTML을 가져오고, 사람이 읽을 수 있는 본문을 추출해 Bronze 문서로 저장한다.

### 입력

- `backend/pipeline/urls.txt`
- 한 줄에 URL 하나
- 빈 줄과 `#` 주석은 무시한다.

### 처리

1. URL 목록을 읽는다.
2. 각 URL에 HTTP GET 요청을 보낸다.
3. HTML title과 본문 텍스트를 추출한다.
4. 본문이 비어 있으면 저장하지 않고 실패 사유를 기록한다.
5. 성공한 문서는 `backend/data/bronze/`에 저장한다.

### 출력

Bronze 문서 예시:

```json
{
  "id": "doc_2c26b46b68ff",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "raw_text": "수집된 본문 텍스트",
  "fetched_at": "2026-06-30T00:00:00Z",
  "content_hash": "sha256-prefix"
}
```

### 실패 처리

| 실패 상황 | 처리 |
|---|---|
| URL 접속 실패 | report에 URL, stage=`crawl`, error 기록 |
| HTTP 404/500 | report에 status code 기록 |
| 본문 추출 실패 | `empty_content`로 기록 |
| 특정 URL 실패 | 전체 실행은 계속 진행 |

---

## 5. 기능 2: 문서 정제

### 목적

수집된 원문에서 검색에 방해되는 텍스트와 민감정보를 제거한다.

### 입력

- `backend/data/bronze/*.json`

### 처리

1. Unicode를 정규화한다.
2. 과도한 줄바꿈과 제어문자를 제거한다.
3. 반복되는 메뉴, 로그인, 저작권, 쿠키 배너 문구를 제거한다.
4. 이메일, 전화번호, 주민등록번호, API key 형태 문자열을 마스킹한다.
5. 너무 짧은 문서나 의미 없는 문서는 제외한다.
6. content hash로 중복 문서를 제거한다.

### 출력

Silver 문서 예시:

```json
{
  "id": "doc_2c26b46b68ff",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "clean_text": "정제된 본문 텍스트",
  "pii_masked": true,
  "language": "ko",
  "content_hash": "clean-sha256-prefix"
}
```

### 성공 기준

정제된 `clean_text`만 읽어도 문서 본문으로 이해되어야 한다. 메뉴, 광고, 반복 footer가 많이 남아 있으면 실패로 본다.

---

## 6. 기능 3: 문서 청킹

### 목적

긴 문서를 검색에 적합한 작은 단위로 나눈다.

RAG 검색은 보통 문서 전체가 아니라 작은 chunk 단위로 동작한다. 너무 큰 chunk는 불필요한 문맥을 많이 포함하고, 너무 작은 chunk는 의미가 잘린다.

### 입력

- `backend/data/silver/*.json`

### 처리

1. 정제된 본문을 문단 기준으로 읽는다.
2. 기본 512 token estimate 단위로 chunk를 만든다.
3. 문맥이 끊기지 않도록 기본 80 token estimate overlap을 둔다.
4. 각 chunk에 원문 URL, 제목, chunk index를 붙인다.
5. chunk id를 deterministic하게 만든다.

### 출력

Gold chunk 예시:

```json
{
  "id": "doc_2c26b46b68ff:0:f9c2a81d",
  "document_id": "doc_2c26b46b68ff",
  "chunk_index": 0,
  "text": "검색 대상 chunk 본문",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "token_count_estimate": 512
}
```

### 핵심 요구사항

같은 문서와 같은 chunk 설정으로 다시 실행하면 같은 chunk id가 나와야 한다. 그래야 Qdrant upsert가 중복 insert가 아니라 갱신으로 동작한다.

---

## 7. 기능 4: 임베딩 생성

### 목적

각 chunk를 vector 검색에 사용할 수 있는 숫자 배열로 바꾼다.

### 입력

- `backend/data/gold/chunks.jsonl`
- `GOOGLE_API_KEY`
- `EMBEDDING_MODEL_NAME`

### 처리

1. chunk text를 batch로 묶는다.
2. Gemini embedding API를 호출한다.
3. timeout 또는 429 오류는 지수 백오프로 재시도한다.
4. embedding dimension을 확인한다.
5. chunk와 vector 개수가 맞는지 확인한다.

### 실패 처리

| 실패 상황 | 처리 |
|---|---|
| 빈 chunk 목록 | Gemini API를 호출하지 않고 종료 |
| quota 초과 | retry 후 실패를 report에 기록 |
| vector 개수 불일치 | 적재 단계로 넘기지 않는다 |
| dimension 불일치 | collection 설정 확인 오류로 처리 |

---

## 8. 기능 5: Qdrant 적재

### 목적

chunk vector와 출처 정보를 Qdrant에 저장해 Phase 1 RAG가 검색할 수 있게 한다.

### 입력

- chunk 목록
- embedding vector 목록
- `QDRANT_URL`
- `QDRANT_API_KEY`
- `QDRANT_COLLECTION`

### 처리

1. Qdrant REST client를 생성한다.
2. collection이 없으면 만든다.
3. collection vector dimension과 embedding dimension이 맞는지 확인한다.
4. chunk id를 point id로 사용한다.
5. vector와 payload를 upsert한다.

### Qdrant payload

```json
{
  "document_id": "doc_2c26b46b68ff",
  "chunk_id": "doc_2c26b46b68ff:0:f9c2a81d",
  "text": "검색 대상 chunk 본문",
  "source_url": "https://example.com/docs/rag",
  "title": "RAG 소개",
  "chunk_index": 0,
  "pipeline_version": "0.1.0"
}
```

Phase 1은 이 payload로 source card와 citation을 만든다. 따라서 `text`, `source_url`, `title`, `chunk_id`는 필수다.

---

## 9. 기능 6: 실행 리포트

### 목적

파이프라인이 성공했는지, 어디서 실패했는지, 몇 건이 적재됐는지 개발자가 확인할 수 있게 한다.

### 출력 예시

```json
{
  "run_id": "20260630T120000",
  "input_url_count": 20,
  "crawled_count": 18,
  "cleaned_count": 16,
  "chunk_count": 120,
  "embedded_count": 120,
  "upserted_count": 120,
  "failed": [
    {
      "stage": "crawl",
      "url": "https://example.com/private",
      "reason": "HTTP 403"
    }
  ]
}
```

리포트는 사람이 봐도 이해되어야 하고, 테스트나 CI에서 JSON으로 읽어도 처리 가능해야 한다.

---

## 10. 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `GOOGLE_API_KEY` | 예 | Gemini embedding API 호출 |
| `QDRANT_URL` | 예 | Qdrant REST endpoint |
| `QDRANT_API_KEY` | 클라우드 사용 시 예 | Qdrant 인증 |
| `QDRANT_COLLECTION` | 아니오 | 기본값 `milkyway_docs` |
| `EMBEDDING_MODEL_NAME` | 아니오 | 기본값 `text-embedding-004` |

---

## 11. 제외 범위

Phase 0 MVP에서는 다음을 하지 않는다.

- 사용자가 브라우저에서 파일을 직접 업로드하는 기능
- 채팅 중 실시간 URL 크롤링
- 로그인 뒤 접근 가능한 비공개 문서 수집
- 대규모 스케줄러 도입
- GraphRAG entity/relation 추출
- RAG 답변 생성

RAG 답변 생성은 Phase 1의 범위다.

---

## 12. 테스트 기준

| 테스트 | 확인할 내용 |
|---|---|
| id 생성 테스트 | 같은 URL과 같은 chunk가 항상 같은 id를 갖는가 |
| 정제 테스트 | PII가 마스킹되고 보일러플레이트가 제거되는가 |
| 청킹 테스트 | chunk size와 overlap이 기대대로 동작하는가 |
| 임베딩 테스트 | batch 분리, retry, response parsing이 동작하는가 |
| 적재 테스트 | Qdrant payload와 upsert 요청이 올바른가 |
| smoke test | URL 1~3개로 전체 흐름이 끝까지 도는가 |

외부 서비스가 필요한 테스트는 mock 기반 unit test와 실제 cloud smoke test를 분리한다.

---

## 13. 완료 기준

- [ ] URL 목록으로 파이프라인을 실행할 수 있다.
- [ ] Bronze, Silver, Gold 산출물이 파일로 남는다.
- [ ] 개인정보 샘플이 `[EMAIL]`, `[PHONE_KR]`, `[RRN]`, `[API_KEY]`로 마스킹된다.
- [ ] 같은 입력을 다시 실행해도 Qdrant point가 중복 증가하지 않는다.
- [ ] Qdrant payload에 citation에 필요한 필드가 모두 포함된다.
- [ ] 실행 리포트에 성공/실패/제외/적재 건수가 나온다.
- [ ] unit test와 최소 smoke test가 통과한다.

---

## 14. 작업 분리

1. `backend/pipeline` 폴더와 공통 id/path 유틸 작성
2. URL 수집기 구현
3. 정제기 구현
4. 청킹기 구현
5. Gemini embedding client 구현
6. Qdrant loader 구현
7. report writer 구현
8. CLI entrypoint `pipeline.run` 구현
9. `backend/data/` gitignore 처리
10. unit/smoke test 작성
11. Phase 1 문서와 payload 계약 재확인
