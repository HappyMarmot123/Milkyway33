"""
대화 히스토리 관련 테스트

검증 항목:
1. 히스토리가 request_contents에 올바른 순서로 삽입되는지
2. few-shot 뒤, 현재 메시지 앞에 위치하는지
3. 히스토리 없을 때와 있을 때 request_contents 길이 차이
4. role 변환: "user"/"model" 정확히 매핑되는지
5. 빈 히스토리 전달 시 정상 동작하는지
6. /chat/summarize 엔드포인트 동작 검증
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


async def _empty_async_stream():
    if False:
        yield ""


def _history(*pairs: tuple[str, str]) -> list[dict]:
    """(user_msg, model_msg) 쌍 목록을 히스토리 형식으로 변환."""
    result = []
    for user_msg, model_msg in pairs:
        result.append({"role": "user", "content": user_msg})
        result.append({"role": "model", "content": model_msg})
    return result


def _capture_contents():
    """generate_content_stream 호출 시 전달된 contents를 캡처하는 mock."""
    captured = {}

    async def mock_stream(*args, **kwargs):
        captured["contents"] = kwargs.get("contents", args[1] if len(args) > 1 else [])
        captured["config"] = kwargs.get("config")

        async def iterator():
            yield MagicMock(
                text="테스트 응답",
                candidates=[MagicMock(
                    finish_reason="STOP",
                    safety_ratings=[],
                    content=MagicMock(parts=[]),
                )],
                usage_metadata=MagicMock(
                    prompt_token_count=10,
                    candidates_token_count=5,
                    total_token_count=15,
                    cached_content_token_count=0,
                    tool_use_prompt_token_count=0,
                    thoughts_token_count=0,
                ),
            )

        return iterator()

    return mock_stream, captured


class TestGeminiServiceHistory:

    @pytest.fixture
    def service(self):
        from app.services.gemini import GeminiService
        svc = GeminiService.__new__(GeminiService)
        svc.model_name = "gemini-test"
        svc.client = MagicMock()
        return svc

    @pytest.mark.anyio
    async def test_히스토리_없으면_현재_메시지만_포함(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        async for _ in service.generate_response_stream("안녕"):
            pass

        contents = captured["contents"]
        assert len(contents) == 1
        assert contents[0].role == "user"
        assert contents[0].parts[0].text == "안녕"

    @pytest.mark.anyio
    async def test_히스토리가_현재_메시지_앞에_삽입됨(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        history = _history(("이전 질문", "이전 응답"))
        async for _ in service.generate_response_stream("현재 질문", history=history):
            pass

        contents = captured["contents"]
        assert len(contents) == 3
        assert contents[0].role == "user"
        assert contents[0].parts[0].text == "이전 질문"
        assert contents[1].role == "model"
        assert contents[1].parts[0].text == "이전 응답"
        assert contents[2].role == "user"
        assert contents[2].parts[0].text == "현재 질문"

    @pytest.mark.anyio
    async def test_few_shot_뒤에_히스토리_삽입됨(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        few_shot = [{"input": "예시질문", "output": "예시답"}]
        history = _history(("실제 이전 질문", "실제 이전 응답"))

        async for _ in service.generate_response_stream(
            "현재 질문",
            few_shot_examples=few_shot,
            history=history,
        ):
            pass

        contents = captured["contents"]
        assert len(contents) == 5
        assert contents[0].parts[0].text == "예시질문"
        assert contents[1].parts[0].text == "예시답"
        assert contents[2].parts[0].text == "실제 이전 질문"
        assert contents[3].parts[0].text == "실제 이전 응답"
        assert contents[4].parts[0].text == "현재 질문"

    @pytest.mark.anyio
    async def test_role_변환_user_model_정확히_매핑(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        history = [
            {"role": "user", "content": "질문"},
            {"role": "model", "content": "답변"},
        ]
        async for _ in service.generate_response_stream("다음 질문", history=history):
            pass

        contents = captured["contents"]
        assert contents[0].role == "user"
        assert contents[1].role == "model"

    @pytest.mark.anyio
    async def test_빈_히스토리_정상_동작(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        async for _ in service.generate_response_stream("질문", history=[]):
            pass

        assert len(captured["contents"]) == 1

    @pytest.mark.anyio
    async def test_긴_히스토리_여러_턴(self, service):
        mock_stream, captured = _capture_contents()
        service.client.aio.models.generate_content_stream = mock_stream

        history = _history(*[(f"질문{i}", f"답변{i}") for i in range(5)])
        async for _ in service.generate_response_stream("마지막 질문", history=history):
            pass

        contents = captured["contents"]
        assert len(contents) == 11
        assert contents[-1].parts[0].text == "마지막 질문"


class TestChatEndpointHistory:

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    @pytest.mark.anyio
    async def test_히스토리_포함_요청_200_반환(
        self, mock_stream, mock_format, mock_check,
        mock_daily, mock_cooldown
    ):
        from tests.test_rate_limit import _allowed
        from tests.test_rate_limit import _mock_request
        from app.api.endpoints.chat import chat_stream
        from app.schemas.chat import ChatRequest

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "현재 질문"
        mock_stream.return_value = _empty_async_stream()

        res = await chat_stream(ChatRequest(
            message="현재 질문",
            history=[
                {"role": "user", "content": "이전 질문"},
                {"role": "model", "content": "이전 응답"},
            ],
        ), _mock_request())
        assert res.status_code == 200

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    @pytest.mark.anyio
    async def test_히스토리_없이도_정상_동작(
        self, mock_stream, mock_format, mock_check,
        mock_daily, mock_cooldown
    ):
        from tests.test_rate_limit import _allowed
        from tests.test_rate_limit import _mock_request
        from app.api.endpoints.chat import chat_stream
        from app.schemas.chat import ChatRequest

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "질문"
        mock_stream.return_value = _empty_async_stream()

        res = await chat_stream(ChatRequest(message="질문"), _mock_request())
        assert res.status_code == 200

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    @pytest.mark.anyio
    async def test_히스토리_generate_response_stream에_전달됨(
        self, mock_stream, mock_format, mock_check,
        mock_daily, mock_cooldown
    ):
        from tests.test_rate_limit import _allowed
        from tests.test_rate_limit import _mock_request
        from app.api.endpoints.chat import chat_stream
        from app.schemas.chat import ChatRequest

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "현재 질문"
        mock_stream.return_value = _empty_async_stream()

        await chat_stream(ChatRequest(
            message="현재 질문",
            history=[
                {"role": "user", "content": "이전 질문"},
                {"role": "model", "content": "이전 응답"},
            ],
        ), _mock_request())

        call_kwargs = mock_stream.call_args.kwargs
        assert call_kwargs["history"] is not None
        assert len(call_kwargs["history"]) == 2
        assert call_kwargs["history"][0]["role"] == "user"
        assert call_kwargs["history"][1]["role"] == "model"


class TestSummarizeEndpoint:

    @patch("app.services.gemini.gemini_service.client")
    @pytest.mark.anyio
    async def test_요약_정상_반환(self, mock_client):
        from app.api.endpoints.chat import summarize_conversation
        from app.schemas.chat import SummarizeRequest

        mock_response = MagicMock()
        mock_response.text = "리액트 훅 사용법 질의응답"
        mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        res = await summarize_conversation(SummarizeRequest(
            messages=[
                {"role": "user", "content": "useState 언제 써?"},
                {"role": "model", "content": "단순한 값 하나일 때 씁니다."},
                {"role": "user", "content": "useReducer는요?"},
                {"role": "model", "content": "복잡한 상태 로직에 씁니다."},
            ]
        ))
        assert "summary" in res

    @pytest.mark.anyio
    async def test_메시지_2개_미만_처리(self):
        from app.api.endpoints.chat import summarize_conversation
        from app.schemas.chat import SummarizeRequest

        res = await summarize_conversation(SummarizeRequest(
            messages=[{"role": "user", "content": "안녕"}]
        ))
        assert res["summary"] == "대화 내용이 부족합니다."

    @pytest.mark.anyio
    async def test_빈_메시지_처리(self):
        from app.api.endpoints.chat import summarize_conversation
        from app.schemas.chat import SummarizeRequest

        res = await summarize_conversation(SummarizeRequest(messages=[]))
        assert res["summary"] == "대화 내용이 부족합니다."
