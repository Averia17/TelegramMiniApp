"""Add restrained, loop-safe secondary motion to focused idle/run clips."""

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
from polish_skill_secondary_motion import d, key_rotation

ROOT = Path(__file__).resolve().parents[2]
REVISION = 1


PROFILES = {
    "mandy": {
        "idle": {
            "head_s_035": (d(1.2, 0, 2.0), 1.0, 0.0),
            "L_wrist_s_047": (d(0, 0, -1.4), 1.0, 0.0),
            "R_wrist_s_064": (d(0, 0, 1.4), 1.0, 0.5),
            "L_ankle_s_05": (d(0.7, 0, -0.5), 1.0, 0.2),
            "R_ankle_s_09": (d(0.7, 0, 0.5), 1.0, 0.7),
            "hat_01_s_036": (d(2.0, 0, -1.5), 1.0, -0.1),
        },
        "run": {
            "head_s_035": (d(1.0, 0, 2.0), 1.0, 0.0),
            "L_elbow_s_045": (d(0, 1.5, -1.0), 1.0, 0.0),
            "R_elbow_s_062": (d(0, -1.5, 1.0), 1.0, 0.5),
            "L_wrist_s_047": (d(0, 0, -3.0), 1.0, 0.0),
            "R_wrist_s_064": (d(0, 0, 3.0), 1.0, 0.5),
            "L_ankle_s_05": (d(1.0, 0, -0.8), 1.0, 0.0),
            "R_ankle_s_09": (d(1.0, 0, 0.8), 1.0, 0.5),
            "hat_01_s_036": (d(3.0, 0, -2.0), 1.0, -0.1),
        },
    },
    "kaze": {
        "idle": {
            "head_s": (d(1.2, 0, -2.0), 1.0, 0.0),
            "L_wrist_s": (d(0, 0, -1.8), 1.0, 0.0),
            "R_wrist_s": (d(0, 0, 1.8), 1.0, 0.5),
            "L_foot_s": (d(0.8, 0, -1.0), 1.0, 0.0),
            "R_foot_s": (d(0.8, 0, 1.0), 1.0, 0.5),
            "L_front_hair_s": (d(2.5, 0, -3.0), 1.0, -0.1),
            "R_front_hair_s": (d(2.5, 0, 3.0), 1.0, 0.4),
        },
        "run": {
            "head_s": (d(1.5, 0, -2.0), 1.0, 0.0),
            "L_elbow_s": (d(0, 1.5, -1.0), 1.0, 0.0),
            "R_elbow_s": (d(0, -1.5, 1.0), 1.0, 0.5),
            "L_wrist_s": (d(0, 0, -3.5), 1.0, 0.0),
            "R_wrist_s": (d(0, 0, 3.5), 1.0, 0.5),
            "L_knee_s": (d(1.4, 0, -0.8), 1.0, 0.0),
            "R_knee_s": (d(1.4, 0, 0.8), 1.0, 0.5),
            "L_foot_s": (d(1.6, 0, -1.4), 1.0, 0.0),
            "R_foot_s": (d(1.6, 0, 1.4), 1.0, 0.5),
            "back_hair_s": (d(4.0, 0, -5.0), 1.0, -0.15),
        },
    },
    "wukong-mico": {
        "idle": {
            "head_s": (d(1.0, 0, -1.5), 1.0, 0.0),
            "L_wrist_s": (d(0, 0, -1.8), 1.0, 0.0),
            "R_wrist_s": (d(0, 0, 1.8), 1.0, 0.5),
            "L_ankle_s": (d(0.8, 0, -0.7), 1.0, 0.0),
            "R_ankle_s": (d(0.8, 0, 0.7), 1.0, 0.5),
            "L_toes_s": (d(0.6, 0, -0.6), 1.0, 0.0),
            "R_toes_s": (d(0.6, 0, 0.6), 1.0, 0.5),
            "Tail_02_s": (d(0, -4, 5), 1.0, -0.1),
            "Tail_03_s": (d(0, -5, 7), 1.0, -0.18),
        },
        "run": {
            "head_s": (d(1.2, 0, -2.0), 1.0, 0.0),
            "L_elbow_s": (d(0, 1.5, -1.0), 1.0, 0.0),
            "R_elbow_s": (d(0, -1.5, 1.0), 1.0, 0.5),
            "L_wrist_s": (d(0, 0, -3.0), 1.0, 0.0),
            "R_wrist_s": (d(0, 0, 3.0), 1.0, 0.5),
            "L_ankle_s": (d(1.4, 0, -1.0), 1.0, 0.0),
            "R_ankle_s": (d(1.4, 0, 1.0), 1.0, 0.5),
            "L_toes_s": (d(1.0, 0, -0.8), 1.0, 0.0),
            "R_toes_s": (d(1.0, 0, 0.8), 1.0, 0.5),
            "Tail_02_s": (d(0, -6, 8), 1.0, -0.1),
            "Tail_03_s": (d(0, -8, 10), 1.0, -0.18),
            "Tail_04_s": (d(0, -10, 12), 1.0, -0.25),
        },
    },
    "needle": {
        "idle": {
            "Head": (d(1.5, 0, -1.5), 1.0, 0.0),
            "LeftHand": (d(0, 1.2, -1.8), 1.0, 0.0),
            "RightHand": (d(0, -1.2, 1.8), 1.0, 0.5),
            "LeftFoot": (d(0.8, 0, -0.7), 1.0, 0.0),
            "RightFoot": (d(0.8, 0, 0.7), 1.0, 0.5),
            "Flower": (d(0, -4, 0), 1.0, -0.12),
        },
        "run": {
            "Head": (d(1.8, 0, -2.0), 1.0, 0.0),
            "LeftHand": (d(0, 2.0, -2.5), 1.0, 0.0),
            "RightHand": (d(0, -2.0, 2.5), 1.0, 0.5),
            "LeftFoot": (d(1.4, 0, -1.2), 1.0, 0.0),
            "RightFoot": (d(1.4, 0, 1.2), 1.0, 0.5),
            "Flower": (d(0, -7, 0), 1.0, -0.15),
        },
    },
    "persephone-lumi": {
        "idle": {
            "head_s": (d(1.2, 0, -1.8), 1.0, 0.0),
            "L_wrist_s": (d(0, 0, -1.8), 1.0, 0.0),
            "R_wrist_s": (d(0, 0, 1.8), 1.0, 0.5),
            "L_ankle_s": (d(0.8, 0, -0.7), 1.0, 0.0),
            "R_ankle_s": (d(0.8, 0, 0.7), 1.0, 0.5),
            "cape_0_s": (d(3, 0, -4), 1.0, -0.08),
            "cape_1_s": (d(4, 0, -6), 1.0, -0.15),
            "R_front_hair_s": (d(2.5, 0, -3), 1.0, -0.15),
        },
        "run": {
            "head_s": (d(1.5, 0, -2), 1.0, 0.0),
            "L_elbow_s": (d(0, 1.5, -1), 1.0, 0.0),
            "R_elbow_s": (d(0, -1.5, 1), 1.0, 0.5),
            "L_wrist_s": (d(0, 0, -3), 1.0, 0.0),
            "R_wrist_s": (d(0, 0, 3), 1.0, 0.5),
            "L_ankle_s": (d(1.5, 0, -1), 1.0, 0.0),
            "R_ankle_s": (d(1.5, 0, 1), 1.0, 0.5),
            "cape_0_s": (d(5, 0, -7), 1.0, -0.08),
            "cape_1_s": (d(7, 0, -10), 1.0, -0.15),
            "R_front_hair_s": (d(3, 0, -4), 1.0, -0.15),
        },
    },
    "brock-zeus": {
        "idle": {
            "Head": (d(1.2, 0, -1.5), 1.0, 0.0),
            "L_Elbow": (d(0, 1.2, -1), 1.0, 0.0),
            "R_Elbow": (d(0, -1.2, 1), 1.0, 0.5),
            "L_Wrist": (d(0, 0, -1.6), 1.0, 0.0),
            "R_Wrist": (d(0, 0, 1.6), 1.0, 0.5),
            "L_LowerLeg": (d(0.7, 0, -0.5), 1.0, 0.0),
            "R_LowerLeg": (d(0.7, 0, 0.5), 1.0, 0.5),
        },
        "run": {
            "Head": (d(1.5, 0, -2), 1.0, 0.0),
            "L_Elbow": (d(0, 1.8, -1), 1.0, 0.0),
            "R_Elbow": (d(0, -1.8, 1), 1.0, 0.5),
            "L_Wrist": (d(0, 0, -3), 1.0, 0.0),
            "R_Wrist": (d(0, 0, 3), 1.0, 0.5),
            "L_LowerLeg": (d(1.3, 0, -0.8), 1.0, 0.0),
            "R_LowerLeg": (d(1.3, 0, 0.8), 1.0, 0.5),
        },
    },
}


