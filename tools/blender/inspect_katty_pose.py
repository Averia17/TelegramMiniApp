from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
GLB = ROOT / "frontend/public/assets/heroes/output_heroes/katty_base.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.fspath(GLB))
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
action = next(a for a in bpy.data.actions if a.name.casefold() == "idle")
arm.animation_data_create()
arm.animation_data.action = action
for frame in (1, 30, 60, 82, 120):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    print("FRAME", frame)
    for name in (
        "bottle_s",
        "R_wrist_s",
        "R_index_01_s",
        "R_middle_01_s",
        "R_thumb_01_s",
        "L_wrist_s",
        "L_index_01_s",
        "L_middle_01_s",
        "L_thumb_01_s",
        "L_elbow_s",
        "R_elbow_s",
    ):
        bone = arm.pose.bones.get(name)
        if bone:
            print(
                name,
                tuple(round(float(v), 4) for v in bone.head),
                tuple(round(float(v), 4) for v in bone.tail),
                tuple(round(float(v), 4) for v in bone.rotation_euler),
            )
