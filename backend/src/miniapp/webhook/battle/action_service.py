import logging

from starlette.websockets import WebSocket

from miniapp.webhook.battle.connection_manager import ConnectionManager
from miniapp.webhook.battle.game_server import GameServer

log = logging.getLogger(__name__)


class ActionService:
    def __init__(self, game_server: GameServer):
        self.game_server = game_server
        self.connection_manager = ConnectionManager()

    async def connect_player(self, websocket: WebSocket):
        player_id = int(websocket.cookies["user_id"])
        await self.connection_manager.connect(websocket, player_id)
        self.game_server.init_player(player_id)

        await self.connection_manager.send_broadcast({"player": self.game_server.get_players()})
        await self.connection_manager.send_personal_data(player_id, {"camp": self.game_server.get_camps()})
        log.info(f"Player {player_id} connected")

    async def attack_player(self, user_id: int, player_id: int):
        changes = self.game_server.attack_player(user_id, player_id)
        if changes:
            await self.connection_manager.send_broadcast(changes)

    async def attack_camp(self, user_id: int, camp_id: int):
        changes = self.game_server.attack_camp(user_id, camp_id)
        if changes:
            await self.connection_manager.send_broadcast(changes)

    async def move(self, user_id: int, direction: str):
        changes = self.game_server.move(user_id, direction)
        if changes:
            await self.connection_manager.send_broadcast(changes)