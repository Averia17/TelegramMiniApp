"""Reduce over-strong idle secondary motion without touching hero rig bindings."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action, save_master

ROOT = Path(__file__).resolve().parents[2]
REVISION = 2
PASS_NAME = "balanced-locomotion-follow-through-v2"

# The existing v1 pass was authored on top of the intended rest pose. Scale
# only the excursion from frame 0, preserving the rest pose, loop endpoint and
# all mesh/armature repair metadata. Hair follows the same conservative pass so
# it cannot visually exaggerate a head correction.
PROFILES = {
    "mandy": {
        "head_s_035": 0.45,
        "hat_01_s_036": 0.45,
        "L_wrist_s_047": 0.55,
        "R_wrist_s_064": 0.55,
        "L_ankle_s_05": 0.65,
        "R_ankle_s_09": 0.65,
        "L_hair_02_s_040": 0.45,
        "R_hair_02_s_042": 0.45,
    },
    "needle": {
        "Head": 0.45,
        "LeftHand": 0.55,
        "RightHand": 0.55,
        "LeftFoot": 0.65,
        "RightFoot": 0.65,
        "Flower": 0.35,
    },
    "brock-zeus": {
        "Head": 0.55,
        "L_Elbow": 0.65,
        "R_Elbow": 0.65,
        "L_Wrist": 0.65,
        "R_Wrist": 0.65,
        "L_LowerLeg": 0.70,
        "R_LowerLeg": 0.70,
    },
    "kaze": {
        "head_s": 0.50,
        "L_wrist_s": 0.60,
        "R_wrist_s": 0.60,
        "L_foot_s": 0.65,
        "R_foot_s": 0.65,
        "L_front_hair_s": 0.45,
        "R_front_hair_s": 0.45,
    },
}


def find_action(name: str):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def attenuate(hero: str, profile: dict[str, float]) -> None:
    path, scene, armature, action = activate_action(hero, "idle")
    missing = sorted(set(profile) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"{hero}/idle: missing bones {missing}")

    start, end = (int(value) for value in action.frame_range)
    initial: dict[str, tuple[float, float, float]] = {}
    scene.frame_set(start)
    bpy.context.view_layer.update()
    for name in profile:
        initial[name] = tuple(
            float(value) for value in armature.pose.bones[name].rotation_euler
        )

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name, factor in profile.items():
            bone = armature.pose.bones[name]
            current = tuple(float(value) for value in bone.rotation_euler)
            base = initial[name]
            bone.rotation_euler = tuple(
                base[index] + (current[index] - base[index]) * factor
                for index in range(3)
            )
            bone.keyframe_insert("rotation_euler", frame=frame, group=name)

    scene["natural_locomotion_revision"] = REVISION
    scene["natural_locomotion_pass"] = PASS_NAME
    action["natural_locomotion_revision"] = REVISION
    action["natural_locomotion_pass"] = PASS_NAME
    save_master(path)
    print(f"REPAIRED {hero}/idle: {PASS_NAME}")


def main() -> None:
    requested = os.environ.get("HERO_FILTER")
    profiles = {requested: PROFILES[requested]} if requested else PROFILES
    for hero, profile in profiles.items():
        attenuate(hero, profile)


if __name__ == "__main__":
    main()
