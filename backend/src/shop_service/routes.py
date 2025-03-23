import logging
from fastapi import HTTPException

from fastapi import APIRouter, Depends, status
from starlette.requests import Request

from infrastructure.database.repo.requests import RequestsRepo
from utils import get_repo, process_payment

log = logging.getLogger(__name__)

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    return await repo.products.get_all()

@router.post("/{product_id}/buy")
async def buy_product(product_id: int, request: Request, repo: RequestsRepo = Depends(get_repo)):
    user_id = (await request.json())["user_id"]

    async with repo.session.begin() as transaction:
        try:
            product = await repo.products.get_by_id(product_id)
            if not product:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")

            ordered_product = await repo.ordered_products.create(user_id, product_id, commit=False)
            if not ordered_product:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create order")

            await process_payment(user_id, product)

            await transaction.commit()
            log.info(f"User {user_id}, product {product_id}. Transaction committed successfully")

            return {"ordered_product_id": ordered_product.id}

        except Exception as e:
            await transaction.rollback()
            log.error(f"User {user_id}, product {product_id}. Transaction failed: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Transaction failed")