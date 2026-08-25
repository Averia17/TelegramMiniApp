"""Print sampled euler/quaternion values around selected pose jumps."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action

ROOT = Path(__file__).resolve().parents[2]
CASES = (
    ("needle", "idle", "RightArm", 18),
    ("needle", "attack", "RightArm", 5),
    ("needle", "aim", "RightArm", 59),
    ("fairy-mina", "gadget", "R_shoulder_s", 6),
    ("mandy", "victory", "L_shoulder_s_044", 23),
    ("mandy", "victory", "L_wrist_s_047", 23),
    ("mandy", "victory", "L_wrist_s_047", 13),
    ("katty", "super", "R_shoulder_s", 15),
    ("katty", "victory", "R_wrist_s", 38),
)
ACTION_NAMES = {
    "idle": "idle",
    "attack": "Attack",
    "aim": "Aim",
    "gadget": "Gadget",
    "super": "super",
    "victory": "Victory",
}


for hero, clip, bone_name, center in CASES:
    _, scene, armature, action = activate_action(hero, clip)
    bone = armature.pose.bones[bone_name]
    print(f"CASE {hero}/{clip}/{bone_name}")
    previous = None
    for frame in range(center - 3, center + 4):
        scene.frame_set(frame)
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
