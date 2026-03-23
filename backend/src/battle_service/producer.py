import json
import datetime
import logging
from aiokafka import AIOKafkaProducer

log = logging.getLogger(__name__)


class KafkaProducerManager:
    def __init__(self):
        self.producer = None
        self.bootstrap_servers = 'kafka:9092'

    async def start(self):
        self.producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers,
            key_serializer=lambda k: k.encode('utf-8') if isinstance(k, str) else str(k).encode('utf-8'),
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            retries=5,
            retry_backoff_ms=1000,
            retry_backoff_max_ms=10000,
            request_timeout_ms=30000,
        )

        await self.producer.start()
        log.info("Kafka producer started")

    async def stop(self):
        if self.producer:
            await self.producer.stop()
            log.info("Kafka producer stopped")

    async def send_message(self, topic: str, event_data: dict, key: str | None = None):
        if not self.producer:
            raise RuntimeError("Kafka producer not initialized")

        try:
            result = await self.producer.send(topic, value=event_data, key=key)
            await result
            log.debug(f"Message sent to {topic}: {event_data}")
        except Exception as e:
            log.error(f"Failed to send Kafka event: {e}")
            raise


kafka_manager = KafkaProducerManager()


def get_kafka_manager():
    return kafka_manager
