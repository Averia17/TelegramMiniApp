import random
from datetime import datetime, timedelta, timezone

from infrastructure.database.models.wallet import PlayerWallet, ProcessedBattle
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

MAX_ENERGY = 100
ENERGY_REGEN_SECONDS = 300
WIN_GOLD = 10
CHESTS = {
    1001: {"price": 20, "reward": (5, 10)},
    1002: {"price": 30, "reward": (15, 20)},
    1003: {"price": 50, "reward": (30, 50)},
}


def _refill(wallet, now=None):
    now = now or datetime.now(timezone.utc)
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


async def refill_all_wallets(session, now=None):
    now = now or datetime.now(timezone.utc)
    wallets = (
        (
            await session.execute(
                select(PlayerWallet)
                .where(PlayerWallet.energy < MAX_ENERGY)
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    updated = 0
    for wallet in wallets:
        before = wallet.energy
        _refill(wallet, now)
        if wallet.energy != before:
            updated += 1
    await session.commit()
    return updated


async def get_wallet(session, user_id, lock=False):
    stmt = select(PlayerWallet).where(PlayerWallet.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    wallet = (await session.execute(stmt)).scalar_one_or_none()
    if wallet is None:
        wallet = PlayerWallet(user_id=user_id, gold=0, energy=MAX_ENERGY)
        session.add(wallet)
        await session.flush()
    return wallet, _refill(wallet)


async def wallet_view(session, user_id):
    wallet, next_in = await get_wallet(session, user_id, True)
    await session.commit()
    return {
        "user_id": user_id,
        "gold": wallet.gold,
        "energy": wallet.energy,
        "max_energy": MAX_ENERGY,
        "next_energy_in": next_in,
    }


async def spend_battle_energy(session, user_id):
    wallet, _ = await get_wallet(session, user_id, True)
    if wallet.energy < 1:
        raise ValueError("Недостаточно энергии")
    wallet.energy -= 1
    if wallet.energy == MAX_ENERGY - 1:
        wallet.energy_updated_at = datetime.now(timezone.utc)
    await session.commit()
    return await wallet_view(session, user_id)


async def open_chest(session, user_id, product_id):
    chest = CHESTS.get(product_id)
    if chest is None:
        raise LookupError("Сундук не найден")
    wallet, _ = await get_wallet(session, user_id, True)
    if wallet.gold < chest["price"]:
        raise ValueError("Недостаточно золота")
    rolled = random.randint(*chest["reward"])
    before = wallet.energy
    wallet.gold -= chest["price"]
    wallet.energy = min(MAX_ENERGY, wallet.energy + rolled)
    if wallet.energy == MAX_ENERGY:
        wallet.energy_updated_at = datetime.now(timezone.utc)
    await session.commit()
    return {
        "product_id": product_id,
        "energy_reward": wallet.energy - before,
        "rolled_energy": rolled,
        "gold": wallet.gold,
        "energy": wallet.energy,
        "max_energy": MAX_ENERGY,
    }


async def award_battle_result(session, result):
    event_id = f"{result.get('roomId','')}:{result.get('endedAt',0)}"
    if await session.get(ProcessedBattle, event_id):
        return
    session.add(ProcessedBattle(event_id=event_id))
    for player in result.get("players", []):
        if not player.get("won"):
            continue
        try:
            user_id = int(player.get("playerId"))
        except (TypeError, ValueError):
            continue
        wallet, _ = await get_wallet(session, user_id, True)
        wallet.gold += WIN_GOLD
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
