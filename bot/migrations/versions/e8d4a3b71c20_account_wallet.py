"""account wallet and processed battle rewards

Revision ID: e8d4a3b71c20
Revises: 89a5afe09ae6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e8d4a3b71c20"
down_revision: Union[str, None] = "89a5afe09ae6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "playerwallets",
        sa.Column("user_id", sa.BIGINT(), nullable=False),
        sa.Column("gold", sa.Integer(), server_default="0", nullable=False),
        sa.Column("energy", sa.Integer(), server_default="100", nullable=False),
        sa.Column(
            "energy_updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id"),
        sa.CheckConstraint("gold >= 0", name="ck_wallet_gold_nonnegative"),
        sa.CheckConstraint(
            "energy >= 0 AND energy <= 100", name="ck_wallet_energy_range"
        ),
    )
    op.create_table(
        "processedbattles",
        sa.Column("event_id", sa.String(128), nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("event_id"),
    )


def downgrade() -> None:
    op.drop_table("processedbattles")
    op.drop_table("playerwallets")
