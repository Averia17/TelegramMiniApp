import logging
from collections import defaultdict
from random import randint

from fastapi import WebSocket, WebSocketDisconnect, APIRouter

log = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.player_data: dict[int, dict] = defaultdict(lambda: {"health": 100, "location": None})

    async def connect(self, websocket: WebSocket, player_id):
        await websocket.accept()
        self.player_data[player_id]["location"] = [randint(50, 550), randint(50, 950)] # start position
        self.player_data[player_id]["websocket"] = websocket
        # await self.broadcast(f"Player {player_id} joined the game with 100 health points.")

    async def disconnect(self, websocket: WebSocket):
        log.info("disconnect")
        for player_id, data in self.player_data.items():
            if data["websocket"] == websocket:
                log.info(self.player_data[player_id])
                del self.player_data[player_id]
                return

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def send_broadcast_players_data(self):
        players_data = {k: {key: value for key, value in v.items() if key != 'websocket'} for k, v in self.player_data.items()}
        log.info(players_data)
        for player_id, data in self.player_data.items():
            try:
                await data["websocket"].send_json({"players_data": players_data})
            except WebSocketDisconnect:
                log.error(f"Player {player_id} disconnected")

    #
    # async def handle_attack(self, attacker_id: int, target_id: int, damage: int):
    #     if target_id in self.player_health:
    #         self.player_health[target_id] -= damage
    #         if self.player_health[target_id] <= 0:
    #             self.player_health[target_id] = 0
    #             await self.broadcast(f"Player {target_id} has been defeated by Player {attacker_id}!")
    #             self.disconnect(target_id)
    #         else:
    #             await self.broadcast(f"Player {attacker_id} attacked Player {target_id} for {damage} damage. Player {target_id} has {self.player_health[target_id]} health points left.")
    #     else:
    #         await self.broadcast(f"Player {target_id} is not in the game.")


manager = ConnectionManager()

battle_router = APIRouter(prefix="/battle")


@battle_router.websocket("/connect")
async def player_connect(websocket: WebSocket):
    log.info(websocket.cookies["user_id"])
    await manager.connect(websocket, websocket.cookies["user_id"])
    # await websocket.send_json({"action": "connect", "id": player_id})
    await manager.send_broadcast_players_data()
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        # Remove the WebSocket from the list of active connections
        await manager.disconnect(websocket)
    except Exception as e:
        # Handle other exceptions if needed
        log.error(f"An error occurred: {e}")
        await manager.disconnect(websocket)


