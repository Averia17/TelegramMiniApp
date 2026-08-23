"""Print sampled euler/quaternion values around selected pose jumps."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
CASES = (
    ("needle", "idle", "RightArm", 18),
    ("needle", "attack", "RightArm", 5),
    ("needle", "aim", "RightArm", 59),
    ("fairy-mina", "gadget", "R_shoulder_s", 6),
    ("mandy", "victory", "L_shoulder_s_044", 23),
)
ACTION_NAMES = {
    "idle": "idle",
    "attack": "Attack",
    "aim": "Aim",
    "gadget": "Gadget",
    "victory": "Victory",
}


for hero, clip, bone_name, center in CASES:
    path = (
        ROOT
        / "frontend"
        / "assets-source"
        / "heroes"
        / hero
        / ("katty.blend" if hero == "katty" else f"scenes/{clip}.blend")
    )
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    action = next(
        item
        for item in bpy.data.actions
        if item.name.casefold().split(".")[0] == ACTION_NAMES[clip].casefold()
    )
    armature.animation_data_create()
    armature.animation_data.action = action
    bone = armature.pose.bones[bone_name]
    print(f"CASE {hero}/{clip}/{bone_name}")
    previous = None
    for frame in range(center - 3, center + 4):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        euler = tuple(math.degrees(value) for value in bone.rotation_euler)
        quaternion = bone.rotation_euler.to_quaternion()
        delta = (
            2.0 * math.acos(min(1.0, abs(previous.dot(quaternion))))
            if previous
            else 0.0
        )
        print(
            frame,
            "euler",
            tuple(round(value, 2) for value in euler),
            "qdelta",
            round(delta, 4),
        )
        previous = quaternion
