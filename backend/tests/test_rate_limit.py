"""
rate_limit.py 테스트

실제 Upstash Redis 호출 없이 limiter를 mock하여 검증.
테스트 대상:
  - get_client_key       : IP 추출 로직
  - get_retry_after_seconds : 쿨타임 잔여 초 계산
  - daily_headers        : 응답 헤더 딕셔너리 형식
  - enforce_limits       : 쿨타임 / 일일 한도 통합 제어
  - /api/v1/chat 엔드포인트 : 429 응답 시나리오
"""

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


# ──────────────────────────────────────────────
# 헬퍼
# ──────────────────────────────────────────────

def _allowed(remaining: int = 9, reset: float = 0.0) -> MagicMock:
    """허용된 rate limit 응답 mock."""
    m = MagicMock()
    m.allowed = True
    m.remaining = remaining
    m.reset = reset
    return m


def _denied(reset: float = 0.0) -> MagicMock:
    """차단된 rate limit 응답 mock."""
    m = MagicMock()
    m.allowed = False
    m.remaining = 0
    m.reset = reset
    return m


def _mock_request(ip: str = "1.2.3.4") -> MagicMock:
    """FastAPI Request mock."""
    req = MagicMock()
    req.headers.get.return_value = ""
    req.client.host = ip
    return req


# ──────────────────────────────────────────────
# get_client_key
# ──────────────────────────────────────────────

class TestGetClientKey:
    def test_x_forwarded_for_첫번째_ip_사용(self):
        from app.services.rate_limit import get_client_key

        req = MagicMock()
        req.headers.get.side_effect = lambda k, d="": (
            "203.0.113.5, 10.0.0.1" if k == "x-forwarded-for" else d
        )
        assert get_client_key(req) == "203.0.113.5"

    def test_x_forwarded_for_없으면_직접_연결_ip_사용(self):
        from app.services.rate_limit import get_client_key

        req = MagicMock()
        req.headers.get.return_value = ""
        req.client.host = "192.168.1.1"
        assert get_client_key(req) == "192.168.1.1"

    def test_client_없으면_unknown_반환(self):
        from app.services.rate_limit import get_client_key

        req = MagicMock()
        req.headers.get.return_value = ""
        req.client = None
        assert get_client_key(req) == "unknown"

    def test_x_forwarded_for_공백_포함_파싱(self):
        from app.services.rate_limit import get_client_key

        req = MagicMock()
        req.headers.get.side_effect = lambda k, d="": (
            "  10.10.10.1  , 172.16.0.1" if k == "x-forwarded-for" else d
        )
        assert get_client_key(req) == "10.10.10.1"


# ──────────────────────────────────────────────
# get_retry_after_seconds
# ──────────────────────────────────────────────

class TestGetRetryAfterSeconds:
    def test_미래_reset_시간으로_잔여_초_계산(self):
        from app.services.rate_limit import get_retry_after_seconds

        future = time.time() + 45
        result = get_retry_after_seconds(future, fallback=60)
        assert 44 <= result <= 45

    def test_과거_reset_시간이면_최소값_1_반환(self):
        from app.services.rate_limit import get_retry_after_seconds

        past = time.time() - 10
        assert get_retry_after_seconds(past, fallback=60) == 1

    def test_reset이_0이면_fallback_반환(self):
        from app.services.rate_limit import get_retry_after_seconds

        assert get_retry_after_seconds(0, fallback=60) == 60

    def test_reset이_None이면_fallback_반환(self):
        from app.services.rate_limit import get_retry_after_seconds

        assert get_retry_after_seconds(None, fallback=60) == 60


# ──────────────────────────────────────────────
# daily_headers
# ──────────────────────────────────────────────

