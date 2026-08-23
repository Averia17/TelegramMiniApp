from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(
    filepath=os.fspath(ROOT / "frontend/assets-source/heroes/katty/katty.blend")
)
arm = bpy.data.objects["Root"]
for frame in (1, 30, 60, 82, 120):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    print("FRAME", frame)
    for name in ("bottle_s", "R_wrist_s", "L_wrist_s", "L_elbow_s", "R_elbow_s"):
        bone = arm.pose.bones.get(name)
        print(
            name,
            tuple(round(float(v), 4) for v in bone.head),
            tuple(round(float(v), 4) for v in bone.rotation_euler),
        )
