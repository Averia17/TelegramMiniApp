import math
import random
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from battle_service.entities import Bullet, Monster, Player, Prop
from battle_service.entities.game import Game, MessageJSON
from battle_service.constants import Constants


class GameMode(Enum):
    DEATHMATCH = "deathmatch"
    TEAM_DEATHMATCH = "team deathmatch"


class GameStateType(Enum):
    WAITING = "waiting"
    LOBBY = "lobby"
    GAME = "game"


class Team(Enum):
    RED = "Red"
    BLUE = "Blue"


class PropType(Enum):
    POTION_RED = "potion-red"
    AMMO = "ammo"
    BARRIER = "barrier"
    WEAPON = "weapon"


@dataclass
class Vector2:
    x: float
    y: float

    @property
    def empty(self) -> bool:
        return self.x == 0 and self.y == 0


@dataclass
class ActionJSON:
    type: str
    playerId: str
    ts: int
    value: Dict[str, Any]


@dataclass
class CircleBody:
    x: float
    y: float
    radius: float


@dataclass
class RectangleBody:
    x: float
    y: float
    width: float
    height: float


class TreeCollider:
    def __init__(self):
        self.objects = []

    def insert(self, obj: Any):
        self.objects.append(obj)

    def collides_with_circle(self, circle: CircleBody, mode: str = "full") -> bool:
        for obj in self.objects:
            if self._check_collision(circle, obj, mode):
                return True
        return False

    def correct_with_circle(self, circle: CircleBody) -> CircleBody:
        return circle

    def _check_collision(self, circle: CircleBody, rect: Any, mode: str) -> bool:
        closest_x = max(rect["minX"], min(circle.x, rect["maxX"]))
        closest_y = max(rect["minY"], min(circle.y, rect["maxY"]))
        distance = math.sqrt((circle.x - closest_x) ** 2 + (circle.y - closest_y) ** 2)
        return distance < circle.radius


class Map:
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height

    def clamp_circle(self, circle: CircleBody) -> CircleBody:
        x = max(circle.radius, min(circle.x, self.width - circle.radius))
        y = max(circle.radius, min(circle.y, self.height - circle.radius))
        return CircleBody(x, y, circle.radius)

    def is_circle_outside(self, circle: CircleBody) -> bool:
        return circle.x < 0 or circle.x > self.width or circle.y < 0 or circle.y > self.height


