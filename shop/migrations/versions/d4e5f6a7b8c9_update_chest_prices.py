"""align chest gold prices with the economy rules

Revision ID: d4e5f6a7b8c9
Revises: c3a91f02d4be
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3a91f02d4be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    products = sa.table(
        "products",
        sa.column("product_id", sa.BigInteger()),
        sa.column("price", sa.Numeric(10, 2)),
        sa.column("description", sa.String()),
    )
    op.execute(
        products.update()
        .where(products.c.product_id == 1001)
        .values(
            price=20,
            description="Содержит 5-10 энергии. Шанс 10%: 5-10 кристаллов.",
        )
    )
    op.execute(
        products.update()
        .where(products.c.product_id == 1002)
        .values(
            price=30,
            description="Содержит 15-20 энергии. Шанс 20%: 15-20 кристаллов.",
        )
    )
    op.execute(
        products.update()
        .where(products.c.product_id == 1003)
        .values(
            price=50,
            description="Содержит 30-50 энергии. Шанс 50%: 40-50 кристаллов.",
        )
    )


def downgrade() -> None:
    products = sa.table(
        "products",
        sa.column("product_id", sa.BigInteger()),
        sa.column("price", sa.Numeric(10, 2)),
    )
    op.execute(products.update().where(products.c.product_id == 1001).values(price=20))
    op.execute(products.update().where(products.c.product_id == 1002).values(price=30))
