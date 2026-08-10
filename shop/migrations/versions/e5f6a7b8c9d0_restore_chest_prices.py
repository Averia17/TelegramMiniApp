"""restore the original gold prices for the first two chests

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    products = sa.table(
        "products",
        sa.column("product_id", sa.BigInteger()),
        sa.column("price", sa.Numeric(10, 2)),
    )
    op.execute(products.update().where(products.c.product_id == 1001).values(price=20))
    op.execute(products.update().where(products.c.product_id == 1002).values(price=30))


def downgrade() -> None:
    products = sa.table(
        "products",
        sa.column("product_id", sa.BigInteger()),
        sa.column("price", sa.Numeric(10, 2)),
    )
    op.execute(products.update().where(products.c.product_id == 1001).values(price=20))
    op.execute(products.update().where(products.c.product_id == 1002).values(price=30))