def polish(hero: str, clip: str, profile: dict):
    path, scene, armature, action = activate_action(hero, clip)
    if scene.get("natural_locomotion_revision"):
        print(f"SKIP {hero}/{clip}: existing locomotion pass")
        return
    missing = sorted(set(profile) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"{hero}/{clip}: missing bones {missing}")

    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = int(action.frame_range[0]), int(action.frame_range[1])
    span = max(1, end - start)
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        phase = (frame - start) / span
        for bone_name, (amplitude, cycles, phase_offset) in profile.items():
            amount = math.sin((phase * cycles + phase_offset) * math.tau)
            key_rotation(
                armature.pose.bones[bone_name],
                frame,
                tuple(value * amount for value in amplitude),
            )

    scene["natural_locomotion_revision"] = REVISION
    scene["natural_locomotion_pass"] = "balanced-locomotion-follow-through-v1"
    action["natural_locomotion_revision"] = REVISION
    action["natural_locomotion_pass"] = "balanced-locomotion-follow-through-v1"
    save_master(path)
    print(f"POLISHED {hero}/{clip}: balanced locomotion follow-through")


def main():
    for hero, clips in PROFILES.items():
        for clip, profile in clips.items():
            polish(hero, clip, profile)


if __name__ == "__main__":
    main()
