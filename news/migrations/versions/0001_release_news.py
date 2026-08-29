"""create release news table

Revision ID: 0001_release_news
Revises:
Create Date: 2026-08-29
"""

import sqlalchemy as sa
from alembic import op

revision = "0001_release_news"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "release_news",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tag", sa.String(length=32), nullable=False),
        sa.Column("commit_sha", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tag"),
    )
    op.create_index(
        "ix_release_news_published_at", "release_news", ["published_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_release_news_published_at", table_name="release_news")
    op.drop_table("release_news")
