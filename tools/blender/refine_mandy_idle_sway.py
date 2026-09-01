"""Reduce Mandy's idle sway while preserving the authored loop and rest pose."""

from __future__ import annotations

import json
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
REVISION = 4
PASS_NAME = "restrained-idle-sway-v4"
FILTER_PASSES = 3

ATTENUATION = {
    "hips_s_02": 0.45,
    "spine_lower_s_030": 0.45,
    "spine_mid_s_031": 0.45,
    "spine_upper_s_032": 0.45,
    "chest_s_033": 0.45,
    "head_s_035": 0.45,
    "hat_01_s_036": 0.35,
    "L_wrist_s_047": 0.45,
    "R_wrist_s_064": 0.45,
    "L_ankle_s_05": 0.45,
    "R_ankle_s_09": 0.45,
    "L_hair_02_s_040": 0.35,
    "R_hair_02_s_042": 0.35,
}


def action_curves(action):
    if hasattr(action, "fcurves"):
        return [(None, curve) for curve in action.fcurves]
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend((channelbag, curve) for curve in channelbag.fcurves)
    return curves


def clear_rotation_tracks(action, bone_names):
    targets = tuple(f'"{name}"' for name in bone_names)
    grouped = {}
    for channelbag, curve in action_curves(action):
        if not curve.data_path.startswith("pose.bones["):
            continue
        if not any(target in curve.data_path for target in targets):
            continue
        if curve.data_path.endswith(("rotation_euler", "rotation_quaternion")):
            grouped.setdefault(channelbag, []).append(curve)
    for channelbag, curves in grouped.items():
        for curve in curves:
            if channelbag is None:
                action.fcurves.remove(curve)
            else:
                channelbag.fcurves.remove(curve)


def cyclic_smooth(samples):
    values = list(samples)
    for _ in range(FILTER_PASSES):
        values = [
            tuple(
                (
                    values[(index - 1) % len(values)][axis]
                    + 2.0 * values[index][axis]
                    + values[(index + 1) % len(values)][axis]
                )
                / 4.0
                for axis in range(3)
            )
            for index in range(len(values))
        ]
    return values


def attenuate(values, base, factor):
    return [
        tuple(base[axis] + (value[axis] - base[axis]) * factor for axis in range(3))
        for value in values
    ]


def key_rotation(bone, frame, value):
    bone.rotation_euler = value
    bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)


def save_master(path):
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path))


def main():
    path, scene, armature, action = activate_action("mandy", "idle")
    missing = sorted(set(ATTENUATION) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"mandy/idle: missing bones {missing}")

    start, end = (int(value) for value in action.frame_range)
    period = max(1, end - start)
    source = {name: [] for name in ATTENUATION}
    for frame in range(start, end):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in ATTENUATION:
            source[name].append(
                tuple(
                    float(value) for value in armature.pose.bones[name].rotation_euler
                )
            )

    filtered = {
        name: attenuate(cyclic_smooth(values), values[0], ATTENUATION[name])
        for name, values in source.items()
    }

    clear_rotation_tracks(action, tuple(ATTENUATION))
    for index, frame in enumerate(range(start, end)):
        for name in ATTENUATION:
            key_rotation(armature.pose.bones[name], frame, filtered[name][index])
    for name in ATTENUATION:
        key_rotation(armature.pose.bones[name], end, filtered[name][0])

    for _, curve in action_curves(action):
        if curve.data_path.startswith("pose.bones[") and any(
            f'"{name}"' in curve.data_path for name in ATTENUATION
        ):
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"

    scene["natural_locomotion_revision"] = REVISION
    scene["natural_locomotion_pass"] = PASS_NAME
    action["natural_locomotion_revision"] = REVISION
    action["natural_locomotion_pass"] = PASS_NAME
    save_master(path)

    report = {
        "hero": "mandy",
        "clip": "idle",
        "frame_range": [start, end],
        "period": period,
        "revision": REVISION,
        "pass": PASS_NAME,
        "attenuation": ATTENUATION,
    }
    output = ROOT / "output" / "blender" / "mandy-idle-sway-refinement.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {"output": os.fspath(output), "revision": REVISION, "pass": PASS_NAME}
        )
    )


if __name__ == "__main__":
    main()