class GameState:
    def __init__(
        self,
        room_name: str,
        map_name: str,
        max_players: int,
        mode: str,
        on_message: Callable[[MessageJSON], None],
    ):
        self.players: Dict[str, Player] = {}
        self.monsters: Dict[str, Monster] = {}
        self.props: List[Prop] = []
        self.bullets: List[Bullet] = []
        self.actions: List[ActionJSON] = []
        self.on_message = on_message
        self.walls = TreeCollider()
        self.spawners: List[RectangleBody] = []
        self.initialize_map(map_name)

        self.game = Game(
            room_name=room_name,
            map_name=map_name,
            max_players=max_players,
            mode=mode,
            on_waiting_start=self.handle_waiting_start,
            on_lobby_start=self.handle_lobby_start,
            on_game_start=self.handle_game_start,
            on_game_end=self.handle_game_end,
        )

    def update(self):
        self.update_game()
        self.update_players()
        self.update_monsters()
        self.update_bullets()

    def update_game(self):
        self.game.update(self.players)

    def update_players(self):
        while self.actions:
            action = self.actions.pop(0)
            if action.type == "move":
                self.player_move(action.playerId, action.ts, Vector2(**action.value))
            elif action.type == "rotate":
                self.player_rotate(action.playerId, action.ts, action.value["rotation"])
            elif action.type == "shoot":
                self.player_shoot(action.playerId, action.ts, action.value["angle"])

    def update_monsters(self):
        for monster_id, monster in list(self.monsters.items()):
            self.monster_update(monster_id)

    def update_bullets(self):
        for i in range(len(self.bullets) - 1, -1, -1):
            if not self.bullets[i].active:
                self.bullets.pop(i)
                continue
            self.bullet_update(i)

    def handle_waiting_start(self):
        self.set_players_active(False)
        self.send_message("waiting")

    def handle_lobby_start(self):
        self.set_players_active(False)
        self.send_message("lobby")

    def handle_game_start(self):
        if self.game.mode == GameMode.TEAM_DEATHMATCH.value:
            self.set_players_teams_randomly()

        self.set_players_position_randomly()
        self.set_players_active(True)
        self.props_add(Constants.FLASKS_COUNT)
        self.monsters_add(Constants.MONSTERS_COUNT)
        self.send_message("start")

    def handle_game_end(self, message: Optional[MessageJSON] = None):
        if message:
            self.on_message(message)

        self.props_clear()
        self.monsters_clear()
        self.send_message("stop")

    def send_message(self, msg_type: str, params: Optional[Dict[str, Any]] = None):
        self.on_message(MessageJSON(type=msg_type, from_="server", ts=self.current_time(), params=params or {}))

    def initialize_map(self, map_name: str):
        self.map = Map(width=1000, height=1000)

        for i in range(5):
            self.walls.insert({"minX": 100 + i * 150, "minY": 100, "maxX": 150 + i * 150, "maxY": 500, "type": "wall"})

        for i in range(4):
            self.spawners.append(
                RectangleBody(x=50 + i * 200, y=50, width=Constants.PLAYER_SIZE, height=Constants.PLAYER_SIZE)
            )

    def player_add(self, player_id: str, name: str):
        spawner = self.get_spawner_randomly()
        player_data = {
            "player_id": player_id,
            "x": spawner.x + Constants.PLAYER_SIZE / 2,
            "y": spawner.y + Constants.PLAYER_SIZE / 2,
            "radius": Constants.PLAYER_SIZE / 2,
            "lives": 0,
            "max_lives": Constants.PLAYER_MAX_LIVES,
            "name": name or player_id,
        }
        player = Player.model_validate(player_data)

        if self.game.mode == GameMode.TEAM_DEATHMATCH.value:
            player.set_team(Team.RED.value)

        self.players[player_id] = player
        self.send_message("joined", {"name": player.name})

    def player_move(self, player_id: str, ts: int, direction: Vector2):
        player = self.players.get(player_id)
        if not player or direction.empty:
            return

        player.move(direction.x, direction.y, Constants.PLAYER_SPEED)

        clamped_pos = self.map.clamp_circle(player.body)
        player.set_position(clamped_pos.x, clamped_pos.y)

        corrected_pos = self.walls.correct_with_circle(player.body)
        if corrected_pos:
            player.set_position(corrected_pos.x, corrected_pos.y)

        player.ack = ts

        if player.is_alive:
            for prop in self.props:
                if prop.active and self.circle_to_circle(player.body, prop.body):
                    if prop.type == PropType.POTION_RED.value and not player.is_full_lives:
                        prop.active = False
                        player.heal()

    def player_rotate(self, player_id: str, ts: int, rotation: float):
        if player := self.players.get(player_id):
            player.set_rotation(rotation)

    def player_shoot(self, player_id: str, ts: int, angle: float):
        player = self.players.get(player_id)
        if not player or not player.is_alive or self.game.state != GameStateType.GAME.value:
            return

        if player.last_shoot_at and ts - player.last_shoot_at < Constants.BULLET_RATE:
            return

        player.last_shoot_at = ts

        bullet_x = player.x + math.cos(angle) * Constants.PLAYER_WEAPON_SIZE
        bullet_y = player.y + math.sin(angle) * Constants.PLAYER_WEAPON_SIZE

        for bullet in self.bullets:
            if not bullet.active:
                bullet.reset(
                    player_id, player.team, bullet_x, bullet_y, Constants.BULLET_SIZE, angle, player.color, ts
                )
                return

        self.bullets.append(
            Bullet(
                player_id=player_id,
                team=player.team,
                x=bullet_x,
                y=bullet_y,
                radius=Constants.BULLET_SIZE,
                rotation=angle,
                color=player.color,
                shot_at=ts,
            )
        )

    def player_remove(self, player_id: str):
        if player_id in self.players:
            self.send_message("left", {"name": self.players[player_id].name})
            del self.players[player_id]

    def set_players_active(self, active: bool):
        for player in self.players.values():
            player.set_lives(player.max_lives if active else 0)

    def set_players_position_randomly(self):
        for player in self.players.values():
            spawner = self.get_spawner_randomly()
            player.set_position(spawner.x + Constants.PLAYER_SIZE / 2, spawner.y + Constants.PLAYER_SIZE / 2)
            player.ack = 0

    def set_players_teams_randomly(self):
        player_ids = list(self.players.keys())
        random.shuffle(player_ids)

        half = len(player_ids) // 2
        for i, player_id in enumerate(player_ids):
            team = Team.BLUE if i < half else Team.RED
            self.players[player_id].set_team(team.value)

    def monsters_add(self, count: int):
        for _ in range(count):
            x = random.randint(Constants.TILE_SIZE, self.map.width - Constants.TILE_SIZE)
            y = random.randint(Constants.TILE_SIZE, self.map.height - Constants.TILE_SIZE)

            monster = Monster(
                y=y,
                x=x,
                radius=Constants.MONSTER_SIZE / 2,
                map_width=self.map.width,
                map_height=self.map.height,
                lives=Constants.MONSTER_LIVES,
            )

            self.monsters[str(random.randint(0, 1000))] = monster

    def monster_update(self, monster_id: str):
        monster = self.monsters.get(monster_id)
        if not monster or not monster.is_alive:
            return

        monster.update(self.players)

        for player in self.players.values():
            if player.is_alive and monster.can_attack and self.circle_to_circle(monster.body, player.body):
                monster.attack()
                player.hurt()

                if not player.is_alive:
                    self.send_message("killed", {"killerName": "A bat", "killedName": player.name})

    def monsters_clear(self):
        self.monsters.clear()

    def bullet_update(self, bullet_index: int):
        bullet = self.bullets[bullet_index]
        if not bullet.active:
            return

        bullet.move(Constants.BULLET_SPEED)

        for player in self.players.values():
            if player.can_bullet_hurt(bullet.player_id, bullet.team) and self.circle_to_circle(
                bullet.body, player.body
            ):
                bullet.active = False
                player.hurt()

                if not player.is_alive:
                    killer_name = (
                        self.players[bullet.player_id].name if bullet.player_id in self.players else "Unknown"
                    )
                    self.send_message("killed", {"killerName": killer_name, "killedName": player.name})
                    if bullet.player_id in self.players:
                        self.players[bullet.player_id].kills += 1

        for monster_id, monster in list(self.monsters.items()):
            if self.circle_to_circle(bullet.body, monster.body):
                bullet.active = False
                monster.hurt()

                if not monster.is_alive:
                    del self.monsters[monster_id]

        if self.walls.collides_with_circle(bullet.body, "half"):
            bullet.active = False
            return

        if self.map.is_circle_outside(bullet.body):
            bullet.active = False

    def props_add(self, count: int):
        for _ in range(count):
            x = random.randint(Constants.TILE_SIZE, self.map.width - Constants.TILE_SIZE)
            y = random.randint(Constants.TILE_SIZE, self.map.height - Constants.TILE_SIZE)

            body = CircleBody(x, y, Constants.FLASK_SIZE / 2)
            while self.walls.collides_with_circle(body):
                x = random.randint(Constants.TILE_SIZE, self.map.width - Constants.TILE_SIZE)
                y = random.randint(Constants.TILE_SIZE, self.map.height - Constants.TILE_SIZE)
                body = CircleBody(x, y, Constants.FLASK_SIZE / 2)

            self.props.append(Prop(type="potion-red", x=x, y=y, radius=Constants.FLASK_SIZE / 2))

    def props_clear(self):
        self.props.clear()

    def get_spawner_randomly(self) -> RectangleBody:
        return random.choice(self.spawners)

    def player_push_action(self, action: dict):
        self.actions.append(
            ActionJSON(type=action["type"], playerId=action["playerId"], ts=action["ts"], value=action["value"])
        )

    @staticmethod
    def circle_to_circle(c1: CircleBody, c2: CircleBody) -> bool:
        distance = math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2)
        return distance < (c1.radius + c2.radius)

    @staticmethod
    def current_time() -> int:
        return int(time.time() * 1000)
