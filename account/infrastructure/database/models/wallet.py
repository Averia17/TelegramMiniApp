from sqlalchemy import BIGINT, CheckConstraint, Integer, String
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from .base import Base, TableNameMixin, TimestampMixin


class PlayerWallet(Base, TableNameMixin):
    user_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=False)
    gold: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    crystals: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    taunt_charges: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    taunt_expires_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    energy: Mapped[int] = mapped_column(Integer, default=100, server_default="100")
    energy_updated_at: Mapped[object] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    __table_args__ = (
        CheckConstraint("gold >= 0"),
        CheckConstraint("crystals >= 0"),
        CheckConstraint("taunt_charges >= 0"),
        CheckConstraint("energy >= 0 AND energy <= 100"),
    )


class ProcessedBattle(Base, TimestampMixin, TableNameMixin):
    event_id: Mapped[str] = mapped_column(String(128), primary_key=True)
