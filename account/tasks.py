import asyncio
import logging

from services.economy import ENERGY_REGEN_SECONDS, refill_all_wallets

log = logging.getLogger(__name__)


async def refill_energy_periodically(session_pool):
    while True:
        try:
            async with session_pool() as session:
                updated = await refill_all_wallets(session)
                if updated:
                    log.info("Regenerated energy for %d player wallets", updated)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Energy regeneration task failed")
        await asyncio.sleep(ENERGY_REGEN_SECONDS)
