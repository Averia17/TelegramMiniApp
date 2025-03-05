import logging
from asyncio import create_task

from starlette.websockets import WebSocket

from miniapp.webhook.battle.connection_manager import ConnectionManager
from miniapp.webhook.battle.battle import Battle

log = logging.getLogger(__name__)

battle_managers: dict[str, "BattleManager"] = {}  # battle_id : battle_manager
player_managers: dict[int, "BattleManager"] = {}  # player_id : battle_manager


class BattleManager:
    def __init__(self):
        self.battle = Battle()
        self.connection_manager = ConnectionManager()
        create_task(self.set_timeout())

    async def connect_player(self, websocket: WebSocket):
        player_id = int(websocket.cookies["user_id"])
        await self.connection_manager.connect(websocket, player_id)
        self.battle.init_player(player_id)

        await self.connection_manager.send_broadcast({"player": self.battle.get_players()})
        await self.connection_manager.send_personal_data(player_id, {
            "camp": self.battle.get_camps(), "start_time": str(self.battle.start_time)
        })
        log.info(f"Player {player_id} connected to battle {self.battle.id}")

    async def attack_player(self, user_id: int, player_id: int):
        changes = self.battle.attack_player(user_id, player_id)
        if changes:
            if changes["player"][player_id].get("health") == 0:
                await self.remove_player_from_battle(player_id)

            await self.connection_manager.send_broadcast(changes)

    async def attack_camp(self, user_id: int, camp_id: int):
        changes = self.battle.attack_camp(user_id, camp_id)
        if changes:
            await self.connection_manager.send_broadcast(changes)

    async def move(self, user_id: int, direction: str):
        changes = self.battle.move(user_id, direction)
        if changes:
            await self.connection_manager.send_broadcast(changes)

    async def remove_player_from_battle(self, player_id):
        if player_id not in player_managers:
            log.error(f"Player {player_id} not in battle")
        player_managers.pop(player_id)
        await self.connection_manager.disconnect(player_id)

    async def finish_battle(self):
        log.info(f"Finish battle {self.battle.id}")
        battle_managers.pop(self.battle.id)
        await self.connection_manager.send_broadcast({"battle": "finished"})
        for player_id in list(self.connection_manager.connections.keys()):
            await self.remove_player_from_battle(player_id)

    async def set_timeout(self):
        await self.battle.wait_finish()
        await self.finish_battle()
