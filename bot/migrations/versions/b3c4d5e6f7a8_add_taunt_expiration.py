"""replace taunt charges with a daily access window

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "playerwallets",
        sa.Column("taunt_expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("playerwallets", "taunt_expires_at")
