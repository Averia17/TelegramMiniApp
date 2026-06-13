from enum import Enum
from typing import Optional

from sqlalchemy import BigInteger
from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TableNameMixin, TimestampMixin


class TransactionType(str, Enum):
    PAYMENT = "PAYMENT"
    REFUND = "REFUND"


class Transaction(Base, TimestampMixin, TableNameMixin):
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.user_id"), nullable=False)
    payment_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType), nullable=False)
    related_transaction: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("transactions.id"), nullable=True
    )

    user: Mapped["User"] = relationship("User", back_populates="transactions")
    refund_for: Mapped[Optional["Transaction"]] = relationship("Transaction", remote_side=[id], backref="refunds")

    def __repr__(self):
        return f"<Transaction {self.id} user={self.user_id} type={self.type} amount={self.amount}>"
