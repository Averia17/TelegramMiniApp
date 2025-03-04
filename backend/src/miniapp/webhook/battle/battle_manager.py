import logging

from starlette.websockets import WebSocket

from miniapp.webhook.battle.connection_manager import ConnectionManager
from miniapp.webhook.battle.battle import Battle

log = logging.getLogger(__name__)


class BattleManager:
    def __init__(self, battle: Battle):
        self.battle = battle
        self.connection_manager = ConnectionManager()

    async def connect_player(self, websocket: WebSocket):
        player_id = int(websocket.cookies["user_id"])
        await self.connection_manager.connect(websocket, player_id)
        self.battle.init_player(player_id)

        await self.connection_manager.send_broadcast({"player": self.battle.get_players()})
        await self.connection_manager.send_personal_data(player_id, {"camp": self.battle.get_camps()})
        log.info(f"Player {player_id} connected")

    async def attack_player(self, user_id: int, player_id: int):
        changes = self.battle.attack_player(user_id, player_id)
        if changes:
            await self.connection_manager.send_broadcast(changes)

    async def attack_camp(self, user_id: int, camp_id: int):
        changes = self.battle.attack_camp(user_id, camp_id)
        if changes:
            await self.connection_manager.send_broadcast(changes)

    async def move(self, user_id: int, direction: str):
        changes = self.battle.move(user_id, direction)
        if changes:
            await self.connection_manager.send_broadcast(changes)