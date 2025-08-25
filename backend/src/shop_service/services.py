import logging

from exeptions import InternalError, PaymentFailedError
from infrastructure.database.models.products import Status
from infrastructure.database.repo.requests import RequestsRepo
from utils import process_payment, refund_payment

log = logging.getLogger(__name__)

async def process_transaction(repo: RequestsRepo, user_id: int, product_id: int, price: float):
    # async with repo.session.begin() as transaction:
    ordered_product = None
    try:
        ordered_product = await repo.ordered_products.create(user_id, product_id, Status.PENDING, commit=False)
        if not ordered_product:
            raise InternalError("Failed to create order product")

        await process_payment(user_id, price, payment_key=ordered_product.id)

        await repo.ordered_products.update_status(ordered_product.id, Status.PAID)

        # await transaction.commit()
        log.info(f"User {user_id}, product {product_id}. Transaction committed successfully")

        return ordered_product.id

    except Exception as e:
        # await transaction.rollback()
        log.error(f"User {user_id}, product {product_id}. Transaction failed: {e}")

        if ordered_product and ordered_product.id and not isinstance(e, PaymentFailedError):
            try:
                await refund_payment(user_id, price, payment_key=ordered_product.id)
            except Exception as refund_err:
                log.error(f"Refund failed for order {ordered_product.id}: {refund_err}")
                raise
        raise