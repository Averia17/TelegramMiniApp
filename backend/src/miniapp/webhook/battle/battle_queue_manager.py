import asyncio
import logging
from datetime import datetime

from pydantic import BaseModel, Field
from starlette.websockets import WebSocket

from miniapp.webhook.battle.battle_manager import (
    BattleManager,
    battle_managers,
    player_managers,
)
from miniapp.webhook.constants import TIMEZONE

log = logging.getLogger(__name__)


class QueueItem(BaseModel):
    player_id: int
    websocket: WebSocket = Field(exclude=True)
    start_time: datetime

    class Config:
        json_encoders = {datetime: lambda dt: dt.isoformat()}
        arbitrary_types_allowed = True


class BattleQueueManager:
    TEAM_SIZE = 1

    def __init__(self):
        self.queue: list[QueueItem] = []
        self.lock = asyncio.Lock()

    async def remove_player_from_queue(self, player_id):
        self.queue = [q_item for q_item in self.queue if q_item.player_id != player_id]

    async def add_player_to_queue(self, player_id, websocket):
        for queue_item in self.queue:
            if queue_item.player_id == player_id:
                await websocket.send_json({"start_time": queue_item.start_time.isoformat()})
                return
        start_time = datetime.now(TIMEZONE)
        self.queue.append(QueueItem(player_id=player_id, websocket=websocket, start_time=start_time))
        await websocket.send_json({"start_time": start_time.isoformat()})

    async def create_battle(self):
        async with self.lock:
            if len(self.queue) < self.TEAM_SIZE:
                return None

            log.info(f"Queue length {len(self.queue)}. Queue: {[q_item.player_id for q_item in self.queue]}.")
            players = self.queue[: self.TEAM_SIZE]

            battle_manager = BattleManager()
            for player in players:
                battle_manager.battle.init_player(player.player_id)

            for player in players:
                await player.websocket.send_json({"battle_id": battle_manager.battle.id})

            battle_managers[battle_manager.battle.id] = battle_manager
            player_ids_in_battle = {player.player_id for player in players}
            for player_id in player_ids_in_battle:
                player_managers[player_id] = battle_manager
            self.queue = [player for player in self.queue if player.player_id not in player_ids_in_battle]

        return battle_manager
