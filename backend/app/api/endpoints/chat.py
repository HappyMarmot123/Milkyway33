
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest, ModelInfoResponse, SharedTokenUsageResponse, SummarizeRequest
from app.services.gemini import gemini_service
from app.services.token_usage import token_usage_service

router = APIRouter()

from app.services.guardrail import guardrail_service
from app.services.rate_limit import DAILY_LIMIT, daily_headers, enforce_limits, get_client_key, get_daily_remaining
from google.genai import types as genai_types


@router.get("/chat/daily-usage")
async def get_daily_usage(http_request: Request, response: Response):
    key = get_client_key(http_request)
    remaining = max(0, get_daily_remaining(key))

    for header, value in daily_headers(remaining).items():
        response.headers[header] = value

    return {
        "limit": DAILY_LIMIT,
        "remaining": remaining,
    }


@router.post("/chat") # Server-Sent Events (SSE)
async def chat_stream(request: ChatRequest, http_request: Request):
    limits = enforce_limits(http_request)
    
    await guardrail_service.check_injection(request.message)
    safe_message = guardrail_service.format_with_delimiters(request.message)

    return StreamingResponse(
        gemini_service.generate_response_stream(
            message=safe_message,
            system_instruction=request.system_instruction,
            history=[m.model_dump() for m in request.history] if request.history else None,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Daily-Limit": str(limits["limit"]),
            "X-Daily-Remaining": str(limits["remaining"]),
        }
    )


@router.post("/chat/summarize")
async def summarize_conversation(request: SummarizeRequest):
    if len(request.messages) < 2:
        return {"summary": "대화 내용이 부족합니다."}

    recent = request.messages[-20:]

    summary_prompt = (
        "다음 대화를 핵심 주제 중심으로 한 문장(30자 이내)으로 요약해줘. "
        "요약 문장만 출력하고 다른 설명은 하지 마. "
        "예시: '리액트 상태 관리 훅 사용법 질의응답'"
    )

    contents = [
        *[
            genai_types.Content(
                role=m.role,
                parts=[genai_types.Part.from_text(text=m.content)]
            )
            for m in recent
        ],
        genai_types.Content(
            role="user",
            parts=[genai_types.Part.from_text(text=summary_prompt)]
        ),
    ]

    response = await gemini_service.client.aio.models.generate_content(
        model=gemini_service.model_name,
        contents=contents,
    )
    return {"summary": response.text.strip()}


@router.get("/chat/token-usage", response_model=SharedTokenUsageResponse)
async def get_shared_token_usage():
    """전체 사용자의 누적 토큰 사용량을 반환합니다."""
    data = await token_usage_service.get_total()
    return SharedTokenUsageResponse(**data)


@router.get("/chat/model-info", response_model=ModelInfoResponse)
async def get_model_info():
    """현재 사용 중인 Gemini 모델의 메타데이터를 반환합니다."""
    data = await gemini_service.get_model_info()
    return ModelInfoResponse(**data)
