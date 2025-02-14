import asyncio
import logging
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from miniapp.webhook.battle.game_server import GameServer
from miniapp.webhook.constants import TIMEZONE

log = logging.getLogger(__name__)

class LoadBalancer:
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
            players = [self.queue.pop(0) for _ in range(self.TEAM_SIZE)]

        battle_id = str(uuid.uuid4())
        game_server = GameServer(battle_id)
        for player in players:
            game_server.init_player(player[0])

        for player in players:
            await player[1].send_json({"battle_id": battle_id})

        return game_server
