import httpx

from starlette import status

from config import Config, load_config
from exeptions import PaymentFailedError
from infrastructure.database.repo.requests import RequestsRepo
from infrastructure.database.setup import create_engine, create_session_pool
from constants import USERS_SERVICE_URL

config: Config = load_config()
engine = create_engine(config.db)
session_pool = create_session_pool(engine)


async def get_repo():
    async with session_pool() as session:
        yield RequestsRepo(session)


async def process_payment(user_id: int, price: float, payment_key: str):
    # TODO: payment
    # await asyncio.sleep(5)
    # if random() < 0.05:  # 5% probability
    #     raise PaymentFailedError("Payment failed")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{USERS_SERVICE_URL}/payment/",
            json={"user_id": user_id, "amount": price, "payment_key": payment_key}
        )

    if resp.status_code != status.HTTP_200_OK:
        raise PaymentFailedError(f"Payment failed: {resp.text}")

    return resp.json()


async def refund_payment(user_id: int, price: float, payment_key: str):
    # TODO: refund payment
    # await asyncio.sleep(5)
    # if random() < 0.05:  # 5% probability
    #     raise PaymentFailedError("Refund Payment failed")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{USERS_SERVICE_URL}/payment/refund",
            json={"user_id": user_id, "amount": price, "payment_key": payment_key}
        )

    if resp.status_code != status.HTTP_200_OK:
        raise PaymentFailedError(f"Payment failed: {resp.text}")

    return resp.json()