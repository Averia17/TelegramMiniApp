"""add premium crystals to player wallets

Revision ID: f1a4c7d8e9b0
Revises: e8d4a3b71c20
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a4c7d8e9b0"
down_revision: Union[str, None] = "e8d4a3b71c20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "playerwallets",
        sa.Column("crystals", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "ck_wallet_crystals_nonnegative", "playerwallets", "crystals >= 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_wallet_crystals_nonnegative", "playerwallets", type_="check")
    op.drop_column("playerwallets", "crystals")