class TestDailyHeaders:
    def test_헤더_키와_값_형식(self):
        from app.services.rate_limit import DAILY_LIMIT, daily_headers

        headers = daily_headers(7)
        assert headers["X-Daily-Limit"] == str(DAILY_LIMIT)
        assert headers["X-Daily-Remaining"] == "7"

    def test_음수_remaining은_0으로_클램핑(self):
        from app.services.rate_limit import daily_headers

        assert daily_headers(-1)["X-Daily-Remaining"] == "0"

    def test_remaining_0_정상_반환(self):
        from app.services.rate_limit import daily_headers

        assert daily_headers(0)["X-Daily-Remaining"] == "0"


# ──────────────────────────────────────────────
# enforce_limits
# ──────────────────────────────────────────────

class TestEnforceLimits:

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_정상_요청_통과(self, mock_daily, mock_cooldown):
        from app.services.rate_limit import DAILY_LIMIT, enforce_limits

        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)

        result = enforce_limits(_mock_request())

        assert result["remaining"] == 8
        assert result["limit"] == DAILY_LIMIT

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_일일_한도_소진시_즉시_차단(self, mock_daily, mock_cooldown):
        from app.services.rate_limit import enforce_limits

        mock_daily.get_remaining.return_value = 0

        with pytest.raises(HTTPException) as exc:
            enforce_limits(_mock_request())

        assert exc.value.status_code == 429
        assert exc.value.headers["Retry-After"] == "86400"
        assert exc.value.headers["X-Daily-Remaining"] == "0"
        assert "오늘의 채팅 횟수" in exc.value.detail["message"]
        # 일일 한도 차단이므로 cooldown은 호출되지 않아야 함
        mock_cooldown.limit.assert_not_called()

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_쿨타임_활성시_차단(self, mock_daily, mock_cooldown):
        from app.services.rate_limit import enforce_limits

        mock_daily.get_remaining.return_value = 8
        mock_cooldown.limit.return_value = _denied(reset=time.time() + 30)

        with pytest.raises(HTTPException) as exc:
            enforce_limits(_mock_request())

        assert exc.value.status_code == 429
        assert "요청 간격 제한" in exc.value.detail["message"]
        assert int(exc.value.headers["Retry-After"]) <= 30
        # 쿨타임 차단이므로 daily.limit은 호출되지 않아야 함
        mock_daily.limit.assert_not_called()

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_쿨타임_통과후_daily_limit_초과시_차단(self, mock_daily, mock_cooldown):
        """get_remaining은 통과했으나 limit() 호출 후 초과 확정된 경우."""
        from app.services.rate_limit import enforce_limits

        mock_daily.get_remaining.return_value = 1
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _denied()

        with pytest.raises(HTTPException) as exc:
            enforce_limits(_mock_request())

        assert exc.value.status_code == 429
        assert "오늘의 채팅 횟수" in exc.value.detail["message"]

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_10회_허용_후_11번째_차단(self, mock_daily, mock_cooldown):
        """핵심 시나리오: 1~10번째 요청은 통과, 11번째는 차단."""
        from app.services.rate_limit import DAILY_LIMIT, enforce_limits

        allowed_count = 0

        for i in range(1, DAILY_LIMIT + 2):  # 1 ~ 11
            before_remaining = DAILY_LIMIT - (i - 1)  # 요청 전 잔여 횟수

            if before_remaining > 0:
                # 통과 케이스
                after_remaining = before_remaining - 1
                mock_daily.get_remaining.return_value = before_remaining
                mock_cooldown.limit.return_value = _allowed()
                mock_daily.limit.return_value = _allowed(remaining=after_remaining)

                result = enforce_limits(_mock_request())
                assert result["remaining"] == after_remaining
                allowed_count += 1
            else:
                # 11번째: 차단
                mock_daily.get_remaining.return_value = 0

                with pytest.raises(HTTPException) as exc:
                    enforce_limits(_mock_request())

                assert exc.value.status_code == 429
                assert exc.value.headers["Retry-After"] == "86400"
                assert "오늘의 채팅 횟수" in exc.value.detail["message"]

        assert allowed_count == DAILY_LIMIT

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_쿨타임_헤더에_일일_잔여_횟수_포함(self, mock_daily, mock_cooldown):
        """쿨타임 429 응답에도 X-Daily-Remaining 헤더가 포함되어야 함."""
        from app.services.rate_limit import enforce_limits

        mock_daily.get_remaining.return_value = 5
        mock_cooldown.limit.return_value = _denied(reset=time.time() + 20)

        with pytest.raises(HTTPException) as exc:
            enforce_limits(_mock_request())

        assert exc.value.headers.get("X-Daily-Remaining") == "5"
        assert exc.value.headers.get("X-Daily-Limit") is not None

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_ip별_독립적인_카운터(self, mock_daily, mock_cooldown):
        """서로 다른 IP는 독립적인 key로 처리되어야 함."""
        from app.services.rate_limit import enforce_limits

        mock_daily.get_remaining.return_value = 10
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=9)

        req_a = _mock_request("10.0.0.1")
        req_b = _mock_request("10.0.0.2")

        enforce_limits(req_a)
        enforce_limits(req_b)

        # 두 요청 모두 각각 다른 key로 limit() 호출되었는지 확인
        calls = [str(c) for c in mock_daily.limit.call_args_list]
        assert any("10.0.0.1" in c for c in calls)
        assert any("10.0.0.2" in c for c in calls)


