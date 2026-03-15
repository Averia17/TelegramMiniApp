# Battle Service

Отдельный сервис для боевой логики (очередь, матчи, комнаты в стиле Colyseus). Раньше был частью webhook.

## Эндпоинты

- **WebSocket** `/battle/start` — встать в очередь на бой
- **WebSocket** `/battle/connect/{battle_id}` — подключиться к бою
- **GET** `/battle/player_state/{player_id}` — состояние игрока (есть ли активный бой)
- **GET** `/battle/server_state` — состояние сервера (для отладки)
- **WebSocket** `/battle/ws/{room_name}/{player_name}` — комната в стиле Colyseus
- **POST** `/matchmake/create/{room_name}` — создать комнату
- **POST** `/matchmake/join/{room_id}` — присоединиться к комнате

## Запуск

### Docker

```bash
docker compose up -d battle_service
```

Сервис слушает порт **3780**.

### Локально

```bash
cd backend
pip install .[battle]
PYTHONPATH=src uvicorn battle_service.app:app --reload --port 3780
```

## Фронтенд

Укажи в `.env` фронтенда:

- `VITE_WEBSOCKET_URL=http://localhost:3780` (или `ws://localhost:3780` для WebSocket)

Все запросы к battle (в т.ч. `/battle/player_state`) идут на battle_service; в `BattleTab` для HTTP из этого URL автоматически подставляется `http` вместо `ws`.
