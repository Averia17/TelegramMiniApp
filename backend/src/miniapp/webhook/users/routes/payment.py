from fastapi import APIRouter, Depends, HTTPException

from miniapp.infrastructure.database.models.transactions import TransactionType
from miniapp.infrastructure.database.repo.requests import RequestsRepo
from miniapp.webhook.users.schemas import PaymentRequest
from miniapp.webhook.utils import get_repo

payment_router = APIRouter(prefix="/payment")


@payment_router.post("/")
async def payment(data: PaymentRequest, repo: RequestsRepo = Depends(get_repo)):
    async with repo.session.begin():
        existing_transaction = await repo.transactions.get_by_payment_key(data.payment_key)
        if existing_transaction:
            return {
                "status": "success",
                "user_id": existing_transaction.user_id,
                "transaction_id": existing_transaction.id,
            }

        user = await repo.users.get_by_id(data.user_id, for_update=True)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if data.amount <= 0:
            raise HTTPException(status_code=400, detail="Amount must be positive")

        if user.clicks < data.amount:
            raise HTTPException(status_code=402, detail="Insufficient balance")

        user.clicks -= data.amount

        transaction = await repo.transactions.create(
            user_id=user.user_id,
            payment_key=data.payment_key,
            amount=-data.amount,
            transaction_type=TransactionType.PAYMENT,
        )

        return {
            "status": "success",
            "user_id": user.user_id,
            "transaction_id": transaction.id,
        }


@payment_router.post("/refund")
async def refund(data: PaymentRequest, repo: RequestsRepo = Depends(get_repo)):
    async with repo.session.begin():
        original_transaction = await repo.transactions.get_by_payment_key(data.payment_key)
        if not original_transaction:
            raise HTTPException(status_code=404, detail="Original payment not found")

        refund_transaction = await repo.transactions.get_refund_for_payment(original_transaction.id)
        if refund_transaction:
            return {
                "status": "success",
                "user_id": refund_transaction.user_id,
                "transaction_id": refund_transaction.id,
            }

        user = await repo.users.get_by_id(data.user_id, for_update=True)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user.clicks += data.amount

        transaction = await repo.transactions.create(
            user_id=user.user_id,
            payment_key=f"refund:{data.payment_key}",
            amount=data.amount,
            transaction_type=TransactionType.REFUND,
            related_transaction=original_transaction.id,
        )

        return {
            "status": "success",
            "user_id": user.user_id,
            "transaction_id": transaction.id,
        }
