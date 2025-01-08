import json
import logging
from collections import defaultdict
from copy import deepcopy
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
        self.player_data: dict[int, dict] = defaultdict(lambda: {"health": 100, "level": 1, "location": None})
        self.camps_data =  {
            1: {"health": 50, "level": 0.5, "location": [100, 200]},
            2: {"health": 150, "level": 1, "location": [600, 400]},
            3: {"health": 10, "level": 1.5, "location": [300, 300]},
        }

    async def connect(self, websocket: WebSocket, player_id):
        await websocket.accept()

        self.player_data[player_id]["websocket"] = websocket
        if not self.player_data[player_id]["location"]:
            self.player_data[player_id]["location"] = [randint(50, 950), randint(50, 550)] # start position
        # await self.broadcast(f"Player {player_id} joined the game with 100 health points.")

    async def disconnect(self, websocket: WebSocket):
        log.info("disconnect")
        for player_id, data in self.player_data.items():
            if data["websocket"] == websocket:
                self.player_data[player_id].pop("websocket")
                return

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def send_broadcast_camps_data(self):
        await self.send_broadcast_data({"camps": self.camps_data})

    async def send_broadcast_players_data(self):
        players_data = {
            k: {key: value for key, value in v.items() if key != 'websocket'}
            for k, v in self.player_data.items()
        }
        await self.send_broadcast_data({"players_data": players_data})

    async def send_broadcast_data(self, data):
        for player_id, player_data in self.player_data.items():
            if not player_data.get("websocket"):
                log.info(f"Player {player_id} now disconnected")
                continue

            await self.send_data(player_data["websocket"], data)

    async def send_data(self, websocket: WebSocket, data):
        try:
            await websocket.send_json(data)
        except WebSocketDisconnect:
            log.error(f"Player {websocket.cookies.get("user_id")} disconnected")
            await self.disconnect(websocket)

    async def handle_attack(self, user_id: int, player_id: int):
        target = self.player_data[player_id]
        if user_id == player_id or not target or target["health"] <= 0:
            return

        attacker = self.player_data[user_id]
        if target["health"] - attacker["level"] > 0:
            target["health"] -= attacker["level"]
        else:
            target["health"] = 0
            attacker["level"] += 1
            await self.send_broadcast_players_data()

        # TODO optimization send only one player data
        await self.send_broadcast_players_data()

    async def handle_camp_attack(self, user_id: int, camp_id: int):
        target = self.camps_data.get(camp_id)
        attacker = self.player_data.get(user_id)
        if not target or not attacker or target["health"] <= 0:
            return

        if target["health"] - attacker["level"] > 0:
            target["health"] -= attacker["level"]
        else:
            target["health"] = 0
            attacker["level"] += target["level"]
            await self.send_broadcast_players_data()

        # TODO optimization send only one camp data
        await self.send_broadcast_camps_data()

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
    "camp_attack": manager.handle_camp_attack,
    "move": manager.handle_move,
}

@battle_router.websocket("/connect")
async def player_connect(websocket: WebSocket):
    user_id = int(websocket.cookies.get("user_id"))
    if not user_id:
        return

    log.info(f"Player {user_id} connected")
    await manager.connect(websocket, user_id)
    await manager.send_broadcast_players_data()
    await manager.send_broadcast_camps_data()
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
