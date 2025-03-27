from typing import Optional

from sqlalchemy import BIGINT, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TableNameMixin, TimestampMixin


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

    def __repr__(self):
        return f"<OrderedProduct {self.product_id} - {self.user_id}>"
