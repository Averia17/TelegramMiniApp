from datetime import datetime
from typing import Dict, Any
import math

from miniapp.webhook.battle.entities import GameState
from miniapp.webhook.battle.game_state import Constants


class GameRoom:
    def __init__(self):
        self.max_clients = 0
        self.state = None
        self.clients = {}  # session_id: client
        self.metadata = {}
        self.simulation_interval = None

    def set_metadata(self, metadata: Dict[str, Any]):
        self.metadata = metadata

    def set_simulation_interval(self, callback, delay=1000 / 60):
        self.simulation_interval = {
            'callback': callback,
            'delay': delay,
            'last_time': datetime.now().timestamp()
        }

    def broadcast(self, message_type: str, message: Dict[str, Any]):
        for client in self.clients.values():
            client.send(message_type, message)

    def on_create(self, options: Dict[str, Any]):
        self.max_clients = self._clamp(
            options.get("roomMaxPlayers", 0),
            Constants.ROOM_PLAYERS_MIN,
            Constants.ROOM_PLAYERS_MAX
        )

        player_name = options.get("playerName", "")[:Constants.PLAYER_NAME_MAX]
        room_name = options.get("roomName", "")[:Constants.ROOM_NAME_MAX]
        room_map = options.get("roomMap", "default")

        self.set_metadata({
            "playerName": player_name,
            "roomName": room_name,
            "roomMap": room_map,
            "roomMaxPlayers": self.max_clients,
            "mode": options.get("mode", "deathmatch")
        })

        self.state = GameState(
            room_name=room_name,
            map_name=room_map,
            max_players=self.max_clients,
            mode=options.get("mode", "deathmatch"),
            on_message=self.handle_message
        )

        self.set_simulation_interval(self.handle_tick)

        print(f"{datetime.now().isoformat()} [Create] player={player_name} room={room_name} "
              f"map={room_map} max={self.max_clients} mode={options.get('mode')}")

        self.on_message_handler = self.on_client_message

    def on_join(self, client, options: Dict[str, Any]):
        player_name = options.get("playerName", client.session_id)
        self.clients[client.session_id] = client
        self.state.player_add(client.session_id, player_name)

        print(f"{datetime.now().isoformat()} [Join] id={client.session_id} player={player_name}")

    def on_leave(self, client):
        if client.session_id in self.clients:
            del self.clients[client.session_id]
        self.state.player_remove(client.session_id)
        print(f"{datetime.now().isoformat()} [Leave] id={client.session_id}")

    def on_client_message(self, client, message_type: str, message: Dict[str, Any]):
        player_id = client.session_id

        if message_type in ["move", "rotate", "shoot"]:
            action = {
                "type": message_type,
                "playerId": player_id,
                "ts": message.get("ts", 0),
                "value": message.get("value", {})
            }
            self.state.player_push_action(action)

    def handle_tick(self):
        """Обработка игрового тика"""
        self.state.update()

        current_time = datetime.now().timestamp()
        if self.simulation_interval:
            elapsed = (current_time - self.simulation_interval['last_time']) * 1000
            if elapsed >= self.simulation_interval['delay']:
                self.simulation_interval['last_time'] = current_time
                self.simulation_interval['callback']()

    def handle_message(self, message: Dict[str, Any]):
        self.broadcast(message["type"], message)

    @staticmethod
    def _clamp(value: int, min_val: int, max_val: int) -> int:
        return max(min_val, min(value, max_val))
