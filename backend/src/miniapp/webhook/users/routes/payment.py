from fastapi import APIRouter, Depends, HTTPException
from starlette import status
from starlette.requests import Request

from miniapp.infrastructure.database.repo.requests import RequestsRepo
from miniapp.webhook.users.services import PaymentService
from miniapp.webhook.utils import get_repo


payment_router = APIRouter(prefix="/payment")


@payment_router.post("/")
async def payment(request: Request, repo: RequestsRepo = Depends(get_repo)):
    data =await request.json()
    user_id = data["user_id"]
    amount = data["amount"]
    user = await repo.users.get_by_id(user_id)

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.clicks < amount:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Insufficient balance")

    return await PaymentService(repo.users).decrease_balance(user_id, amount)


@payment_router.post("/refund")
async def refund(request: Request, repo: RequestsRepo = Depends(get_repo)):
    data = await request.json()
    user_id = data["user_id"]
    amount = data["amount"]
    user = await repo.users.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return await PaymentService(repo.users).increase_balance(user_id, amount)
