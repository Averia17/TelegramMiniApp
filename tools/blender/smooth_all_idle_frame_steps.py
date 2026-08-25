"""Resample visible idle secondary motion to remove single-frame jumps."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action, save_master

ROOT = Path(__file__).resolve().parents[2]
REVISION = 3
PASS_NAME = "loop-safe-frame-smoothing-v3"
FILTER_PASSES = 4

# These are silhouette-critical bones and the accessory chains attached to
# them. A three-sample cyclic filter preserves the authored motion while
# removing one-frame impulses at keyed poses and at the loop boundary.
PROFILES = {
    "brock-zeus": (
        "Head",
        "L_Elbow",
        "R_Elbow",
        "L_Wrist",
        "R_Wrist",
        "L_LowerLeg",
        "R_LowerLeg",
    ),
    "fairy-mina": (
        "head_s",
        "L_hair_side_1_s",
        "L_hair_side_2_s",
        "L_hair_side_3_s",
        "L_wing_up_s",
        "R_wing_up_s",
        "L_wing_down_s",
        "R_wing_down_s",
    ),
    "kaze": (
        "head_s",
        "L_wrist_s",
        "R_wrist_s",
        "L_foot_s",
        "R_foot_s",
        "L_front_hair_s",
        "R_front_hair_s",
    ),
    "mandy": (
        "head_s_035",
        "hat_01_s_036",
        "L_wrist_s_047",
        "R_wrist_s_064",
        "L_ankle_s_05",
        "R_ankle_s_09",
        "L_hair_02_s_040",
        "R_hair_02_s_042",
    ),
    "needle": ("Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "Flower"),
    "persephone-lumi": (
        "head_s",
        "cape_0_s",
        "cape_1_s",
        "R_front_hair_s",
        "L_wrist_s",
        "R_wrist_s",
    ),
    "wukong-mico": ("head_s", "Tail_02_s", "Tail_03_s", "L_wrist_s", "R_wrist_s"),
}

ATTENUATION = {
    "brock-zeus": {name: 0.80 for name in PROFILES["brock-zeus"]},
    "fairy-mina": {
        "head_s": 0.80,
        "L_hair_side_1_s": 0.35,
        "L_hair_side_2_s": 0.35,
        "L_hair_side_3_s": 0.35,
        "L_wing_up_s": 0.60,
        "R_wing_up_s": 0.60,
        "L_wing_down_s": 0.60,
        "R_wing_down_s": 0.60,
    },
    "kaze": {
        "head_s": 0.75,
        "L_wrist_s": 0.70,
        "R_wrist_s": 0.70,
        "L_foot_s": 0.75,
        "R_foot_s": 0.75,
        "L_front_hair_s": 0.35,
        "R_front_hair_s": 0.35,
    },
    "mandy": {
        "head_s_035": 0.55,
        "hat_01_s_036": 0.50,
        "L_wrist_s_047": 0.65,
        "R_wrist_s_064": 0.65,
        "L_ankle_s_05": 0.70,
        "R_ankle_s_09": 0.70,
        "L_hair_02_s_040": 0.50,
        "R_hair_02_s_042": 0.50,
    },
    "needle": {
        "Head": 0.70,
        "LeftHand": 0.70,
        "RightHand": 0.70,
        "LeftFoot": 0.75,
        "RightFoot": 0.75,
        "Flower": 0.45,
    },
    "persephone-lumi": {
        "head_s": 0.90,
        "cape_0_s": 0.70,
        "cape_1_s": 0.70,
        "R_front_hair_s": 0.85,
        "L_wrist_s": 0.90,
        "R_wrist_s": 0.90,
    },
    "wukong-mico": {
        "head_s": 0.90,
        "Tail_02_s": 0.70,
        "Tail_03_s": 0.70,
        "L_wrist_s": 0.90,
        "R_wrist_s": 0.90,
    },
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


def clear_rotation_tracks(action, bone_names: tuple[str, ...]) -> None:
    targets = tuple(f'"{name}"' for name in bone_names)
    grouped = {}
    for channelbag, curve in action_curves(action):
        if curve.data_path.startswith("pose.bones[") and any(
            target in curve.data_path for target in targets
        ):
            if curve.data_path.endswith(("rotation_euler", "rotation_quaternion")):
                grouped.setdefault(channelbag, []).append(curve)
    for channelbag, curves in grouped.items():
        for curve in curves:
            if channelbag is None:
                action.fcurves.remove(curve)
            else:
                channelbag.fcurves.remove(curve)


def set_linear(action, bone_names: tuple[str, ...]) -> None:
    targets = tuple(f'"{name}"' for name in bone_names)
    for _, curve in action_curves(action):
        if curve.data_path.startswith("pose.bones[") and any(
            target in curve.data_path for target in targets
        ):
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"


def write_sampled_curves(
    action, start: int, end: int, modes: dict[str, str], filtered: dict[str, list]
) -> None:
    wanted = {
        (
            f'pose.bones["{name}"].rotation_{"quaternion" if modes[name] == "QUATERNION" else "euler"}',
            axis,
        ): [value[axis] for value in filtered[name]]
        + [filtered[name][0][axis]]
        for name in modes
        for axis in range(4 if modes[name] == "QUATERNION" else 3)
    }
    for _, curve in action_curves(action):
        values = wanted.get((curve.data_path, curve.array_index))
        if values is None:
            continue
        for point in curve.keyframe_points:
            frame = int(round(point.co.x))
            if start <= frame <= end:
                point.co.y = float(values[frame - start])
                point.handle_left_type = "VECTOR"
                point.handle_right_type = "VECTOR"


def quaternion_average(
    previous: Quaternion, current: Quaternion, following: Quaternion
) -> Quaternion:
    values = []
    for weight, value in ((1.0, previous), (2.0, current), (1.0, following)):
        aligned = value.copy()
        if current.dot(aligned) < 0.0:
            aligned.negate()
        values.append((weight, aligned))
    result = Quaternion(
        (
            sum(weight * value.w for weight, value in values),
            sum(weight * value.x for weight, value in values),
            sum(weight * value.y for weight, value in values),
            sum(weight * value.z for weight, value in values),
        )
    )
    return result.normalized()


def smooth(hero: str, bone_names: tuple[str, ...]) -> None:
    path, scene, armature, action = activate_action(hero, "idle")
    missing = sorted(set(bone_names) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"{hero}/idle: missing bones {missing}")

    start, end = (int(value) for value in action.frame_range)
    period = max(2, end - start)
    modes = {name: armature.pose.bones[name].rotation_mode for name in bone_names}
    source = {name: [] for name in bone_names}
    for frame in range(start, end):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in bone_names:
            bone = armature.pose.bones[name]
            if modes[name] == "QUATERNION":
                source[name].append(bone.rotation_quaternion.copy())
            else:
                source[name].append(
                    tuple(float(value) for value in bone.rotation_euler)
                )

    filtered = {}
    for name in bone_names:
        samples = source[name]
        values = []
        values = list(samples)
        for _ in range(FILTER_PASSES):
            smoothed = []
            for index, current in enumerate(values):
                previous = values[(index - 1) % period]
                following = values[(index + 1) % period]
                if modes[name] == "QUATERNION":
                    smoothed.append(quaternion_average(previous, current, following))
                else:
                    smoothed.append(
                        tuple(
                            (previous[axis] + 2.0 * current[axis] + following[axis])
                            / 4.0
                            for axis in range(3)
                        )
                    )
            values = smoothed
        if modes[name] == "QUATERNION":
            offset = samples[0] @ values[0].inverted()
            filtered[name] = [offset @ value for value in values]
            base = samples[0]
            factor = ATTENUATION[hero][name]
            filtered[name] = [base.slerp(value, factor) for value in filtered[name]]
        else:
            # Keep the authored rest pose while smoothing the cyclic neighbourhood.
            offset = tuple(samples[0][axis] - values[0][axis] for axis in range(3))
            filtered[name] = [
                tuple(value[axis] + offset[axis] for axis in range(3))
                for value in values
            ]
            base = samples[0]
            factor = ATTENUATION[hero][name]
            filtered[name] = [
                tuple(
                    base[axis] + (value[axis] - base[axis]) * factor
                    for axis in range(3)
                )
                for value in filtered[name]
            ]

    clear_rotation_tracks(action, bone_names)
    for index, frame in enumerate(range(start, end)):
        scene.frame_set(frame)
        for name in bone_names:
            bone = armature.pose.bones[name]
            if modes[name] == "QUATERNION":
                bone.rotation_quaternion = filtered[name][index]
                bone.keyframe_insert("rotation_quaternion", frame=frame, group=name)
            else:
                bone.rotation_euler = filtered[name][index]
                bone.keyframe_insert("rotation_euler", frame=frame, group=name)
    scene.frame_set(end)
    for name in bone_names:
        bone = armature.pose.bones[name]
        if modes[name] == "QUATERNION":
            bone.rotation_quaternion = filtered[name][0]
            bone.keyframe_insert("rotation_quaternion", frame=end, group=name)
        else:
            bone.rotation_euler = filtered[name][0]
            bone.keyframe_insert("rotation_euler", frame=end, group=name)

    write_sampled_curves(action, start, end, modes, filtered)
    set_linear(action, bone_names)
    scene["natural_locomotion_revision"] = REVISION
    scene["natural_locomotion_pass"] = PASS_NAME
    action["natural_locomotion_revision"] = REVISION
    action["natural_locomotion_pass"] = PASS_NAME
    save_master(path)
    print(f"SMOOTHED {hero}/idle: {PASS_NAME}")


def main() -> None:
    requested = os.environ.get("HERO_FILTER")
    heroes = (requested,) if requested else tuple(PROFILES)
    for hero in heroes:
        smooth(hero, PROFILES[hero])


if __name__ == "__main__":
    main()
