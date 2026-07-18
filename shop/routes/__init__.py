from fastapi import APIRouter
from .products import router as products_router
from .economy import router as economy_router

router = APIRouter()
router.include_router(products_router)
router.include_router(economy_router)

__all__ = ["router"]
