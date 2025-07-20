from typing import Literal

from pydantic import Field

from miniapp.webhook.battle.entities import Circle

PropType = Literal['health', 'ammo', 'barrier', 'weapon']

class Prop(Circle):
    type: PropType = Field(alias="propType")
    active: bool = True