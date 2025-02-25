from fastapi import APIRouter, Depends

from infrastructure.database.repo.requests import RequestsRepo
from utils import get_repo

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    return await repo.products.get_all()

@router.get("/{id}/buy")
async def buy_product(repo: RequestsRepo = Depends(get_repo), product_id: int = None, user_id: int = None):
    ordered_product = await repo.ordered_products.create(user_id, product_id)
    if ordered_product:
        return {"ordered_product_id": ordered_product.id}
