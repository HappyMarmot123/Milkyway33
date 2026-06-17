"""
오늘 나의 채팅 사용 횟수 조회

mock 없이 실제 Redis에서 읽습니다.
실행: cd backend && python -m pytest tests/test_my_usage.py -v -s
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


def test_오늘_사용_횟수(client):
    res = client.get("/api/v1/chat/daily-usage")

    assert res.status_code == 200, f"API 오류: {res.status_code}"

    data = res.json()
    limit = data["limit"]
    remaining = data["remaining"]
    used = limit - remaining

    print(f"\n{'─' * 30}")
    print(f"  오늘 사용:  {used}회")
    print(f"  남은 횟수:  {remaining}회")
    print(f"  일일 한도:  {limit}회")
    print(f"{'─' * 30}")

    assert remaining >= 0
    assert used >= 0
    assert used <= limit
