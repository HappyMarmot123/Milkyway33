# Phase 1 — RAG 코어

> 목표: Phase 0이 적재한 Qdrant 임베딩을 검색해, 출처(citation)가 붙은 답변을 스트리밍한다.
> 프론트엔드에는 이미 `sources.tsx`, `inline-citation.tsx`가 있다 → 백엔드만 채우면 바로 살아난다.

## 추가/수정 파일
```
backend/app/services/embedding.py   # query 임베딩 (싱글톤)
backend/app/services/vector_store.py # Qdrant 검색 래퍼 (싱글톤)
backend/app/services/rag.py          # 검색 + 프롬프트 조립 + citation
backend/app/api/endpoints/rag.py     # /api/v1/rag/* 라우터
backend/app/schemas/rag.py           # 요청/응답 스키마
backend/main.py                      # include_router(rag.router) 추가
src/api/rag.ts                       # streamRag 클라이언트
src/features/chat/types.ts           # ChatEvent에 sources 필드 확장
```

## 1.1 임베딩 + 벡터 검색

### `services/vector_store.py`
```python
from qdrant_client import QdrantClient
from app.core.config import settings

COLLECTION = "milkyway_docs"

class VectorStore:
    def __init__(self):
        self._client: QdrantClient | None = None

    @property
    def client(self) -> QdrantClient:
        # 서버리스: gRPC 금지, 전역 1회 생성 후 재사용 (콜드스타트 완화)
        if self._client is None:
            self._client = QdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.QDRANT_API_KEY,
                prefer_grpc=False,
                timeout=10,
            )
        return self._client

    def search(self, query_vec: list[float], top_k: int = 5) -> list[dict]:
        hits = self.client.query_points(
            COLLECTION, query=query_vec, limit=top_k, with_payload=True
        ).points
        return [
            {
                "text": h.payload["text"],
                "source_url": h.payload["source_url"],
                "score": h.score,          # 코사인 유사도 (1에 가까울수록 유사)
            }
            for h in hits
        ]

vector_store = VectorStore()
```

### 코사인 유사도 개념 (문서화용)
- `cosθ = (A·B) / (|A|·|B|)` — 두 벡터의 **방향** 유사도. 범위 [-1, 1], 텍스트 임베딩에선 보통 [0, 1].
- 크기(문서 길이)에 둔감 → 길이가 다른 문서 비교에 유리.
- Qdrant `Distance.COSINE`은 내부적으로 정규화 후 내적. Phase 0의 적재 거리와 반드시 일치시킬 것.

## 1.2 RAG 답변 생성 + Citation

### `services/rag.py`
```python
import json
from typing import AsyncIterator
from app.services.embedding import embedding_service
from app.services.vector_store import vector_store
from app.services.gemini import gemini_service

RAG_SYSTEM = (
    "너는 제공된 컨텍스트만 근거로 답한다. 각 문장 끝에 사용한 출처를 [1],[2] 형식으로 표기한다. "
    "컨텍스트에 없으면 '제공된 자료로는 알 수 없습니다'라고 답한다."
)

def build_context(hits: list[dict]) -> str:
    return "\n\n".join(f"[{i+1}] {h['text']}" for i, h in enumerate(hits))

async def answer_stream(question: str, top_k: int = 5) -> AsyncIterator[str]:
    qvec = embedding_service.embed_query(question)
    hits = vector_store.search(qvec, top_k=top_k)

    # 프론트가 출처 카드를 먼저 그릴 수 있도록 sources 이벤트 선발행
    yield json.dumps({"status": "sources", "sources": [
        {"index": i + 1, "url": h["source_url"], "score": round(h["score"], 3)}
        for i, h in enumerate(hits)
    ]}, ensure_ascii=False) + "\n"

    prompt = f"컨텍스트:\n{build_context(hits)}\n\n질문: {question}"
    # 기존 gemini_service 스트리밍 재사용 (status: streaming/complete 그대로)
    async for event in gemini_service.generate_response_stream(
        message=prompt, system_instruction=RAG_SYSTEM
    ):
        yield event
```
- **재사용**: 기존 `gemini_service.generate_response_stream`을 그대로 활용 → SSE 포맷(줄단위 JSON)이 프론트 `streamChat`과 호환.
- citation은 LLM이 `[n]`으로 본문에 삽입, 출처 메타는 `sources` 이벤트로 분리 전달.

### `api/endpoints/rag.py`
```python
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from app.schemas.rag import RagQueryRequest
from app.services.rag import answer_stream
from app.services.rate_limit import enforce_limits   # 기존 가드 재사용
from app.services.guardrail import guardrail_service

router = APIRouter()

@router.post("/rag/query")
async def rag_query(req: RagQueryRequest, http_request: Request):
    enforce_limits(http_request)
    await guardrail_service.check_injection(req.question)
    return StreamingResponse(
        answer_stream(req.question, top_k=req.top_k),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
```
> `main.py`에 `app.include_router(rag.router, prefix="/api/v1")` 한 줄 추가.

### 프론트 연결 — `src/api/rag.ts` + `types.ts`
```ts
// ChatEvent 확장
export interface RagSource { index: number; url: string; score: number; }
export interface ChatEvent {
  // ...기존...
  status: ChatEventStatus | 'sources';
  sources?: RagSource[];
}
```
- `streamRag()`는 기존 `streamChat`을 거의 복붙하되 엔드포인트만 `/rag/query`.
- `status === 'sources'` 수신 시 `sources.tsx`/`inline-citation.tsx`에 바인딩.

## 1.3 Hybrid Search

벡터 검색만으론 고유명사·코드·숫자 매칭이 약하다 → 키워드(sparse) 결합.

### 옵션 A — Qdrant 네이티브 sparse 벡터
- 적재 시 dense + sparse(BM25/SPLADE) 동시 저장, `query_points`에 `prefetch`로 두 검색 후 fusion.

### 옵션 B — 애플리케이션 레벨 RRF (간단, 권장 시작점)
```python
def rrf(dense: list[dict], sparse: list[dict], k=60) -> list[dict]:
    scores: dict[str, float] = {}
    for rank, h in enumerate(dense):
        scores[h["text"]] = scores.get(h["text"], 0) + 1 / (k + rank)
    for rank, h in enumerate(sparse):
        scores[h["text"]] = scores.get(h["text"], 0) + 1 / (k + rank)
    return sorted([{"text": t, "rrf": s} for t, s in scores.items()],
                  key=lambda x: -x["rrf"])
```
- sparse 검색은 우선 간단히: Qdrant payload full-text 인덱스 또는 별도 키워드 인덱스.

## 완료 기준 (Acceptance)
- [ ] `/api/v1/rag/query`가 sources 이벤트 + 스트리밍 답변 반환
- [ ] 답변 본문에 `[1][2]` citation이 실제 출처와 일치
- [ ] 프론트에서 출처 카드(`sources.tsx`)가 렌더됨
- [ ] 컨텍스트에 없는 질문에 "알 수 없습니다" 응답 (환각 억제 확인)
- [ ] hybrid on/off 비교 시 키워드성 질의 정확도 개선 확인

## 다음 단계
→ [Phase 2 — 평가 & 모델 성능](./phase-2-eval.md): 이 RAG의 품질을 수치로 측정.
