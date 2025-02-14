from collections import defaultdict
from enum import Enum
from random import randint

from miniapp.webhook.constants import MAX_X_LOCATION, MAX_Y_LOCATION


class Directions(Enum):
    TOP = "TOP"
    BOTTOM = "BOTTOM"
    RIGHT = "RIGHT"
    LEFT = "LEFT"



class GameServer:
    def __init__(self, battle_id):
        self.id = battle_id
        self._players: dict[int, dict] = defaultdict(lambda: {"health": 100, "level": 1, "location": None})
        self._camps = {
            1: {"health": 50, "level": 0.5, "location": [100, 200]},
            2: {"health": 150, "level": 1, "location": [600, 400]},
            3: {"health": 10, "level": 1.5, "location": [300, 300]},
        }

    def init_player(self, player_id):
        if not self._players[player_id]["location"]:
            self._players[player_id]["location"] = [randint(50, MAX_X_LOCATION), randint(50, MAX_Y_LOCATION)]

    def get_players(self):
        return self._players

    def get_players_ids(self):
        return list(self._players.keys())

    def get_player(self, player_id: int):
        return self._players[player_id]

    def get_camps(self):
        return self._camps

    def get_camp(self, camp_id: int):
        return self._camps[camp_id]

    def attack_player(self, user_id: int, player_id: int):
        target = self._players[player_id]
        if user_id == player_id or not target or target["health"] <= 0:
            return

        changes = defaultdict(dict)
        attacker = self._players[user_id]
        if target["health"] - attacker["level"] > 0:
            target["health"] -= attacker["level"]
            changes[player_id]["health"] = target["heath"]
        else:
            target["health"] = 0
            attacker["level"] += 1
            changes[user_id]["level"] = attacker["level"]
        return {"player": changes}

    def attack_camp(self, user_id: int, camp_id: int):
        camp = self._camps.get(camp_id)
        attacker = self._players.get(user_id)
        if not camp or camp["health"] <= 0:
            return

        changes = defaultdict(lambda: defaultdict(dict))
        if camp["health"] - attacker["level"] > 0:
            camp["health"] -= attacker["level"]
            changes["camp"][camp_id]["health"] = camp["health"]
        else:
            camp["health"] = 0
            attacker["level"] += camp["level"]
            changes["player"][user_id]["level"] = attacker["level"]
        return changes
    
    def move(self, user_id: int, direction: str):
        direction_map = {
            Directions.TOP.value: (0, 10),
            Directions.BOTTOM.value: (0, -10),
            Directions.RIGHT.value: (10, 0),
            Directions.LEFT.value: (-10, 0)
        }

        x, y = direction_map.get(direction, (0, 0))

        location_x = self._players[user_id]["location"][0] + x
        if MAX_X_LOCATION > location_x > 0:
            self._players[user_id]["location"][0] = location_x

        location_y = self._players[user_id]["location"][1] + y
        if MAX_Y_LOCATION > location_y > 0:
            self._players[user_id]["location"][1] = location_y
        return {"player": {user_id: {"location": self._players[user_id]["location"]}}}