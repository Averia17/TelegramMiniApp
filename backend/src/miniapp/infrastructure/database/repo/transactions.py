from typing import Optional

from sqlalchemy import insert, select

from miniapp.infrastructure.database.models.transactions import (
    Transaction,
    TransactionType,
)
from miniapp.infrastructure.database.repo.base import BaseRepo


class TransactionsRepo(BaseRepo):
    async def create(
        self,
        user_id: int,
        payment_key: str,
        amount: int,
        transaction_type: TransactionType,
        related_transaction: Optional[int] = None,
    ) -> Transaction:
        stmt = (
            insert(Transaction)
            .values(
                user_id=user_id,
                payment_key=payment_key,
                amount=amount,
                type=transaction_type,
                related_transaction=related_transaction,
            )
            .returning(Transaction)
        )
        result = await self.session.execute(stmt)
        await self.session.commit()
        return result.scalar_one()

    async def get_by_payment_key(self, payment_key: str) -> Optional[Transaction]:
        stmt = select(Transaction).where(Transaction.payment_key == payment_key)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_refund_for_payment(self, payment_id: int) -> Optional[Transaction]:
        stmt = select(Transaction).where(
            Transaction.related_transaction == payment_id,
            Transaction.type == TransactionType.REFUND,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_transactions(self, user_id: int) -> list[Transaction]:
        stmt = select(Transaction).where(Transaction.user_id == user_id).order_by(Transaction.created_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()