# ──────────────────────────────────────────────
# 엔드포인트 통합 테스트
# ──────────────────────────────────────────────

class TestChatEndpoint:
    """
    실제 Gemini 호출 없이 rate limit 동작만 검증.
    gemini_service와 guardrail_service도 mock 처리.
    """

    @pytest.fixture
    def client(self):
        from main import app
        return TestClient(app, raise_server_exceptions=False)

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    @patch("app.services.gemini.gemini_service.generate_response_stream")
    @patch("app.services.guardrail.guardrail_service.check_injection", new_callable=AsyncMock)
    @patch("app.services.guardrail.guardrail_service.format_with_delimiters")
    def test_정상_요청시_200_반환(
        self, mock_format, mock_check, mock_stream,
        mock_daily, mock_cooldown, client
    ):
        mock_daily.get_remaining.return_value = 9
        mock_cooldown.limit.return_value = _allowed()
        mock_daily.limit.return_value = _allowed(remaining=8)
        mock_check.return_value = None
        mock_format.return_value = "test"
        mock_stream.return_value = iter([])

        res = client.post("/api/v1/chat", json={"message": "안녕"})
        assert res.status_code == 200

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_일일_한도_초과시_429_반환(self, mock_daily, mock_cooldown, client):
        mock_daily.get_remaining.return_value = 0

        res = client.post("/api/v1/chat", json={"message": "안녕"})

        assert res.status_code == 429
        assert res.headers.get("Retry-After") == "86400"
        assert "오늘의 채팅 횟수" in res.json()["detail"]["message"]

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_쿨타임_초과시_429_반환(self, mock_daily, mock_cooldown, client):
        mock_daily.get_remaining.return_value = 8
        mock_cooldown.limit.return_value = _denied(reset=time.time() + 45)

        res = client.post("/api/v1/chat", json={"message": "안녕"})

        assert res.status_code == 429
        assert "요청 간격 제한" in res.json()["detail"]["message"]
        assert int(res.headers.get("Retry-After", 0)) <= 45

    @patch("app.services.rate_limit.cooldown_limiter")
    @patch("app.services.rate_limit.daily_limiter")
    def test_일일_한도_초과_응답에_x_daily_헤더_포함(self, mock_daily, mock_cooldown, client):
        mock_daily.get_remaining.return_value = 0

        res = client.post("/api/v1/chat", json={"message": "안녕"})

        assert res.status_code == 429
        assert res.headers.get("X-Daily-Remaining") == "0"
        assert res.headers.get("X-Daily-Limit") is not None
