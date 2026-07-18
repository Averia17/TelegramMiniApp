from fastapi import APIRouter, Depends, HTTPException
from infrastructure import RequestsRepo
from services.economy import open_chest, spend_battle_energy, wallet_view
from utils import get_repo

router = APIRouter(prefix="/economy")


@router.get("/{user_id}")
async def get_economy(user_id: int, repo: RequestsRepo = Depends(get_repo)):
    return await wallet_view(repo.session, user_id)


@router.post("/{user_id}/battle")
async def start_battle(user_id: int, repo: RequestsRepo = Depends(get_repo)):
    try:
        return await spend_battle_energy(repo.session, user_id)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))


@router.post("/{user_id}/chests/{product_id}/open")
async def buy_chest(
    user_id: int, product_id: int, repo: RequestsRepo = Depends(get_repo)
):
    try:
        return await open_chest(repo.session, user_id, product_id)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))
