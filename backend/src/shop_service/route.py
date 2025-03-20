import logging

from fastapi import APIRouter, Depends

from infrastructure.database.repo.requests import RequestsRepo
from utils import get_repo


log = logging.getLogger(__name__)

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    return await repo.products.get_all()

@router.post("/{product_id}/buy")
async def buy_product(repo: RequestsRepo = Depends(get_repo), product_id: int = None, user_id: int = None):
    log.info(f"Buying {product_id} for user {user_id}")
    # валидация юзера и продукта
    # оплата
    # создание продукта в базе
    ordered_product = await repo.ordered_products.create(user_id, product_id)
    if ordered_product:
        return {"ordered_product_id": ordered_product.id}
