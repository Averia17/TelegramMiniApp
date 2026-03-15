import logging

from starlette.websockets import WebSocket, WebSocketDisconnect, WebSocketState

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.connections: dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, player_id: int):
        await websocket.accept()
        self.connections[player_id] = websocket

    async def disconnect(self, player_id: int):
        if player_id in self.connections:
            websocket = self.connections.pop(player_id)
            if websocket.client_state != WebSocketState.DISCONNECTED:
                await websocket.close()

    async def send_personal_data(self, player_id: int, data):
        websocket = self.connections[player_id]
        await websocket.send_json(data)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def send_broadcast(self, data):
        players = list(self.connections.items())
        for player_id, websocket in players:
            try:
                await websocket.send_json(data)
            except WebSocketDisconnect:
                log.error(f"Player {player_id} disconnected")
                await self.disconnect(player_id)
