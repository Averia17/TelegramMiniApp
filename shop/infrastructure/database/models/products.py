import enum
from typing import Optional

from sqlalchemy import BIGINT, CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TableNameMixin, TimestampMixin


class Status(enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class Product(Base, TimestampMixin, TableNameMixin):
    product_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[Optional[str]] = mapped_column(String(256))
    price: Mapped[float] = mapped_column(Numeric(10, 2))

    def __repr__(self):
        return f"<Product {self.name}>"


class OrderedProduct(Base, TimestampMixin, TableNameMixin):
    id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(BIGINT)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.product_id"))
    status: Mapped[Status] = mapped_column(default=Status.PENDING)

    def __repr__(self):
        return f"<OrderedProduct {self.product_id} - {self.user_id}>"

class PlayerWallet(Base, TableNameMixin):
    user_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=False)
    gold: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    energy: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    energy_updated_at: Mapped[object] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("gold >= 0"), CheckConstraint("energy >= 0 AND energy <= 100"))

class ProcessedBattle(Base, TimestampMixin, TableNameMixin):
    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
