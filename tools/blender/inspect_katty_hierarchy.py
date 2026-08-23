from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(
    filepath=os.fspath(ROOT / "frontend/assets-source/heroes/katty/katty.blend")
)
a = bpy.data.objects["Root"]
for name in (
    "bottle_s",
    "bottle_valve_01_s",
    "R_shoulder_s",
    "R_elbow_s",
    "R_wrist_s",
    "L_shoulder_s",
    "L_elbow_s",
    "L_wrist_s",
):
    b = a.data.bones[name]
    print(
        name,
        "parent",
        b.parent.name if b.parent else None,
        "head",
        tuple(round(float(x), 4) for x in b.head_local),
        "tail",
        tuple(round(float(x), 4) for x in b.tail_local),
    )
