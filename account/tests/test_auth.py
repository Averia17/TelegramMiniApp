import pytest
from auth import verify_access_token, verify_telegram_init_data
from fastapi import HTTPException


def test_malformed_access_token_returns_unauthorized(monkeypatch):
    monkeypatch.setenv("APP_AUTH_SECRET", "account-test-secret-with-at-least-32-chars")

    with pytest.raises(HTTPException) as error:
        verify_access_token("not-base64.%%%").user_id

    assert error.value.status_code == 401


def test_malformed_telegram_auth_date_returns_unauthorized(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "telegram-test-token")

    with pytest.raises(HTTPException) as error:
        verify_telegram_init_data("auth_date=invalid&hash=invalid")

    assert error.value.status_code == 401
