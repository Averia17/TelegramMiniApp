"""Repair silhouette-critical arm transitions without changing animation timing."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"

NEEDLE_SCENES = (
    "idle",
    "run",
    "attack",
    "super",
    "aim",
    "aim-super",
    "gadget",
    "aim-gadget",
    "hit",
    "death",
    "spawn",
    "victory",
)
NEEDLE_OFFSETS = {
    "RightArm": math.radians(-15.0),
    "RightHand": math.radians(-10.0),
}

# These are authored transition centers found by audit_pose_extremes.py.  The
# endpoints stay intact; only the two-frame transition around each center is
# replaced by a quaternion slerp with clamped Bezier handles.
SMOOTH_CASES = (
    ("fairy-mina", "gadget", "R_shoulder_s", 6),
    ("fairy-mina", "gadget", "L_shoulder_s", 6),
    ("mandy", "attack", "L_shoulder_s_044", 3),
    ("mandy", "victory", "L_shoulder_s_044", 23),
    ("needle", "attack", "RightArm", 5),
    ("katty", "super", "R_shoulder_s", 15),
    ("katty", "victory", "R_wrist_s", 38),
)
ACTION_NAMES = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "gadget": "Gadget",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "aim-gadget": "AimGadget",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
}
SILHOUETTE_TOKENS = (
    "arm",
    "hand",
    "elbow",
    "wrist",
    "shoulder",
    "leg",
    "foot",
    "ankle",
    "knee",
)


def action_for(name: str):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def clamp_silhouette_curves(action) -> None:
    for curve in action_curves(action):
        if not curve.data_path.startswith("pose.bones["):
            continue
        if not any(token in curve.data_path.casefold() for token in SILHOUETTE_TOKENS):
            continue
        if not (
            curve.data_path.endswith("rotation_euler")
            or curve.data_path.endswith("rotation_quaternion")
        ):
            continue
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def open_scene(hero: str, clip: str):
    path = (
        SOURCE / hero / ("katty.blend" if hero == "katty" else f"scenes/{clip}.blend")
    )
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    action = action_for(ACTION_NAMES[clip])
    if armature is None or action is None:
        raise RuntimeError(f"{hero}/{clip}: missing armature/action")
    armature.animation_data_create()
    armature.animation_data.action = action
    return path, armature, action


def key_rotation(bone, frame: int, rotation: Quaternion) -> None:
    mode = (
        bone.rotation_mode
        if bone.rotation_mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
        else "XYZ"
    )
    bone.rotation_euler = rotation.to_euler(mode)
    bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
    action = bone.id_data.animation_data.action
    curves = action.fcurves if hasattr(action, "fcurves") else ()
    for curve in curves:
        if f'pose.bones["{bone.name}"].rotation_euler' in curve.data_path:
            for point in curve.keyframe_points:
                if abs(point.co.x - frame) < 0.001:
                    point.interpolation = "BEZIER"
                    point.handle_left_type = "AUTO_CLAMPED"
                    point.handle_right_type = "AUTO_CLAMPED"


def apply_needle_posture() -> None:
    for clip in NEEDLE_SCENES:
        path, armature, action = open_scene("needle", clip)
        if bpy.context.scene.get("needle_arm_posture_revision") == 1:
            print(f"SKIP needle/{clip}: posture already applied")
            continue
        missing = sorted(set(NEEDLE_OFFSETS) - set(armature.pose.bones.keys()))
        if missing:
            raise RuntimeError(f"needle/{clip}: missing bones {missing}")
        start, end = (int(value) for value in action.frame_range)
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            for name, offset in NEEDLE_OFFSETS.items():
                bone = armature.pose.bones[name]
                bone.rotation_euler.x += offset
                bone.keyframe_insert("rotation_euler", frame=frame, group=name)
        bpy.context.scene["needle_arm_posture_revision"] = 1
        bpy.context.scene["needle_arm_posture_pass"] = (
            "lowered-right-arm-balanced-silhouette"
        )
        action["needle_arm_posture_revision"] = 1
        action["needle_arm_posture_pass"] = "lowered-right-arm-balanced-silhouette"
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
        print(f"POLISHED needle/{clip}: balanced right arm posture")


def smooth_transition(hero: str, clip: str, bone_name: str, center: int) -> None:
    path, armature, action = open_scene(hero, clip)
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        raise RuntimeError(f"{hero}/{clip}: missing bone {bone_name}")
    start, end = (int(value) for value in action.frame_range)
    left = max(start, center - 2)
    right = min(end, center + 2)
    if right - left < 2:
        return
    bpy.context.scene.frame_set(left)
    bpy.context.view_layer.update()
    first = bone.rotation_euler.to_quaternion()
    bpy.context.scene.frame_set(right)
    bpy.context.view_layer.update()
    last = bone.rotation_euler.to_quaternion()
    for frame in range(left, right + 1):
        amount = (frame - left) / (right - left)
        eased = amount * amount * (3.0 - 2.0 * amount)
        key_rotation(bone, frame, first.slerp(last, eased))
    clamp_silhouette_curves(action)
    bpy.context.scene["pose_continuity_revision"] = 1
    bpy.context.scene["pose_continuity_pass"] = "silhouette-transition-slerp-v1"
    action["pose_continuity_revision"] = 1
    action["pose_continuity_pass"] = "silhouette-transition-slerp-v1"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"SMOOTHED {hero}/{clip}/{bone_name}: frames {left}-{right}")


def clamp_all_silhouette_curves() -> None:
    seen = set()
    heroes = tuple(
        (
            "brock-zeus",
            "fairy-mina",
            "kaze",
            "mandy",
            "needle",
            "persephone-lumi",
            "wukong-mico",
            "katty",
        )
    )
    clips = tuple(ACTION_NAMES)
    for hero in heroes:
        for clip in clips:
            path = (
                SOURCE
                / hero
                / ("katty.blend" if hero == "katty" else f"scenes/{clip}.blend")
            )
            if path in seen or not path.exists():
                continue
            seen.add(path)
            _, armature, action = open_scene(hero, clip)
            clamp_silhouette_curves(action)
            bpy.context.scene["pose_curve_clamp_revision"] = 1
            bpy.context.scene["pose_curve_clamp_pass"] = "silhouette-auto-clamped-v1"
            action["pose_curve_clamp_revision"] = 1
            action["pose_curve_clamp_pass"] = "silhouette-auto-clamped-v1"
            bpy.context.preferences.filepaths.save_version = 0
            bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
            print(f"CLAMPED {hero}/{clip}: silhouette rotation handles")


def main() -> None:
    apply_needle_posture()
    for hero, clip, bone_name, center in SMOOTH_CASES:
        smooth_transition(hero, clip, bone_name, center)
    clamp_all_silhouette_curves()


if __name__ == "__main__":
    main()
