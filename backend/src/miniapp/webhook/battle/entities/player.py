import math
from typing import Literal, Optional

from miniapp.webhook.battle.entities import Circle

Team = Literal["Blue", "Red"]


class Player(Circle):
    player_id: int
    name: str
    lives: int
    max_lives: int
    team: Optional[Team] = None
    color: str = "#FFFFFF"
    kills: int = 0
    rotation: float = 0.0
    ack: Optional[int] = None
    last_shoot_at: Optional[int] = None

    def __init__(
        self,
        player_id: int,
        x: float,
        y: float,
        radius: float,
        lives: int,
        max_lives: int,
        name: str,
        team: Optional[Team] = None,
        **kwargs,
    ):
        # Collect all data for Pydantic initialization
        init_data = {
            "x": x,
            "y": y,
            "radius": radius,
            "player_id": player_id,
            "lives": lives,
            "max_lives": max_lives,
            "name": name,
            "team": team,
            **kwargs,
        }

        # Initialize using Pydantic's mechanism
        super().__init__(**init_data)

        # Custom initialization after validation
        self.name = self._validate_name(self.name)
        if self.team:
            self.color = self._get_team_color(self.team)
        self.kills = 0
        self.rotation = 0.0
        self.last_shoot_at = None

    # Методы
    def move(self, dir_x: float, dir_y: float, speed: float) -> None:
        magnitude = self._normalize_2d(dir_x, dir_y)

        if magnitude == 0:
            return

        speed_x = round(self._round_2_digits(dir_x * (speed / magnitude)))
        speed_y = round(self._round_2_digits(dir_y * (speed / magnitude)))

        self.x += speed_x
        self.y += speed_y

    def hurt(self) -> None:
        self.lives -= 1

    def heal(self) -> None:
        if self.lives < self.max_lives:
            self.lives += 1

    def can_bullet_hurt(self, other_player_id: str, team: Optional[str] = None) -> bool:
        if not self.is_alive:
            return False

        if self.player_id == other_player_id:
            return False

        if team is not None and team == self.team:
            return False

        return True

    @property
    def is_alive(self) -> bool:
        return self.lives > 0

    @property
    def is_full_lives(self) -> bool:
        return self.lives == self.max_lives

    def set_position(self, x: float, y: float) -> None:
        self.x = x
        self.y = y

    def set_rotation(self, rotation: float) -> None:
        self.rotation = rotation

    def set_lives(self, lives: int) -> None:
        if lives > 0:
            self.lives = lives
            self.kills = 0
        else:
            self.lives = 0

    def set_name(self, name: str) -> None:
        self.name = self._validate_name(name)

    def set_team(self, team: Team) -> None:
        self.team = team
        self.color = self._get_team_color(team)

    def set_kills(self, kills: int) -> None:
        self.kills = kills

    @staticmethod
    def _validate_name(name: str) -> str:
        return name.strip()[:16]

    @staticmethod
    def _get_team_color(team: Team) -> str:
        return "#0000FF" if team == "Blue" else "#FF0000"

    @staticmethod
    def _normalize_2d(x: float, y: float) -> float:
        return math.sqrt(x**2 + y**2)

    @staticmethod
    def _round_2_digits(value: float) -> float:
        return round(value * 100) / 100
