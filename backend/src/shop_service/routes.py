import logging

from exeptions import InternalError, PaymentFailedError
from fastapi import APIRouter, Depends, HTTPException, status
from infrastructure.database.repo.requests import RequestsRepo
from sqlalchemy.exc import ArgumentError, NoResultFound
from starlette.requests import Request
from utils import get_repo, process_payment

log = logging.getLogger(__name__)

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    return await repo.products.get_all()


@router.post("/{product_id}/buy")
async def buy_product(product_id: int, request: Request, repo: RequestsRepo = Depends(get_repo)):
    user_id = (await request.json())["user_id"]

    product = await repo.products.get_by_id(product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

    try:
        async with repo.session.begin() as transaction:
            try:
                ordered_product = await repo.ordered_products.create(user_id, product_id, commit=False)
                if not ordered_product:
                    raise InternalError("Failed to create order product")

                await process_payment(user_id, product)

                await transaction.commit()
                log.info(f"User {user_id}, product {product_id}. Transaction committed successfully")

                return {"ordered_product_id": ordered_product.id}

            except Exception as e:
                await transaction.rollback()
                log.error(f"User {user_id}, product {product_id}. Transaction failed: {e}")
                raise
    except PaymentFailedError:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail="Payment failed")
    except InternalError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
