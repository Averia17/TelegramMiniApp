"""Repair the remaining legacy arm transitions with explicit quaternion tracks."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action, save_master

ROOT = Path(__file__).resolve().parents[2]
CASES = (
    ("mandy", "victory", "L_wrist_s_047", 10, 16),
    ("katty", "super", "R_shoulder_s", 10, 20),
    ("katty", "victory", "R_wrist_s", 33, 43),
)
ACTION_NAMES = {"victory": "Victory", "super": "super"}


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    return [
        curve
        for layer in action.layers
        for strip in layer.strips
        for channelbag in getattr(strip, "channelbags", ())
        for curve in channelbag.fcurves
    ]


def remove_rotation_tracks(action, bone_name):
    if hasattr(action, "fcurves"):
        containers = [(action, list(action.fcurves))]
    else:
        containers = [
            (channelbag, list(channelbag.fcurves))
            for layer in action.layers
            for strip in layer.strips
            for channelbag in getattr(strip, "channelbags", ())
        ]
    for container, curves in containers:
        for curve in curves:
            if f'pose.bones["{bone_name}"]' not in curve.data_path:
                continue
            if curve.data_path.endswith("rotation_euler") or curve.data_path.endswith(
                "rotation_quaternion"
            ):
                container.fcurves.remove(curve)


for hero, clip, bone_name, left, right in CASES:
    path, scene, armature, action = activate_action(hero, clip)
    bone = armature.pose.bones[bone_name]
    start, end = (int(value) for value in action.frame_range)
    left = max(start, left)
    right = min(end, right)
    samples = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        samples[frame] = bone.rotation_euler.to_quaternion()
    start_rotation = samples[left]
    end_rotation = samples[right]
    for frame in range(left, right + 1):
        amount = (frame - left) / max(1, right - left)
        eased = amount * amount * (3.0 - 2.0 * amount)
        samples[frame] = start_rotation.slerp(end_rotation, eased)

    remove_rotation_tracks(action, bone_name)
    bone.rotation_mode = "QUATERNION"
    for frame, rotation in samples.items():
        scene.frame_set(frame)
        bone.rotation_quaternion = rotation
        bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
    for curve in action_curves(action):
        if f'pose.bones["{bone_name}"].rotation_quaternion' in curve.data_path:
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"
            curve.update()
    scene["pose_continuity_revision"] = 2
    scene["pose_continuity_pass"] = "legacy-quaternion-transition-v2"
    action["pose_continuity_revision"] = 2
    action["pose_continuity_pass"] = "legacy-quaternion-transition-v2"
    save_master(path)
    print(f"REPAIRED {hero}/{clip}/{bone_name}: quaternion transition {left}-{right}")
