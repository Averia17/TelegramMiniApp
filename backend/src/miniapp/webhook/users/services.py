from miniapp.infrastructure.database.repo.users import UserRepo


class PaymentService:
    def __init__(self, user_repo: UserRepo):
        self.repo = user_repo

    async def increase_balance(self, user_id: int, amount: int) -> dict:
        user = await self.repo.get_by_id(user_id)
        user.clicks += amount
        await self.repo.session.commit()
        return {"status": "success", "user_id": user_id, "new_balance": user.clicks}

    async def decrease_balance(self, user_id: int, amount: int) -> dict:
        user = await self.repo.get_by_id(user_id)
        user.clicks -= amount
        await self.repo.session.commit()
        return {"status": "success", "user_id": user_id, "new_balance": user.clicks}
