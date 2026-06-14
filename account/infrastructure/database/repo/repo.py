from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from .transaction import TransactionRepo
from .user import UserRepo


@dataclass
class Repo:
    session: AsyncSession

    @property
    def users(self) -> UserRepo:
        return UserRepo(self.session)

    @property
    def transactions(self) -> TransactionRepo:
        return TransactionRepo(self.session)
