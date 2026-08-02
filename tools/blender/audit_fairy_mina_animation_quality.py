"""Temporal and pose-space audit for Fairy Mina's authored scenes.

This catches the class of false positives that a clip-list check misses:
actions that technically play but barely move, collapse hands into the torso,
lose the intended asymmetry, or jump between adjacent frames.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "scenes"
REPORT = ROOT / "artifacts" / "fairy-mina-animation-quality-audit.json"

FRAME_ENDS = {
    "idle": 90,
    "run": 24,
    "attack": 18,
    "super": 55,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 14,
    "aim-gadget": 60,
}

ACTION_NAMES = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
    "gadget": "Gadget",
    "aim-gadget": "AimGadget",
}

TRACKED = (
    "hips_s",
    "spine_upper_s",
    "chest_s",
    "head_s",
    "R_shoulder_s",
    "R_elbow_s",
    "R_wrist_s",
    "L_shoulder_s",
    "L_elbow_s",
    "L_wrist_s",
    "R_upperLeg_s",
    "L_upperLeg_s",
    "R_wing_down_s",
    "L_wing_down_s",
)


def quaternion(pose_bone):
    if pose_bone.rotation_mode == "QUATERNION":
        return pose_bone.rotation_quaternion.copy()
    if pose_bone.rotation_mode == "AXIS_ANGLE":
        axis_angle = pose_bone.rotation_axis_angle
        return Quaternion(axis_angle[1:4], axis_angle[0])
    return pose_bone.rotation_euler.to_quaternion()


def world_point(armature, pose_bone, point):
    return armature.matrix_world @ Vector(point)


def snapshot(armature):
    result = {}
    for name in TRACKED:
        bone = armature.pose.bones.get(name)
        if bone is None:
            continue
        result[name] = {
            "head": tuple(world_point(armature, bone, bone.head)),
            "tail": tuple(world_point(armature, bone, bone.tail)),
            "rotation": quaternion(bone),
        }
    return result


def distance(a, b):
    return (Vector(a) - Vector(b)).length


def max_motion(frames, name, point="head"):
    values = [frame[name][point] for frame in frames if name in frame]
    if not values:
        return 0.0
    origin = Vector(values[0])
    return max((Vector(value) - origin).length for value in values)


def max_frame_delta(frames, name):
    values = [frame[name]["rotation"] for frame in frames if name in frame]
    return max(
        (
            math.degrees(previous.rotation_difference(current).angle)
            for previous, current in zip(values, values[1:])
        ),
        default=0.0,
    )


def audit_clip(clip):
    path = SCENES / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    frames = []
    for frame in range(FRAME_ENDS[clip] + 1):
        scene.frame_set(frame)
        frames.append(snapshot(armature))

    motion = {
        name: round(max_motion(frames, name), 5)
        for name in TRACKED
        if name in frames[0]
    }
    deltas = {
        name: round(max_frame_delta(frames, name), 3)
        for name in TRACKED
        if name in frames[0]
    }
    right_hand = motion.get("R_wrist_s", 0.0)
    left_hand = motion.get("L_wrist_s", 0.0)
    asymmetry = abs(right_hand - left_hand)
    return {
        "clip": clip,
        "action": ACTION_NAMES[clip],
        "frames": len(frames),
        "motion_m": motion,
        "max_frame_delta_degrees": deltas,
        "hand_motion_m": {
            "right": round(right_hand, 5),
            "left": round(left_hand, 5),
            "difference": round(asymmetry, 5),
        },
    }


def main():
    requested = os.environ.get("FAIRY_MINA_CLIP_FILTER")
    clips = [requested] if requested else list(FRAME_ENDS)
    unknown = [clip for clip in clips if clip not in FRAME_ENDS]
    if unknown:
        raise RuntimeError(f"unknown Fairy Mina clip filter: {unknown}")
    report = {"hero": "fairy-mina", "clips": [audit_clip(clip) for clip in clips]}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
