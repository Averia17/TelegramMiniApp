"""seed chest products

Revision ID: c3a91f02d4be
Revises: b6bb68307028
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3a91f02d4be"
down_revision: Union[str, None] = "b6bb68307028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    products = sa.table(
        "products",
        sa.column("product_id", sa.BIGINT()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("price", sa.Numeric(10, 2)),
    )
    op.bulk_insert(
        products,
        [
            {
                "product_id": 1001,
                "name": "Обычный сундук",
                "description": "Содержит от 5 до 10 энергии",
                "price": 20,
            },
            {
                "product_id": 1002,
                "name": "Большой сундук",
                "description": "Содержит от 15 до 20 энергии",
                "price": 30,
            },
            {
                "product_id": 1003,
                "name": "Мега-сундук",
                "description": "Содержит от 30 до 50 энергии",
                "price": 50,
            },
        ],
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM products WHERE product_id IN (1001, 1002, 1003)"))
