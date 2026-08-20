from auth import AuthenticatedUser, current_user
from fastapi import APIRouter, Depends, HTTPException
from infrastructure import Repo
from services import (
    open_chest,
    purchase_taunt_pack,
    spend_battle_energy,
    spend_taunt,
    wallet_view,
)
from services.shop_catalog import ShopCatalogError

from .deps import get_repo

router = APIRouter(prefix="/economy")


@router.get("/me")
async def get_my_economy(
    repo: Repo = Depends(get_repo), user: AuthenticatedUser = Depends(current_user)
):
    return await wallet_view(repo.session, user.user_id)


@router.post("/me/battle")
async def start_my_battle(
    repo: Repo = Depends(get_repo), user: AuthenticatedUser = Depends(current_user)
):
    try:
        return await spend_battle_energy(repo.session, user.user_id)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))


@router.post("/me/taunt")
async def use_my_taunt(
    payload: dict,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        return await spend_taunt(
            repo.session, user.user_id, payload.get("taunt_id", "")
        )
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))


@router.post("/me/taunt-pack")
async def buy_my_taunt_pack(
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        return await purchase_taunt_pack(repo.session, user.user_id)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))


@router.post("/me/chests/{product_id}/open")
async def open_my_chest(
    product_id: int,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    try:
        return await open_chest(repo.session, user.user_id, product_id)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except ShopCatalogError:
        raise HTTPException(status_code=503, detail="Магазин временно недоступен")
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))


@router.get("/{user_id}")
async def get_economy(
    user_id: int,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    if user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user")
    return await wallet_view(repo.session, user_id)


@router.post("/{user_id}/battle")
async def start_battle(
    user_id: int,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    if user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user")
    try:
        return await spend_battle_energy(repo.session, user_id)
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))


@router.post("/{user_id}/chests/{product_id}/open")
async def buy_chest(
    user_id: int,
    product_id: int,
    repo: Repo = Depends(get_repo),
    user: AuthenticatedUser = Depends(current_user),
):
    if user.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user")
    try:
        return await open_chest(repo.session, user_id, product_id)
    except LookupError as err:
        raise HTTPException(status_code=404, detail=str(err))
    except ShopCatalogError:
        raise HTTPException(status_code=503, detail="Магазин временно недоступен")
    except ValueError as err:
        raise HTTPException(status_code=409, detail=str(err))
