import random
from datetime import datetime, timedelta, timezone

from infrastructure.database.models.products import (PlayerWallet,
                                                     ProcessedBattle, Product)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

MAX_ENERGY = 100
ENERGY_REGEN_SECONDS = 300
WIN_GOLD = 10
CHEST_REWARDS = {1001: (5, 10), 1002: (15, 20), 1003: (30, 50)}


def _refill(wallet: PlayerWallet) -> int:
    now = datetime.now(timezone.utc)
    updated = wallet.energy_updated_at
    if updated.tzinfo is None:
        updated = updated.replace(tzinfo=timezone.utc)
    gained = int((now - updated).total_seconds() // ENERGY_REGEN_SECONDS)
    if gained > 0 and wallet.energy < MAX_ENERGY:
        applied = min(gained, MAX_ENERGY - wallet.energy)
        wallet.energy += applied
        wallet.energy_updated_at = (
            now
            if wallet.energy == MAX_ENERGY
            else updated + timedelta(seconds=applied * ENERGY_REGEN_SECONDS)
        )
    elif wallet.energy >= MAX_ENERGY:
        wallet.energy_updated_at = now
    return (
        max(
            0,
            ENERGY_REGEN_SECONDS
            - int((now - wallet.energy_updated_at).total_seconds()),
        )
        if wallet.energy < MAX_ENERGY
        else 0
    )


async def get_wallet(session, user_id: int, lock=False):
    stmt = select(PlayerWallet).where(PlayerWallet.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    wallet = (await session.execute(stmt)).scalar_one_or_none()
    if wallet is None:
        wallet = PlayerWallet(user_id=user_id, gold=0, energy=MAX_ENERGY)
        session.add(wallet)
        await session.flush()
    next_energy_in = _refill(wallet)
    return wallet, next_energy_in


async def wallet_view(session, user_id: int):
    wallet, next_energy_in = await get_wallet(session, user_id, True)
    await session.commit()
    return {
        "user_id": user_id,
        "gold": wallet.gold,
        "energy": wallet.energy,
        "max_energy": MAX_ENERGY,
        "next_energy_in": next_energy_in,
    }


async def spend_battle_energy(session, user_id: int):
    wallet, _ = await get_wallet(session, user_id, True)
    if wallet.energy < 1:
        raise ValueError("Недостаточно энергии")
    wallet.energy -= 1
    if wallet.energy == MAX_ENERGY - 1:
        wallet.energy_updated_at = datetime.now(timezone.utc)
    await session.commit()
    return await wallet_view(session, user_id)


async def open_chest(session, user_id: int, product_id: int):
    reward_range = CHEST_REWARDS.get(product_id)
    if not reward_range:
        raise LookupError("Сундук не найден")
    product = (
        await session.execute(select(Product).where(Product.product_id == product_id))
    ).scalar_one_or_none()
    if product is None:
        raise LookupError("Сундук не найден")
    wallet, _ = await get_wallet(session, user_id, True)
    price = int(product.price)
    if wallet.gold < price:
        raise ValueError("Недостаточно золота")
    reward = random.randint(*reward_range)
    wallet.gold -= price
    before = wallet.energy
    wallet.energy = min(MAX_ENERGY, wallet.energy + reward)
    if wallet.energy == MAX_ENERGY:
        wallet.energy_updated_at = datetime.now(timezone.utc)
    await session.commit()
    return {
        "product_id": product_id,
        "energy_reward": wallet.energy - before,
        "rolled_energy": reward,
        "gold": wallet.gold,
        "energy": wallet.energy,
        "max_energy": MAX_ENERGY,
    }


async def award_battle_result(session, result: dict):
    event_id = f"{result.get('roomId','')}:{result.get('endedAt',0)}"
    if (await session.get(ProcessedBattle, event_id)) is not None:
        return
    session.add(ProcessedBattle(event_id=event_id))
    for player in result.get("players", []):
        if player.get("won") and player.get("playerId"):
            try:
                user_id = int(player["playerId"])
            except (TypeError, ValueError):
                continue
            wallet, _ = await get_wallet(session, user_id, True)
            wallet.gold += WIN_GOLD
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
