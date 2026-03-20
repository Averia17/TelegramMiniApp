# Battle Results Service

Сервис на Go, который слушает Kafka-топик `battle_finished`, принимает сообщения об окончании боя и сохраняет их в PostgreSQL.

## Формат сообщения Kafka

```json
{
  "winner_id": "user_123",
  "loser_id": "user_456",
  "room_id": "room_abc",
  "score": "3-1",
  "mode": "deathmatch"
}
```

Обязательное поле: `winner_id`. Остальные опциональны.

## Конфигурация

Свой `.env` в директории сервиса:

```bash
cd backend/src/battle_results_service
cp .env.dist .env
# отредактируй .env
```

## Запуск

### Docker

```bash
# Создай .env: cp backend/src/battle_results_service/.env.dist backend/src/battle_results_service/.env
# Запустить БД и сервис
docker-compose up -d battle_results_db battle_results_service kafka
```

### Локально

1. `cp .env.dist .env` в папке `battle_results_service`
2. Запусти PostgreSQL и Kafka: `docker-compose up -d battle_results_db kafka`
3. `go run .`

## Отправка тестового сообщения в Kafka

```bash
# Через kafka-ui (http://localhost:8080) или kafkacat:
echo '{"winner_id":"user1","loser_id":"user2","score":"3-1"}' | kafkacat -b localhost:9092 -t battle_finished -P
```

## Интеграция

Чтобы отправлять события при окончании боя, добавь вызов Kafka producer в место, где бой завершается (например, в Colyseus GameRoom или Python webhook battle).
