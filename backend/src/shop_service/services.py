import logging

from exeptions import InternalError
from infrastructure.database.repo.requests import RequestsRepo
from utils import process_payment


log = logging.getLogger(__name__)

async def process_transaction(repo: RequestsRepo, user_id: int, product_id: int, price: float):
    async with repo.session.begin() as transaction:
        try:
            ordered_product = await repo.ordered_products.create(user_id, product_id, commit=False)
            if not ordered_product:
                raise InternalError("Failed to create order product")

            await process_payment(user_id, price)

            await transaction.commit()
            log.info(f"User {user_id}, product {product_id}. Transaction committed successfully")

            return ordered_product.id

        except Exception as e:
            await transaction.rollback()
            log.error(f"User {user_id}, product {product_id}. Transaction failed: {e}")
            raise