import logging

from starlette.websockets import WebSocket, WebSocketDisconnect


log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, player_id: int):
        await websocket.accept()
        self.connections[player_id] = websocket

    async def disconnect(self, player_id: int):
        if player_id in self.connections:
            self.connections.pop(player_id)

    async def send_personal_data(self, player_id: int, data):
        websocket = self.connections[player_id]
        await websocket.send_json(data)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def send_broadcast(self, data):
        for player_id, websocket in self.connections.items():
            try:
                await websocket.send_json(data)
            except WebSocketDisconnect:
                log.error(f"Player {player_id} disconnected")
                await self.disconnect(player_id)

    # async def send_broadcast_players(self):
    #     players = self.battle.get_players()
    #     await self.send_broadcast({"players": players})
    #
    # async def send_broadcast_one_player(self, player_id: int):
    #     player = self.battle.get_player(player_id)
    #     await self.send_broadcast({"player": [player_id, player]})
    #
    # async def send_broadcast_camps(self):
    #     camps = self.battle.get_camps()
    #     await self.send_broadcast({"camps": camps})
    #
    # async def send_broadcast_one_camp(self, camp_id: int):
    #     camp = self.battle.get_camp(camp_id)
    #     await self.send_broadcast({"camp": camp})
