"""initial

Revision ID: 1fd79e286cea
Revises:
Create Date: 2025-02-23 15:55:15.499468

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1fd79e286cea"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "products",
        sa.Column("product_id", sa.BIGINT(), autoincrement=False, nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=256), nullable=True),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("product_id"),
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("products")
    # ### end Alembic commands ###
