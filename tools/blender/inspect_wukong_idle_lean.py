"""Compare Wukong's idle lean against the original authored model."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
CURRENT = (
    ROOT / "frontend" / "assets-source" / "heroes" / "wukong-mico" / "wukong-mico.blend"
)
REFERENCE = ROOT / "output" / "blender" / "wukong-proportion-reference-742e47c.blend"
BONES = (
    "Root",
    "hips_s",
    "spine_lower_s",
    "spine_mid_s",
    "spine_upper_s",
    "chest_s",
    "neck_s",
    "head_s",
)


def degrees(values):
    return [round(math.degrees(float(value)), 3) for value in values]


def bone_angles(bone):
    values = (
        bone.rotation_quaternion.to_euler()
        if bone.rotation_mode == "QUATERNION"
        else bone.rotation_euler
    )
    return degrees(values)


def activate_idle(path: Path):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    action = next(
        action
        for action in bpy.data.actions
        if action.name.casefold().split(".")[0] == "idle"
    )
    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = (int(round(value)) for value in action.frame_range)
    return bpy.context.scene, armature, start, end, action


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def sample(path: Path, label: str):
    scene, armature, start, end, action = activate_idle(path)
    frames = sorted({start, (start + end) // 2, end})
    samples = []
    frame_rotations = []
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        available = {bone.name for bone in armature.pose.bones}
        hips = armature.pose.bones.get("hips_s")
        head = armature.pose.bones.get("head_s")
        lean = None
        if hips and head:
            vector = (
                armature.matrix_world @ head.head - armature.matrix_world @ hips.head
            )
            lean = round(math.degrees(math.atan2(vector.x, vector.y)), 3)
        samples.append(
            {
                "frame": frame,
                "lean_degrees": lean,
                "bones": {
                    name: bone_angles(armature.pose.bones[name])
                    for name in BONES
                    if name in available
                },
                "all_bones": {
                    bone.name: bone_angles(bone) for bone in armature.pose.bones
                },
            }
        )
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        frame_rotations.append(
            {
                bone.name: tuple(math.radians(value) for value in bone_angles(bone))
                for bone in armature.pose.bones
            }
        )
    initial = frame_rotations[0]
    max_excursion = {}
    for name in initial:
        max_excursion[name] = round(
            max(
                math.degrees(
                    math.sqrt(
                        sum(
                            (rotation[name][index] - initial[name][index]) ** 2
                            for index in range(3)
                        )
                    )
                )
                for rotation in frame_rotations
            ),
            3,
        )
    curve_summary = [
        {
            "path": curve.data_path,
            "index": curve.array_index,
            "min": round(min(float(point.co[1]) for point in curve.keyframe_points), 6),
            "max": round(max(float(point.co[1]) for point in curve.keyframe_points), 6),
            "keys": len(curve.keyframe_points),
        }
        for curve in action_curves(action)
        if any(
            f'pose.bones["{name}"]' in curve.data_path
            for name in ("Root", "spine_upper_s")
        )
    ]
    return {
        "label": label,
        "range": [start, end],
        "samples": samples,
        "max_excursion_degrees": max_excursion,
        "curve_summary": curve_summary,
    }


def main():
    report = {
        "current": sample(CURRENT, "current"),
        "original": sample(REFERENCE, "original"),
    }
    output = ROOT / "output" / "blender" / "wukong-idle-lean-diagnostics.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
