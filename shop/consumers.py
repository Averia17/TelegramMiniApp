import json
import datetime
import logging
from aiokafka import AIOKafkaProducer


producer = AIOKafkaProducer(bootstrap_servers='kafka:9092', value_serializer=lambda v: json.dumps(v).encode('utf-8'))

log = logging.getLogger(__name__)


async def send_kafka_message(topic: str, event_data: dict):
    try:
        await producer.start()
        await producer.send(
            topic,
            {
                **event_data,
                "timestamp": datetime.datetime.now(datetime.UTC).isoformat()
            }
        )
    except Exception as e:
        log.error(f"Failed to send Kafka event: {e}")
    finally:
        await producer.stop()
