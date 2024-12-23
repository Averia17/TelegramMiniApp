from typing import Optional

from sqlalchemy import select, update, desc
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import insert

from miniapp.infrastructure.database.models import User
from miniapp.infrastructure.database.repo.base import BaseRepo


class UserRepo(BaseRepo):
    async def get_or_create_user(
        self,
        user_id: int,
        full_name: str,
        username: Optional[str] = None,
    ):
        """
        Creates or updates a new user in the database and returns the user object.
        :param user_id: The user's ID.
        :param full_name: The user's full name.
        :param username: The user's username. It's an optional parameter.
        :return: User object, None if there was an error while making a transaction.
        """

        insert_stmt = (
            insert(User)
            .values(
                user_id=user_id,
                username=username,
                full_name=full_name,
            )
            .on_conflict_do_update(
                index_elements=[User.user_id],
                set_=dict(
                    username=username,
                    full_name=full_name,
                ),
            )
            .returning(User)
        )
        result = await self.session.execute(insert_stmt)

        await self.session.commit()
        return result.scalar_one()

    async def get_by_id(self, user_id: int):
        return (await self.session.execute(select(User).where(User.user_id == user_id))).scalar_one_or_none()

    async def update_clicks(self, user_id: int, clicks: int):
        query = update(User).where(User.user_id == user_id).values(clicks=clicks)
        await self.session.execute(query)
        await self.session.commit()

    async def update_completed_tasks(self, user_id: int, tasks: list, reward: int):
        query = update(User).where(User.user_id == user_id).values(completed_tasks=tasks, clicks=User.clicks + reward)
        await self.session.execute(query)
        await self.session.commit()

