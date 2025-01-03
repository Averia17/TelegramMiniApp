import json
import logging
from collections import defaultdict
from enum import Enum
from random import randint

from fastapi import WebSocket, WebSocketDisconnect, APIRouter

log = logging.getLogger(__name__)


class Directions(Enum):
    TOP = "TOP"
    BOTTOM = "BOTTOM"
    RIGHT = "RIGHT"
    LEFT = "LEFT"


class ConnectionManager:
    def __init__(self):
        self.player_data: dict[int, dict] = defaultdict(lambda: {"health": 100, "location": None})

    async def connect(self, websocket: WebSocket, player_id):
        await websocket.accept()
        self.player_data[player_id]["location"] = [randint(50, 950), randint(50, 550)] # start position
        self.player_data[player_id]["websocket"] = websocket
        # await self.broadcast(f"Player {player_id} joined the game with 100 health points.")

    async def disconnect(self, websocket: WebSocket):
        log.info("disconnect")
        for player_id, data in self.player_data.items():
            if data["websocket"] == websocket:
                del self.player_data[player_id]
                return

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def send_broadcast_players_data(self):
        players_data = []
        for player_id, data in self.player_data.items():
            players_data.append(
                {"id": player_id, **{key: value for key, value in data.items() if key != 'websocket'}}
            )
        # players_data = {k: {key: value for key, value in v.items() if key != 'websocket'} for k, v in self.player_data.items()}
        log.info(players_data)
        for player_id, data in self.player_data.items():
            try:
                await data["websocket"].send_json({"players_data": players_data})
            except WebSocketDisconnect:
                log.error(f"Player {player_id} disconnected")
                await self.disconnect(data["websocket"])

    async def handle_attack(self, user_id: int, player_id: int):
        if user_id == player_id:
            return

        self.player_data[player_id]["health"] -= 1
        # TODO change broadcast on send one player data
        await self.send_broadcast_players_data()

    async def handle_move(self, user_id: int, direction: str):
        direction_map = {
            Directions.TOP.value: (0, 10),
            Directions.BOTTOM.value: (0, -10),
            Directions.RIGHT.value: (10, 0),
            Directions.LEFT.value: (-10, 0)
        }

        x, y = direction_map.get(direction, (0, 0))
        self.player_data[user_id]["location"][0] += x
        self.player_data[user_id]["location"][1] += y
        await self.send_broadcast_players_data()

manager = ConnectionManager()

battle_router = APIRouter(prefix="/battle")

message_handlers = {
    "attack": manager.handle_attack,
    "move": manager.handle_move,
}

@battle_router.websocket("/connect")
async def player_connect(websocket: WebSocket):
    user_id = websocket.cookies.get("user_id")
    if not user_id:
        return

    log.info(f"Player {user_id} connected")
    await manager.connect(websocket, user_id)
    await manager.send_broadcast_players_data()
    try:
        while True:
            message = await websocket.receive_text()
            message = json.loads(message)
            # TODO validate message
            handler = message_handlers[message["action"]]
            data = {"user_id": user_id}
            data.update(message["data"])
            await handler(**data)
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
