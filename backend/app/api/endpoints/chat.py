
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
from app.schemas.chat import ChatRequest
from app.services.gemini import gemini_service

router = APIRouter()

from app.services.guardrail import guardrail_service
from app.services.rate_limit import DAILY_LIMIT, daily_headers, daily_limiter, enforce_limits, get_client_key


@router.get("/chat/daily-usage")
async def get_daily_usage(http_request: Request, response: Response):
    key = get_client_key(http_request)
    remaining = max(0, daily_limiter.get_remaining(key))

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
            few_shot_examples=request.few_shot_examples
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Daily-Limit": str(limits["limit"]),
            "X-Daily-Remaining": str(limits["remaining"]),
        }
    )
