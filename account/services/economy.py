import random
from datetime import datetime, timedelta, timezone

from infrastructure.database.models.wallet import PlayerWallet, ProcessedBattle
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .shop_catalog import ShopCatalogClient, shop_catalog_client

MAX_ENERGY = 100
ENERGY_REGEN_SECONDS = 300
WIN_GOLD = 10
TAUNT_COST = 10
CHESTS = {
    1001: {"reward": (5, 10), "crystal_chance": 10, "crystal_reward": (5, 10)},
    1002: {"reward": (15, 20), "crystal_chance": 20, "crystal_reward": (15, 20)},
    1003: {"reward": (30, 50), "crystal_chance": 50, "crystal_reward": (40, 50)},
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
        wallet = PlayerWallet(
            user_id=user_id,
            gold=0,
            crystals=0,
            taunt_charges=0,
            taunt_expires_at=None,
            energy=MAX_ENERGY,
        )
        session.add(wallet)
        await session.flush()
    return wallet, _refill(wallet)


async def wallet_view(session, user_id):
    wallet, next_in = await get_wallet(session, user_id, True)
    await session.commit()
    now = datetime.now(timezone.utc)
    taunt_expires_at = wallet.taunt_expires_at
    if taunt_expires_at and taunt_expires_at.tzinfo is None:
        taunt_expires_at = taunt_expires_at.replace(tzinfo=timezone.utc)
    return {
        "user_id": user_id,
        "gold": wallet.gold,
        "crystals": wallet.crystals,
        "taunt_charges": wallet.taunt_charges,
        "taunt_active": bool(taunt_expires_at and taunt_expires_at > now),
        "taunt_expires_at": taunt_expires_at.isoformat() if taunt_expires_at else None,
        "taunt_pack_cost": TAUNT_COST,
        "taunt_pack_charges": 0,
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


async def spend_taunt(session, user_id, taunt_id, now=None):
    if taunt_id != "clown_laugh":
        raise LookupError("Насмешка не найдена")
    wallet, _ = await get_wallet(session, user_id, True)
    now = now or datetime.now(timezone.utc)
    expires_at = wallet.taunt_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at <= now:
        raise ValueError("Нет оплаченных насмешек")
    await session.commit()
    return {
        "taunt_id": taunt_id,
        "taunt_active": True,
        "taunt_expires_at": expires_at.isoformat(),
        "crystals": wallet.crystals,
    }


async def purchase_taunt_pack(session, user_id, now=None):
    wallet, _ = await get_wallet(session, user_id, True)
    if wallet.crystals < TAUNT_COST:
        raise ValueError("Недостаточно кристаллов")
    wallet.crystals -= TAUNT_COST
    now = now or datetime.now(timezone.utc)
    wallet.taunt_expires_at = now + timedelta(days=1)
    await session.commit()
    return {
        "cost": TAUNT_COST,
        "taunt_active": True,
        "taunt_expires_at": wallet.taunt_expires_at.isoformat(),
        "crystals": wallet.crystals,
    }


async def open_chest(
    session,
    user_id,
    product_id,
    catalog_client: ShopCatalogClient | None = None,
):
    chest = CHESTS.get(product_id)
    if chest is None:
        raise LookupError("Сундук не найден")
    price = await (catalog_client or shop_catalog_client).get_price(product_id)
    wallet, _ = await get_wallet(session, user_id, True)
    if wallet.gold < price:
        raise ValueError("Недостаточно золота")
    rolled = random.randint(*chest["reward"])
    crystal_reward = 0
    if random.random() < chest["crystal_chance"] / 100:
        crystal_reward = random.randint(*chest["crystal_reward"])
    before = wallet.energy
    wallet.gold -= price
    wallet.crystals += crystal_reward
    wallet.energy = min(MAX_ENERGY, wallet.energy + rolled)
    if wallet.energy == MAX_ENERGY:
        wallet.energy_updated_at = datetime.now(timezone.utc)
    await session.commit()
    return {
        "product_id": product_id,
        "energy_reward": wallet.energy - before,
        "rolled_energy": rolled,
        "gold": wallet.gold,
        "crystals": wallet.crystals,
        "crystals_reward": crystal_reward,
        "taunt_charges": wallet.taunt_charges,
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
