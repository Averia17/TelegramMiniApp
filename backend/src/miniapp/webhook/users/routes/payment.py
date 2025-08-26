from fastapi import APIRouter, Depends, HTTPException
from starlette import status

from miniapp.infrastructure.database.repo.requests import RequestsRepo
from miniapp.webhook.users.schemas import PaymentRequest
from miniapp.webhook.utils import get_repo

payment_router = APIRouter(prefix="/payment")


@payment_router.post("/")
async def payment(data: PaymentRequest, repo: RequestsRepo = Depends(get_repo)):
    async with repo.session.begin():
        user = await repo.users.get_by_id(data.user_id, for_update=True)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if user.clicks < data.amount:
            raise HTTPException(status_code=402, detail="Insufficient balance")

        user.clicks -= data.amount

        return {
            "status": "success",
            "user_id": user.user_id,
        }


@payment_router.post("/refund")
async def refund(data: PaymentRequest, repo: RequestsRepo = Depends(get_repo)):
    async with repo.session.begin():
        user = await repo.users.get_by_id(data.user_id, for_update=True)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.clicks += data.amount

        return {
            "status": "success",
            "user_id": user.user_id,
        }
