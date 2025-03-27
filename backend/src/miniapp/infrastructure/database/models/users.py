from typing import Optional

from sqlalchemy import ARRAY, BIGINT, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TableNameMixin, TimestampMixin


class User(Base, TimestampMixin, TableNameMixin):
    user_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=False)
    username: Mapped[Optional[str]] = mapped_column(String(128))
    full_name: Mapped[str] = mapped_column(String(128))
    clicks: Mapped[int] = mapped_column(BIGINT, server_default="0")
    completed_tasks: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=[], server_default="{}")
    tb_username: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    received_invite: Mapped[list["Invite"]] = relationship(
        back_populates="invitee", foreign_keys="[Invite.invitee_id]"
    )

    def __repr__(self):
        return f"<User {self.user_id} {self.username} {self.full_name}>"


class Invite(Base, TimestampMixin, TableNameMixin):
    invite_id: Mapped[int] = mapped_column(BIGINT, primary_key=True, autoincrement=True)
    inviter_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"))
    invitee_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), unique=True)

    invitee: Mapped["User"] = relationship(back_populates="received_invite", foreign_keys="[Invite.invitee_id]")

    __table_args__ = (UniqueConstraint("inviter_id", "invitee_id", name="unique_invites"),)
