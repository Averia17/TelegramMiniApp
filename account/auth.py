import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException, status

DEV_AUTH_SECRET = "local-development-auth-secret-change-before-production"


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: int


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def verify_telegram_init_data(init_data: str, max_age_seconds: int = 3600) -> int:
    bot_token = os.getenv("BOT_TOKEN", "")
    if not bot_token:
        raise HTTPException(
            status_code=503, detail="Telegram authentication is not configured"
        )

    values = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = values.pop("hash", "")
    auth_date = int(values.get("auth_date", "0") or 0)
    if (
        not received_hash
        or auth_date <= 0
        or abs(time.time() - auth_date) > max_age_seconds
    ):
        raise HTTPException(
            status_code=401, detail="Telegram authentication data has expired"
        )

    data_check_string = "\n".join(f"{key}={values[key]}" for key in sorted(values))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(
            status_code=401, detail="Invalid Telegram authentication data"
        )

    try:
        user_id = int(json.loads(values["user"])["id"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(
            status_code=401, detail="Telegram user is missing"
        ) from None
    if user_id <= 0:
        raise HTTPException(status_code=401, detail="Invalid Telegram user")
    return user_id


def issue_access_token(user_id: int, ttl_seconds: int = 900) -> str:
    secret = _auth_secret()
    if len(secret) < 32:
        raise HTTPException(
            status_code=503, detail="Application authentication is not configured"
        )
    payload = _b64encode(
        json.dumps(
            {"sub": user_id, "exp": int(time.time()) + ttl_seconds},
            separators=(",", ":"),
        ).encode()
    )
    signature = _b64encode(
        hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
    )
    return f"{payload}.{signature}"


def verify_access_token(token: str) -> AuthenticatedUser:
    secret = _auth_secret()
    try:
        payload, signature = token.split(".", 1)
        expected = _b64encode(
            hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
        )
        if not secret or not hmac.compare_digest(expected, signature):
            raise ValueError
        claims = json.loads(_b64decode(payload))
        if int(claims["exp"]) < int(time.time()):
            raise ValueError
        return AuthenticatedUser(user_id=int(claims["sub"]))
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
        ) from None


async def current_user(authorization: str = Header(default="")) -> AuthenticatedUser:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    return verify_access_token(token)


async def require_shop_service(x_service_token: str = Header(default="")) -> None:
    secret = _auth_secret()
    expected = hmac.new(secret.encode(), b"shop-payment-v1", hashlib.sha256).hexdigest()
    if not secret or not hmac.compare_digest(expected, x_service_token):
        raise HTTPException(status_code=401, detail="Service authentication required")


def _auth_secret() -> str:
    secret = os.getenv("APP_AUTH_SECRET", "")
    if not secret and os.getenv("APP_ENV", "development").lower() != "production":
        return DEV_AUTH_SECRET
    return secret
