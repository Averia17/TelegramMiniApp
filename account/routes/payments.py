from auth import require_shop_service
from fastapi import APIRouter, Depends, HTTPException
from infrastructure import Repo
from infrastructure.database.models import TransactionType
from schemas import PaymentRequest

from .deps import get_repo

router = APIRouter(prefix="/payment")


@router.post("/")
async def payment(
    data: PaymentRequest,
    repo: Repo = Depends(get_repo),
    _: None = Depends(require_shop_service),
):
    async with repo.session.begin():
        existing_transaction = await repo.transactions.get_by_payment_key(
            data.payment_key
        )
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


@router.post("/refund")
async def refund(
    data: PaymentRequest,
    repo: Repo = Depends(get_repo),
    _: None = Depends(require_shop_service),
):
    async with repo.session.begin():
        original_transaction = await repo.transactions.get_by_payment_key(
            data.payment_key
        )
        if not original_transaction:
            raise HTTPException(status_code=404, detail="Original payment not found")

        refund_transaction = await repo.transactions.get_refund_for_payment(
            original_transaction.id
        )
        if refund_transaction:
            return {
                "status": "success",
                "user_id": refund_transaction.user_id,
                "transaction_id": refund_transaction.id,
            }

        if original_transaction.user_id != data.user_id:
            raise HTTPException(
                status_code=400, detail="Refund user does not match payment"
            )
        user = await repo.users.get_by_id(original_transaction.user_id, for_update=True)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        refund_amount = -original_transaction.amount
        if refund_amount <= 0:
            raise HTTPException(
                status_code=409, detail="Original transaction cannot be refunded"
            )
        user.clicks += refund_amount

        transaction = await repo.transactions.create(
            user_id=user.user_id,
            payment_key=f"refund:{data.payment_key}",
            amount=refund_amount,
            transaction_type=TransactionType.REFUND,
            related_transaction=original_transaction.id,
        )

        return {
            "status": "success",
            "user_id": user.user_id,
            "transaction_id": transaction.id,
        }
