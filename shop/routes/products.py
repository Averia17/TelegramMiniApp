import logging

from auth import AuthenticatedUser, current_user, require_shop_service
from consumers import send_kafka_message
from exeptions import InternalError, PaymentFailedError
from fastapi import APIRouter, Depends, HTTPException, Request, status
from infrastructure import RequestsRepo
from services import process_transaction
from utils import get_repo

log = logging.getLogger(__name__)

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    return await repo.products.get_all()


@router.get("/{product_id}/price", dependencies=[Depends(require_shop_service)])
async def get_product_price(product_id: int, repo: RequestsRepo = Depends(get_repo)):
    product = await repo.products.get_by_id(product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    return {"product_id": product.product_id, "price": float(product.price)}


@router.post("/{product_id}/buy")
async def buy_product(
    product_id: int,
    repo: RequestsRepo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    user_id = user.user_id

    product = await repo.products.get_by_id(product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    try:
        price = float(product.price)
        ordered_product_id = await process_transaction(
            repo, user_id, product.product_id, price
        )
        await send_kafka_message(
            "order_created",
            {
                "user_id": user_id,
                "product_id": product_id,
                "order_id": ordered_product_id,
                "price": price,
            },
        )
    except PaymentFailedError as err:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=f"Payment failed: {err}",
        )
    except InternalError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
