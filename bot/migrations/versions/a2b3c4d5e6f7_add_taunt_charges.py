"""add server-owned taunt charges

Revision ID: a2b3c4d5e6f7
Revises: f1a4c7d8e9b0
"""

from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "f1a4c7d8e9b0"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "playerwallets",
        sa.Column("taunt_charges", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_check_constraint(
        "ck_wallet_taunt_charges_nonnegative", "playerwallets", "taunt_charges >= 0"
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_wallet_taunt_charges_nonnegative", "playerwallets", type_="check"
    )
    op.drop_column("playerwallets", "taunt_charges")
