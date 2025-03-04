import asyncio
import logging
from datetime import datetime

from miniapp.webhook.battle.battle_manager import BattleManager
from miniapp.webhook.constants import TIMEZONE

log = logging.getLogger(__name__)

class BattleQueueManager:
    TEAM_SIZE = 2

    def __init__(self):
        self.queue = []
        self.lock = asyncio.Lock()

    async def remove_player_from_queue(self, player_id):
        self.queue = [queue_item for queue_item in self.queue if queue_item[0] != player_id]

    async def add_player_to_queue(self, player_id, websocket):
        for queue_item in self.queue:
            if queue_item[0] == player_id:
                await websocket.send_json({"start_time": queue_item[2].isoformat()})
                return
        start_time = datetime.now(TIMEZONE)
        self.queue.append((player_id, websocket, start_time))
        await websocket.send_json({"start_time": start_time.isoformat()})

    async def create_battle(self):
        async with self.lock:
            if len(self.queue) < self.TEAM_SIZE:
                return None

            log.info(self.queue)
            players = self.queue[:self.TEAM_SIZE]

            battle_manager = BattleManager()
            for player in players:
                battle_manager.battle.init_player(player[0])

            for player in players:
                await player[1].send_json({"battle_id": battle_manager.battle.id})

            player_ids_in_battle = {player[0] for player in players}
            self.queue = [player for player in self.queue if player[0] not in player_ids_in_battle]

        return battle_manager
