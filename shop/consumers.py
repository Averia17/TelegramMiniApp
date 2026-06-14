import json
import datetime
import logging
from aiokafka import AIOKafkaProducer

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
