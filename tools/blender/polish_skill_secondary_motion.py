"""Add a restrained secondary-motion pass to canonical skill Actions.

The primary authored pose remains the source of truth.  This pass only adds
delayed local rotation to appendages that should settle after the release:
hair, wings, cape, tail, head, wrists, and the flower.  It never keys root or
hip bones and is idempotent through the scene/action revision metadata.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Euler

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action, save_master

ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = Path(__file__).with_name("hero_skill_animation_semantics.json")
REVISION = 2
ACTION_NAMES = {"attack": "Attack", "super": "super", "gadget": "Gadget"}


def d(x=0.0, y=0.0, z=0.0):
    return (math.radians(x), math.radians(y), math.radians(z))


# The vectors are deliberately small.  Opposing signs on paired parts keep
# silhouettes balanced while the delayed peak supplies overlap/follow-through.
SECONDARY = {
    "brock-zeus": {
        "Head": d(4, 0, -5),
        "L_Elbow": d(0, 2, -2),
        "R_Elbow": d(0, -2, 2),
        "R_Wrist": d(0, -5, 0),
        "L_Wrist": d(0, 4, 0),
        "L_LowerLeg": d(2, 0, -1),
        "R_LowerLeg": d(2, 0, 1),
    },
    "fairy-mina": {
        "head_s": d(4, 0, -3),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -3),
        "R_wrist_s": d(0, 0, 3),
        "L_ankle_s": d(1.5, 0, -1),
        "R_ankle_s": d(1.5, 0, 1),
        "L_wing_up_s": d(0, -10, 0),
        "R_wing_up_s": d(0, 10, 0),
        "L_hair_side_2_s": d(5, 0, -4),
    },
    "kaze": {
        "head_s": d(4, 0, -3),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -4),
        "R_wrist_s": d(0, 0, 4),
        "L_knee_s": d(2, 0, -1),
        "R_knee_s": d(2, 0, 1),
        "L_foot_s": d(1, 0, -2),
        "R_foot_s": d(1, 0, 2),
        "back_hair_s": d(7, 0, -9),
        "L_front_hair_s": d(4, 0, -4),
        "R_front_hair_s": d(4, 0, 4),
    },
    "mandy": {
        "head_s_035": d(5, 0, 4),
        "L_elbow_s_045": d(0, 2, -2),
        "R_elbow_s_062": d(0, -2, 2),
        "L_wrist_s_047": d(0, 0, -3),
        "R_wrist_s_064": d(0, 0, 3),
        "L_ankle_s_05": d(1.5, 0, -1),
        "R_ankle_s_09": d(1.5, 0, 1),
        "hat_01_s_036": d(10, 0, -8),
        "L_hair_02_s_040": d(7, 0, -5),
        "R_hair_02_s_042": d(7, 0, 5),
    },
    "needle": {
        "Head": d(5, 0, -4),
        "LeftHand": d(0, 2, -3),
        "RightHand": d(0, -2, 3),
        "LeftFoot": d(2, 0, -1),
        "RightFoot": d(2, 0, 1),
        "Flower": d(0, -12, 0),
    },
    "persephone-lumi": {
        "head_s": d(4, 0, -4),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -3),
        "R_wrist_s": d(0, 0, 3),
        "L_ankle_s": d(1.5, 0, -1),
        "R_ankle_s": d(1.5, 0, 1),
        "cape_0_s": d(8, 0, -10),
        "cape_1_s": d(12, 0, -14),
        "R_front_hair_s": d(4, 0, -5),
    },
    "wukong-mico": {
        "head_s": d(4, 0, -4),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -3),
        "R_wrist_s": d(0, 0, 3),
        "L_ankle_s": d(1.5, 0, -1),
        "R_ankle_s": d(1.5, 0, 1),
        "L_toes_s": d(1, 0, -1),
        "R_toes_s": d(1, 0, 1),
        "Tail_02_s": d(0, -12, 14),
        "Tail_03_s": d(0, -16, 18),
        "Tail_04_s": d(0, -20, 22),
    },
}

CLIP_SCALE = {"attack": 1.0, "super": 1.15, "gadget": 0.78}


def find_action(name: str):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def lerp(a, b, amount):
    return a + (b - a) * amount


def secondary_offset(frame, start, end, release, follow, amplitude, scale):
    """Return a counter-pose, delayed peak, and settling tail."""
    lag = max(1, min(4, round((end - start) * 0.06)))
    counter = max(start, release - lag)
    peak = min(end, release + lag)
    settle = min(end, max(peak, follow + lag))
    zero = (0.0, 0.0, 0.0)
    amount = 0.0
    if frame <= counter:
        amount = -0.16 * smoothstep((frame - start) / max(1, counter - start))
    elif frame <= peak:
        amount = lerp(
            -0.16, 1.0, smoothstep((frame - counter) / max(1, peak - counter))
        )
    elif frame <= settle:
        amount = lerp(1.0, 0.28, smoothstep((frame - peak) / max(1, settle - peak)))
    else:
        amount = lerp(0.28, 0.0, smoothstep((frame - settle) / max(1, end - settle)))
    return tuple(value * amount * scale for value in amplitude)


def key_rotation(bone, frame: int, offset):
    if bone.rotation_mode == "QUATERNION":
        bone.rotation_quaternion = (
            bone.rotation_quaternion @ Euler(offset, "XYZ").to_quaternion()
        )
        bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
        return
    mode = (
        bone.rotation_mode
        if bone.rotation_mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
        else "XYZ"
    )
    bone.rotation_euler = Euler(
        tuple(bone.rotation_euler[index] + offset[index] for index in range(3)), mode
    )
    bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)


def polish(hero: str, clip: str, contract: dict):
    path, scene, armature, action = activate_action(hero, clip)
    if scene.get("natural_motion_revision") == REVISION:
        print(f"SKIP {hero}/{clip}: secondary-motion revision {REVISION}")
        return

    target_bones = SECONDARY[hero]
    missing = sorted(set(target_bones) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"{hero}/{clip}: missing secondary bones {missing}")

    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = int(contract["frames"][0]), int(contract["frames"][-1])
    release = int(contract["release"])
    follow = int(contract["frames"][-2])
    scale = CLIP_SCALE[clip]
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for bone_name, amplitude in target_bones.items():
            bone = armature.pose.bones[bone_name]
            offset = secondary_offset(
                frame, start, end, release, follow, amplitude, scale
            )
            key_rotation(bone, frame, offset)

    scene["natural_motion_revision"] = REVISION
    scene["natural_motion_pass"] = "delayed-secondary-overlap-v2"
    action["natural_motion_revision"] = REVISION
    action["natural_motion_pass"] = "delayed-secondary-overlap-v2"
    save_master(path)
    print(f"POLISHED {hero}/{clip}: delayed secondary overlap")


def main():
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    requested = os.environ.get("HERO_FILTER")
    heroes = spec["heroes"]
    if requested:
        heroes = {requested: heroes[requested]}
    for hero, clips in heroes.items():
        for clip, contract in clips.items():
            polish(hero, clip, contract)


if __name__ == "__main__":
    main()
