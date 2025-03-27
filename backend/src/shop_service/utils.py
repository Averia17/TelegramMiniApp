import asyncio
from random import random

from config import Config, load_config
from exeptions import PaymentFailedError
from infrastructure.database.repo.requests import RequestsRepo
from infrastructure.database.setup import create_engine, create_session_pool

config: Config = load_config()
engine = create_engine(config.db)
session_pool = create_session_pool(engine)


async def get_repo():
    async with session_pool() as session:
        yield RequestsRepo(session)


async def process_payment(user_id: int, price: float):
    # TODO: payment
    await asyncio.sleep(5)
    if random() < 0.05:  # 5% probability
        raise PaymentFailedError("Payment failed")
