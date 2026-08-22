import base64
import binascii
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException

DEV_AUTH_SECRET = "local-development-auth-secret-change-before-production"


@dataclass(frozen=True)
class AuthenticatedUser:
    user_id: int


def _secret() -> str:
    secret = os.getenv("APP_AUTH_SECRET", "")
    if not secret and os.getenv("APP_ENV", "development").lower() != "production":
        return DEV_AUTH_SECRET
    return secret


async def current_user(authorization: str = Header(default="")) -> AuthenticatedUser:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    secret = _secret()
    try:
        payload, signature = token.split(".", 1)
        expected = (
            base64.urlsafe_b64encode(
                hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest()
            )
            .rstrip(b"=")
            .decode()
        )
        if not secret or not hmac.compare_digest(expected, signature):
            raise ValueError
        decoded = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        claims = json.loads(decoded)
        if int(claims["exp"]) <= int(time.time()):
            raise ValueError
        user_id = int(claims["sub"])
        if user_id <= 0:
            raise ValueError
        return AuthenticatedUser(user_id)
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, binascii.Error):
        raise HTTPException(
            status_code=401, detail="Invalid or expired access token"
        ) from None


def service_token() -> str:
    secret = _secret()
    if len(secret) < 32:
        raise RuntimeError("Service authentication is not configured")
    return hmac.new(secret.encode(), b"shop-payment-v1", hashlib.sha256).hexdigest()


async def require_shop_service(x_service_token: str = Header(default="")) -> None:
    try:
        expected = service_token()
    except RuntimeError as err:
        raise HTTPException(
            status_code=503, detail="Service authentication is not configured"
        ) from err
    if not hmac.compare_digest(expected, x_service_token):
        raise HTTPException(status_code=401, detail="Service authentication required")
