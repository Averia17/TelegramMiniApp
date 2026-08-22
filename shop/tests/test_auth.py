import asyncio

import pytest
from auth import current_user
from fastapi import HTTPException


def test_malformed_access_token_returns_unauthorized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_SECRET", "shop-test-secret-with-at-least-32-chars")

    with pytest.raises(HTTPException) as error:
        asyncio.run(current_user("Bearer not-base64.%%%"))

    assert error.value.status_code == 401
