import json
import datetime
import logging
import asyncio
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

log = logging.getLogger(__name__)

_producer = None


def _get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers='kafka:9092',
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
        )
    return _producer


async def send_kafka_message(topic: str, event_data: dict):
    producer = _get_producer()
    try:
        await producer.start()
        await producer.send(
            topic,
            {
                **event_data,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            },
        )
    except Exception as e:
        log.error(f"Failed to send Kafka event: {e}")
    finally:
        await producer.stop()

async def consume_battle_results(session_pool):
    while True:
        consumer = AIOKafkaConsumer("battle-results", bootstrap_servers="kafka:9092", group_id="shop-economy", auto_offset_reset="earliest", enable_auto_commit=False)
        try:
            await consumer.start()
            async for message in consumer:
                try:
                    from services.economy import award_battle_result
                    async with session_pool() as session:
                        await award_battle_result(session, json.loads(message.value))
                    await consumer.commit()
                except Exception:
                    log.exception("Failed to apply battle reward")
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Battle rewards consumer unavailable; retrying")
            await asyncio.sleep(5)
        finally:
            try: await consumer.stop()
            except Exception: pass
