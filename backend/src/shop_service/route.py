from fastapi import APIRouter, Depends
from sqlalchemy import select

from infrastructure.database.models.products import Product
from infrastructure.database.repo.requests import RequestsRepo
from utils import get_repo

router = APIRouter(prefix="/products")


@router.get("/")
async def get_products(repo: RequestsRepo = Depends(get_repo)):
    result = await repo.session.execute(select(
        Product.name,
        Product.price,
        Product.description,
    ))
    return result.mappings().all()

@router.get("/{id}/buy")
async def buy_product(repo: RequestsRepo = Depends(get_repo), request_user_id: str = None):
    result = await repo.session.execute(select(
        Product.name,
        Product.price,
        Product.description,
    ))
    return result.mappings().all()
