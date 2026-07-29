import unittest
from datetime import datetime, timedelta, timezone

from services.economy import refill_all_wallets


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


class _Session:
    def __init__(self, wallets):
        self.wallets = wallets
        self.commits = 0

    async def execute(self, _statement):
        return _Result(self.wallets)

    async def commit(self):
        self.commits += 1


class _Wallet:
    def __init__(self, energy, updated_at):
        self.energy = energy
        self.energy_updated_at = updated_at


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


if __name__ == "__main__":
    unittest.main()
