import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from services.economy import (open_chest, purchase_taunt_pack,
                              refill_all_wallets, spend_taunt)
from services.shop_catalog import ShopCatalogError


class _Scalars:
    def __init__(self, wallets):
        self._wallets = wallets

    def all(self):
        return self._wallets


class _Result:
    def __init__(self, wallets):
        self._wallets = wallets

    def scalars(self):
        return _Scalars(self._wallets)

    def scalar_one_or_none(self):
        return self._wallets[0] if self._wallets else None


class _Session:
    def __init__(self, wallets):
        self.wallets = wallets
        self.commits = 0

    async def execute(self, _statement):
        return _Result(self.wallets)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        return None

    def add(self, _value):
        return None


class _Wallet:
    def __init__(self, energy, updated_at, crystals=0, taunt_charges=0, gold=0):
        self.energy = energy
        self.energy_updated_at = updated_at
        self.crystals = crystals
        self.taunt_charges = taunt_charges
        self.gold = gold


class _ShopCatalog:
    def __init__(self, price):
        self.price = price
        self.product_ids = []

    async def get_price(self, product_id):
        self.product_ids.append(product_id)
        return self.price


class _UnavailableShopCatalog:
    async def get_price(self, _product_id):
        raise ShopCatalogError("shop unavailable")


class EconomyRefillTests(unittest.IsolatedAsyncioTestCase):
    async def test_refill_all_wallets_persists_elapsed_energy(self):
        now = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)
        wallet = _Wallet(97, now - timedelta(minutes=10))
        session = _Session([wallet])

        updated = await refill_all_wallets(session, now=now)

        self.assertEqual(updated, 1)
        self.assertEqual(wallet.energy, 99)
        self.assertEqual(wallet.energy_updated_at, now)
        self.assertEqual(session.commits, 1)

    async def test_refill_all_wallets_does_not_overfill_wallet(self):
        now = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)
        wallet = _Wallet(99, now - timedelta(minutes=20))
        session = _Session([wallet])

        await refill_all_wallets(session, now=now)

        self.assertEqual(wallet.energy, 100)
        self.assertEqual(wallet.energy_updated_at, now)


class EconomyTauntTests(unittest.IsolatedAsyncioTestCase):
    async def test_purchase_taunt_day_deducts_crystals_and_grants_24_hours(self):
        now = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)
        wallet = _Wallet(100, now, crystals=15, taunt_charges=2)
        session = _Session([wallet])

        result = await purchase_taunt_pack(session, 42, now=now)

        self.assertEqual(wallet.crystals, 5)
        self.assertEqual(result["taunt_active"], True)
        self.assertEqual(result["taunt_expires_at"], "2026-07-30T12:00:00+00:00")
        self.assertEqual(session.commits, 1)

    async def test_spend_taunt_does_not_consume_usage_during_active_day(self):
        now = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)
        wallet = _Wallet(100, now, crystals=15, taunt_charges=2)
        wallet.taunt_expires_at = now + timedelta(days=1)
        session = _Session([wallet])

        result = await spend_taunt(session, 42, "clown_laugh", now=now)

        self.assertEqual(wallet.crystals, 15)
        self.assertEqual(wallet.taunt_charges, 2)
        self.assertEqual(result["taunt_active"], True)
        self.assertEqual(session.commits, 1)

    async def test_spend_taunt_rejects_after_day_expires(self):
        now = datetime(2026, 7, 29, 12, 0, tzinfo=timezone.utc)
        wallet = _Wallet(100, now, crystals=15, taunt_charges=0)
        wallet.taunt_expires_at = now
        session = _Session([wallet])

        with self.assertRaisesRegex(ValueError, "оплаченных"):
            await spend_taunt(session, 42, "clown_laugh", now=now)

        self.assertEqual(wallet.crystals, 15)
        self.assertEqual(wallet.taunt_charges, 0)
        self.assertEqual(session.commits, 0)


class EconomyChestTests(unittest.IsolatedAsyncioTestCase):
    async def test_chest_uses_price_returned_by_shop_for_the_product_id(self):
        now = datetime.now(timezone.utc)
        wallet = _Wallet(50, now, crystals=1, gold=27)
        session = _Session([wallet])
        catalog = _ShopCatalog(price=27)

        with patch("services.economy.random.random", return_value=0.99), patch(
            "services.economy.random.randint", return_value=7
        ):
            result = await open_chest(session, 42, 1001, catalog_client=catalog)

        self.assertEqual(catalog.product_ids, [1001])
        self.assertEqual(wallet.gold, 0)
        self.assertEqual(result["gold"], 0)

    async def test_chest_does_not_open_or_charge_when_shop_price_is_unavailable(self):
        now = datetime.now(timezone.utc)
        wallet = _Wallet(50, now, crystals=1, gold=20)
        session = _Session([wallet])

        with self.assertRaises(ShopCatalogError):
            await open_chest(
                session, 42, 1001, catalog_client=_UnavailableShopCatalog()
            )

        self.assertEqual(wallet.gold, 20)
        self.assertEqual(wallet.energy, 50)
        self.assertEqual(session.commits, 0)

    async def test_chest_can_add_crystals_in_addition_to_energy(self):
        now = datetime.now(timezone.utc)
        wallet = _Wallet(50, now, crystals=1, gold=20)
        session = _Session([wallet])

        with patch("services.economy.random.random", return_value=0.05), patch(
            "services.economy.random.randint", side_effect=[7, 8]
        ):
            result = await open_chest(
                session, 42, 1001, catalog_client=_ShopCatalog(20)
            )

        self.assertEqual(wallet.gold, 0)
        self.assertEqual(wallet.energy, 57)
        self.assertEqual(wallet.crystals, 9)
        self.assertEqual(result["energy_reward"], 7)
        self.assertEqual(result["crystals_reward"], 8)


if __name__ == "__main__":
    unittest.main()
