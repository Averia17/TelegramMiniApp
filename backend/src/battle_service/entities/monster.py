import math
import random
from datetime import datetime
from typing import Dict, Literal, Optional

from pydantic import PrivateAttr

from battle_service.entities.circle import Circle

MonsterState = Literal["idle", "patrol", "chase"]


def get_distance(x1: float, y1: float, x2: float, y2: float) -> float:
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def calculate_angle(target_x: float, target_y: float, source_x: float, source_y: float) -> float:
    return math.atan2(target_y - source_y, target_x - source_x)


def clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(value, max_val))


class MonsterConstants:
    TILE_SIZE = 32
    MONSTER_SPEED_PATROL = 1.5
    MONSTER_SPEED_CHASE = 2.5
    MONSTER_SIGHT = 300
    MONSTER_ATTACK_BACKOFF = 2000
    MONSTER_IDLE_DURATION_MIN = 2000
    MONSTER_IDLE_DURATION_MAX = 5000
    MONSTER_PATROL_DURATION_MIN = 3000
    MONSTER_PATROL_DURATION_MAX = 8000


class Monster(Circle):
    _rotation: float = PrivateAttr(0.0)
    _map_width: float = PrivateAttr()
    _map_height: float = PrivateAttr()
    _lives: int = PrivateAttr(0)
    _state: MonsterState = PrivateAttr("idle")
    _last_action_at: int = PrivateAttr()
    _last_attack_at: int = PrivateAttr()
    _idle_duration: int = PrivateAttr(0)
    _patrol_duration: int = PrivateAttr(0)
    _target_player_id: Optional[str] = PrivateAttr(None)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._map_width = kwargs.get("map_width", 1000)
        self._map_height = kwargs.get("map_height", 1000)
        self._lives = kwargs.get("lives", 3)
        self._last_action_at = 0
        self._last_attack_at = 0
        self.start_idle()

    def update(self, players: Dict[str, "Player"]) -> None:
        match self._state:
            case "idle":
                self._update_idle(players)
            case "patrol":
                self._update_patrol(players)
            case "chase":
                self._update_chase(players)

    def _update_idle(self, players: Dict[str, "Player"]) -> None:
        if self._look_for_player(players):
            return

        delta = self._current_time() - self._last_action_at
        if delta > self._idle_duration:
            self.start_patrol()

    def _update_patrol(self, players: Dict[str, "Player"]) -> None:
        if self._look_for_player(players):
            return

        delta = self._current_time() - self._last_action_at
        if delta > self._patrol_duration:
            self.start_idle()
            return

        self.move(MonsterConstants.MONSTER_SPEED_PATROL, self._rotation)

        if (
            self.x < MonsterConstants.TILE_SIZE
            or self.x > self._map_width - MonsterConstants.TILE_SIZE
            or self.y < MonsterConstants.TILE_SIZE
            or self.y > self._map_height - MonsterConstants.TILE_SIZE
        ):
            self.x = clamp(self.x, 0, self._map_width)
            self.y = clamp(self.y, 0, self._map_height)
            self._rotation = random.uniform(-3, 3)

    def _update_chase(self, players: Dict[str, "Player"]) -> None:
        player = self._get_player_from_id(players)
        if not player or not player.is_alive:
            self.start_idle()
            return

        distance = get_distance(self.x, self.y, player.x, player.y)
        if distance > MonsterConstants.MONSTER_SIGHT:
            self.start_idle()
            return

        self._rotation = calculate_angle(player.x, player.y, self.x, self.y)
        self.move(MonsterConstants.MONSTER_SPEED_CHASE, self._rotation)

    def start_idle(self) -> None:
        self._state = "idle"
        self._rotation = 0.0
        self._target_player_id = None
        self._idle_duration = random.randint(
            MonsterConstants.MONSTER_IDLE_DURATION_MIN,
            MonsterConstants.MONSTER_IDLE_DURATION_MAX,
        )
        self._last_action_at = self._current_time()

    def start_patrol(self) -> None:
        self._state = "patrol"
        self._target_player_id = None
        self._patrol_duration = random.randint(
            MonsterConstants.MONSTER_PATROL_DURATION_MIN,
            MonsterConstants.MONSTER_PATROL_DURATION_MAX,
        )
        self._rotation = random.uniform(-3, 3)
        self._last_action_at = self._current_time()

    def start_chase(self, player_id: str) -> None:
        self._state = "chase"
        self._target_player_id = player_id
        self._last_action_at = self._current_time()

    def _look_for_player(self, players: Dict[str, "Player"]) -> bool:
        if not self._target_player_id:
            player_id = self._get_closest_player_id(players)
            if player_id:
                self.start_chase(player_id)
                return True
        return False

    def hurt(self) -> None:
        self._lives -= 1

    def move(self, speed: float, rotation: float) -> None:
        self.x += math.cos(rotation) * speed
        self.y += math.sin(rotation) * speed

    def attack(self) -> None:
        self._last_attack_at = self._current_time()

    def _get_player_from_id(self, players: Dict[str, "Player"]) -> Optional["Player"]:
        return players.get(self._target_player_id)

    def _get_closest_player_id(self, players: Dict[str, "Player"]) -> Optional[str]:
        closest_id = None
        min_distance = float("inf")

        for player_id, player in players.items():
            if player.is_alive:
                distance = get_distance(self.x, self.y, player.x, player.y)
                if distance <= MonsterConstants.MONSTER_SIGHT and distance < min_distance:
                    min_distance = distance
                    closest_id = player_id

        return closest_id

    def _current_time(self) -> int:
        return int(datetime.now().timestamp() * 1000)

    @property
    def is_alive(self) -> bool:
        return self._lives > 0

    @property
    def can_attack(self) -> bool:
        delta = abs(self._last_attack_at - self._current_time())
        return self._state == "chase" and delta > MonsterConstants.MONSTER_ATTACK_BACKOFF
