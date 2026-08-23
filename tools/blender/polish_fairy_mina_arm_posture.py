"""Bring Fairy Mina's authored arms into a relaxed, human-readable posture.

The source rig's hand pose was mirrored correctly in position but had a locked
shoulder lift and a palm-out wrist twist in every scene. This pass applies the
same small local-space correction to the existing animation, so skill timing
and authored accents remain intact while the arm silhouette stays natural.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Euler

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "scenes"
REVISION = 1


def d(x=0.0, y=0.0, z=0.0):
    return (math.radians(x), math.radians(y), math.radians(z))


CORRECTION = {
    # Lower the upper arms slightly and avoid the locked, raised-shoulder line.
    "L_shoulder_s": d(-10, 0, -16),
    "R_shoulder_s": d(-10, 0, 16),
    # Keep a soft elbow bend instead of a straight, broken-looking forearm.
    "L_elbow_s": d(10),
    "R_elbow_s": d(10),
    # Remove the mirrored palm-out twist and keep the wrists aligned with the
    # forearms. The signs are mirrored because the donor rig is symmetrical.
    "L_wrist_s": d(-10, 8, 8),
    "R_wrist_s": d(-10, -8, -8),
}


def find_action(stem: str):
    canonical = {
        "aim": "Aim",
        "aim-gadget": "AimGadget",
        "aim-super": "AimSuper",
        "attack": "Attack",
        "gadget": "Gadget",
        "spawn": "Spawn",
        "victory": "Victory",
    }.get(stem, stem)
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == canonical.casefold()
        ),
        None,
    )


def get_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):  # Blender 5.x
                curves.extend(channelbag.fcurves)
    return curves


def simplify_curve_group(curves, tolerance=0.0035):
    """Keep one smooth, shared timing curve for all rotation axes."""
    times = sorted(
        {float(point.co.x) for curve in curves for point in curve.keyframe_points}
    )
    if len(times) <= 3:
        return
    samples = [[curve.evaluate(time) for curve in curves] for time in times]
    keep = {0, len(times) - 1}

    def split(first, last):
        if last - first <= 1:
            return
        x1, x2 = times[first], times[last]
        span = x2 - x1
        furthest = None
        largest = tolerance
        for index in range(first + 1, last):
            amount = (times[index] - x1) / span if span else 0.0
            distance = max(
                abs(
                    samples[index][axis]
                    - (
                        samples[first][axis]
                        + (samples[last][axis] - samples[first][axis]) * amount
                    )
                )
                for axis in range(len(curves))
            )
            if distance > largest:
                largest = distance
                furthest = index
        if furthest is not None:
            keep.add(furthest)
            split(first, furthest)
            split(furthest, last)

    split(0, len(times) - 1)
    for curve in curves:
        for point in reversed(list(curve.keyframe_points)):
            curve.keyframe_points.remove(point)
        for index in sorted(keep):
            curve.keyframe_points.insert(
                times[index], samples[index][curves.index(curve)]
            )
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
            key.handle_left_type = "AUTO_CLAMPED"
            key.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def smooth_corrected_action(action):
    target_paths = tuple(f'pose.bones["{name}"]' for name in CORRECTION)
    groups = {}
    for curve in get_fcurves(action):
        if any(path in curve.data_path for path in target_paths) and (
            curve.data_path.endswith("rotation_euler")
            or curve.data_path.endswith("rotation_quaternion")
        ):
            groups.setdefault(curve.data_path, []).append(curve)
    for curves in groups.values():
        simplify_curve_group(curves)


def apply_correction(armature, action):
    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = (int(action.frame_range[0]), int(action.frame_range[1]))
    for frame in range(start, end + 1):
        bpy.context.scene.frame_set(frame)
        for name, offset in CORRECTION.items():
            bone = armature.pose.bones[name]
            mode = bone.rotation_mode
            if mode == "QUATERNION":
                bone.rotation_quaternion = (
                    bone.rotation_quaternion @ Euler(offset, "XYZ").to_quaternion()
                )
                bone.keyframe_insert("rotation_quaternion", frame=frame, group=name)
                continue
            euler_mode = (
                mode if mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"} else "XYZ"
            )
            bone.rotation_euler = Euler(
                tuple(bone.rotation_euler[index] + offset[index] for index in range(3)),
                euler_mode,
            )
            bone.keyframe_insert("rotation_euler", frame=frame, group=name)


for path in sorted(SOURCE.glob("*.blend")):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    if scene.get("fairy_arm_posture_revision") == REVISION:
        armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
        action = find_action(path.stem)
        if armature is None or action is None:
            raise RuntimeError(f"fairy-mina/{path.stem}: missing armature or action")
        smooth_corrected_action(action)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
        print(f"SMOOTHED fairy-mina/{path.stem}: clamped corrected curves")
        continue
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(path.stem)
    if armature is None or action is None:
        raise RuntimeError(f"fairy-mina/{path.stem}: missing armature or action")
    missing = sorted(set(CORRECTION) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"fairy-mina/{path.stem}: missing bones {missing}")
    apply_correction(armature, action)
    smooth_corrected_action(action)
    scene["fairy_arm_posture_revision"] = REVISION
    scene["fairy_arm_posture_pass"] = "relaxed-human-arms"
    action["fairy_arm_posture_revision"] = REVISION
    action["fairy_arm_posture_pass"] = "relaxed-human-arms"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"POLISHED fairy-mina/{path.stem}: relaxed human arm posture")
