import os

from auth import issue_access_token, verify_telegram_init_data
from fastapi import APIRouter, Depends, Header, HTTPException
from infrastructure import Repo
from pydantic import BaseModel

from .deps import get_repo

router = APIRouter(prefix="/auth")


class TelegramAuthRequest(BaseModel):
    init_data: str = ""


@router.post("/telegram")
async def telegram_auth(
    data: TelegramAuthRequest,
    x_dev_user_id: int | None = Header(default=None),
    repo: Repo = Depends(get_repo),
):
    is_development_user = False
    if data.init_data:
        user_id = verify_telegram_init_data(data.init_data)
    elif (
        os.getenv("APP_ENV", "development").lower() != "production"
        and x_dev_user_id
        and x_dev_user_id > 0
    ):
        user_id = x_dev_user_id
        is_development_user = True
    else:
        raise HTTPException(status_code=401, detail="Open the game through Telegram")
    if is_development_user:
        await repo.users.get_or_create_user(
            user_id, f"Dev Player {user_id}", f"dev_{user_id}"
        )
    return {
        "user_id": user_id,
        "access_token": issue_access_token(user_id),
        "expires_in": 900,
    }
