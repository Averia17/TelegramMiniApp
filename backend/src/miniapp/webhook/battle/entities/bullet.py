from miniapp.webhook.battle.entities import Circle
import math


class Bullet(Circle):
    player_id: str
    team: str
    rotation: float
    from_x: float
    from_y: float
    active: bool = True
    color: str
    shot_at: int  # timestamp

    def move(self, speed: float) -> None:
        self.x += math.cos(self.rotation) * speed
        self.y += math.sin(self.rotation) * speed

    def reset(
        self,
        player_id: str,
        team: str,
        x: float,
        y: float,
        radius: float,
        rotation: float,
        color: str,
        shot_at: int,
    ) -> None:
        self.player_id = player_id
        self.team = team
        self.from_x = x
        self.from_y = y
        self.x = x
        self.y = y
        self.radius = radius
        self.rotation = rotation
        self.active = True
        self.color = color
        self.shot_at = shot_at
