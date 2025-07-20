from pydantic import BaseModel

from miniapp.webhook.battle.entities.geometry import CircleBody


class Circle(BaseModel):
    x: float
    y: float
    radius: float

    @property
    def body(self) -> CircleBody:
        return CircleBody(self.x, self.y, self.radius)