from typing import Literal

from pydantic import Field

from battle_service.entities.circle import Circle

PropType = Literal["health", "ammo", "barrier", "weapon", "potion-red"]


class Prop(Circle):
    type: PropType = Field(alias="propType")
    active: bool = True
