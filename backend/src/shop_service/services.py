import logging
from typing import Any

import httpx
from constants import USERS_SERVICE_URL
from exeptions import InternalError, PaymentFailedError
from infrastructure.database.models.products import Status
from infrastructure.database.repo.requests import RequestsRepo
from starlette import status

log = logging.getLogger(__name__)

PAYMENT_ENDPOINT = "/payment/"
REFUND_ENDPOINT = "/payment/refund"
TIMEOUT = 30.0


class PaymentClient:
    def __init__(self, base_url: str = USERS_SERVICE_URL, timeout: float = TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def _make_request(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{endpoint}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload)
        except httpx.RequestError as e:
            log.error(f"Network error during payment request to {url}: {e}")
            raise PaymentFailedError(f"Network error: {e}") from e

        self._handle_response(resp, endpoint)
        return resp.json()

    def _handle_response(self, resp: httpx.Response, endpoint: str) -> None:
        if resp.status_code == status.HTTP_200_OK:
            log.debug(f"Successful request to {endpoint}: {resp.status_code}")
            return

        log.warning(f"Failed request to {endpoint}: {resp.status_code}. Response: {resp.text}")

        try:
            error_data = resp.json()
            error_message = error_data.get("detail", error_data)
        except ValueError:
            error_message = resp.text

        raise PaymentFailedError(error_message)

    async def process_payment(self, user_id: int, amount: float, payment_key: str) -> dict[str, Any]:
        payload = {"user_id": user_id, "amount": int(amount), "payment_key": payment_key}

        log.info(f"Processing payment for user {user_id}, amount: {amount}")
        return await self._make_request(PAYMENT_ENDPOINT, payload)

    async def refund(self, user_id: int, amount: float, payment_key: str) -> dict[str, Any]:
        payload = {"user_id": user_id, "amount": int(amount), "payment_key": payment_key}

        log.info(f"Processing refund for user {user_id}, amount: {amount}")
        return await self._make_request(REFUND_ENDPOINT, payload)


payment_client = PaymentClient()


async def process_transaction(repo: RequestsRepo, user_id: int, product_id: int, price: float):
    ordered_product = None
    try:
        ordered_product = await repo.ordered_products.create(user_id, product_id, Status.PENDING, commit=False)
        if not ordered_product:
            raise InternalError("Failed to create order product")

        await payment_client.process_payment(user_id, price, payment_key=ordered_product.id)

        await repo.ordered_products.update_status(ordered_product.id, Status.PAID)

        # log.info(f"User {user_id}, product {product_id}. Transaction committed successfully")

        return ordered_product.id

    except Exception as e:
        log.error(f"User {user_id}, product {product_id}. Transaction failed: {e}")

        if ordered_product and ordered_product.id and not isinstance(e, PaymentFailedError):
            try:
                await payment_client.refund(user_id, price, payment_key=ordered_product.id)
            except Exception as refund_err:
                log.error(f"Refund failed for order {ordered_product.id}: {refund_err}")
                raise
        raise
