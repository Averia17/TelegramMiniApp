import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer
from services import award_battle_result

log = logging.getLogger(__name__)


async def consume_battle_results(session_pool):
    while True:
        consumer = AIOKafkaConsumer(
            "battle-results",
            bootstrap_servers="kafka:9092",
            group_id="account-wallet",
            auto_offset_reset="earliest",
            enable_auto_commit=False,
        )
        try:
            await consumer.start()
            async for message in consumer:
                try:
                    async with session_pool() as session:
                        await award_battle_result(session, json.loads(message.value))
                    await consumer.commit()
                except Exception:
                    log.exception("Failed to apply battle reward")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Battle reward consumer unavailable; retrying")
            await asyncio.sleep(5)
        finally:
            try:
                await consumer.stop()
            except Exception:
                pass
