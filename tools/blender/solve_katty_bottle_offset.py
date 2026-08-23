from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(
    filepath=os.fspath(ROOT / "frontend/assets-source/heroes/katty/katty.blend")
)
arm = bpy.data.objects["Root"]
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
wrist_rest = arm.data.bones["R_wrist_s"].matrix_local.copy()
wrist_pose = arm.pose.bones["R_wrist_s"]
bottle = arm.pose.bones["bottle_s"]
base_tail = arm.data.bones["R_wrist_s"].tail_local.copy()


def sample(offset):
    desired = bpy.data.objects["Root"].data.bones["bottle_s"].matrix_local.copy()
    desired.translation = base_tail + Vector(offset)
    relation = wrist_rest.inverted() @ desired
    bottle.matrix = wrist_pose.matrix @ relation
    bpy.context.view_layer.update()
    return tuple(round(float(v), 5) for v in bottle.head)


for offset in (
    (0.78, -1.88, -2.15),
    (1.78, -1.88, -2.15),
    (0.78, -0.88, -2.15),
    (0.78, -1.88, -1.15),
    (3.18, -3.78, -1.90),
    (-0.884, 0.106, -0.337),
):
    print(offset, sample(offset))
