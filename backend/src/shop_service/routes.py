import logging

from shop_service.exeptions import InternalError, PaymentFailedError
from fastapi import APIRouter, Depends, HTTPException, status
from shop_service.infrastructure.database.repo.requests import RequestsRepo
from shop_service.services import process_transaction
from starlette.requests import Request

from shop_service.producers import get_kafka_manager, KafkaProducerManager
from shop_service.utils import get_repo

log = logging.getLogger(__name__)

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    return await repo.products.get_all()


@router.post("/{product_id}/buy")
async def buy_product(product_id: int, request: Request, repo: RequestsRepo = Depends(get_repo), producer: KafkaProducerManager = Depends(get_kafka_manager)):
    user_id = (await request.json())["user_id"]

    product = await repo.products.get_by_id(product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    try:
        price = float(product.price)
        # TODO: add transactional outbox
        ordered_product_id = await process_transaction(repo, user_id, product.product_id, price)
        await producer.send_message(
            "order_created",
            {"user_id": user_id, "product_id": product_id, "order_id": ordered_product_id, "price": price},
        )
    except PaymentFailedError as err:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=f"Payment failed: {err}")
    except InternalError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
