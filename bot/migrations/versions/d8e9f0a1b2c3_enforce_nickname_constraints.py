"""make game nickname mandatory and enforce its minimum length

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-08-22 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing real Telegram IDs are longer than three characters. The
    # Player fallback only covers synthetic short IDs used by old test data.
    op.execute(
        """
        UPDATE users
        SET nickname = CASE
            WHEN char_length(user_id::text) > 3 THEN user_id::text
            ELSE 'Player' || user_id::text
        END
        WHERE nickname IS NULL OR char_length(btrim(nickname)) <= 3
        """
    )
    op.alter_column(
        "users",
        "nickname",
        existing_type=sa.String(length=20),
        existing_nullable=True,
        nullable=False,
    )
    op.create_check_constraint(
        "ck_users_nickname_min_length",
        "users",
        "char_length(btrim(nickname)) > 3",
    )


def downgrade() -> None:
    op.drop_constraint("ck_users_nickname_min_length", "users", type_="check")
    op.alter_column(
        "users",
        "nickname",
        existing_type=sa.String(length=20),
        existing_nullable=False,
        nullable=True,
    )
