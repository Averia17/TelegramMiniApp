"""Author Mandy's twelve focused animation scenes on the live MandyRig.

The choreography tables below use the brief's 0-based frame notation. Blender
keys are written at ``brief_frame + 1`` while the scene Timeline End remains the
authored duration. The closing cycle key therefore lives at duration + 1 and
matches the first pose without extending playback.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/author_mandy_animation_scenes.py
"""

from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler

ROOT = Path(__file__).resolve().parents[2]
HERO = "mandy"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "mandy.blend"
SCENES = MASTER.parent / "scenes"
REPORT = ROOT / "artifacts" / "mandy-animation-authoring.json"
FPS = 30

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

FRAME_DURATIONS = {
    "idle": 90,
    "run": 20,
    "attack": 16,
    "super": 50,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 16,
    "aim-gadget": 60,
}

CYCLE_CLIPS = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ABILITY_CLIPS = {"attack", "super", "gadget"}
SKILL_EVENT_FRAMES = {
    "attack": {"impact": 6, "shockwave_start": 6, "shockwave_end": 10},
    "super": {
        "charge_end": 20,
        "contact": 30,
        "hold_start": 30,
        "hold_end": 40,
        "wave_start": 30,
    },
    "gadget": {"plant_start": 4, "stance_start": 10, "stance_end": 16},
}

BONES = {
    "root": "Root_2_01",
    "hips": "hips_s_02",
    "spine_lower": "spine_lower_s_030",
    "spine_mid": "spine_mid_s_031",
    "spine_upper": "spine_upper_s_032",
    "chest": "chest_s_033",
    "head": "head_s_035",
    "upper_l": "L_shoulder_s_044",
    "elbow_l": "L_elbow_s_045",
    "forearm_l": "L_forearm_twist_s_046",
    "hand_l": "L_wrist_s_047",
    "upper_r": "R_shoulder_s_061",
    "elbow_r": "R_elbow_s_062",
    "forearm_r": "R_forearm_twist_s_063",
    "hand_r": "R_wrist_s_064",
    "thigh_l": "L_upperLeg_s_03",
    "shin_l": "L_lowerLeg_s_04",
    "foot_l": "L_ankle_s_05",
    "toe_l": "L_toes_s_06",
    "thigh_r": "R_upperLeg_s_07",
    "shin_r": "R_lowerLeg_s_08",
    "foot_r": "R_ankle_s_09",
    "toe_r": "R_toes_s_010",
}

# Mandy's rig exposes two phalanges per finger.  Keep them in the authored
# clips instead of relying on the source file's incidental rest pose: every
# clip therefore carries an explicit closed-fist/grip state.  The prompt does
# not prescribe a separate finger axis, so the rig's local X bend is used.
FINGER_BONES = {
    "l": (
        "L_index_01_s_050",
        "L_index_02_s_051",
        "L_middle_01_s_048",
        "L_middle_02_s_049",
        "L_ring_01_s_054",
        "L_ring_02_s_055",
        "L_pinky_01_s_056",
        "L_pinky_02_s_057",
        "L_thumb_01_s_052",
        "L_thumb_02_s_053",
    ),
    "r": (
        "R_index_01_s_067",
        "R_index_02_s_068",
        "R_middle_01_s_065",
        "R_middle_02_s_066",
        "R_ring_01_s_071",
        "R_ring_02_s_072",
        "R_pinky_01_s_073",
        "R_pinky_02_s_074",
        "R_thumb_01_s_069",
        "R_thumb_02_s_070",
    ),
}


def p(**changes):
    """Create one semantic pose from the rest/idle baseline."""

    result = {"root_z": 0.0, "finger_grip": (0.0, 0.0)}
    result.update(changes)
    return result


def idle_poses():
    idle = p(
        # Right hand is the weapon hand; left hand stays naturally on the belt.
        # Start from the source right-arm correction (which removes its
        # behind-the-body rest pose), then add only a small forward reach.
        upper_r=(47.5, -7.3, -32.5),
        elbow_r=(76.5, -5.3, 0),
        hand_r=(-11.3, 5.3, 8),
        upper_l=(0, 0, 0),
        elbow_l=(0, 0, 0),
        hand_l=(0, 0, 0),
        thigh_l=(0, 0, 0),
        thigh_r=(0, 0, 0),
    )
    return {
        0: idle,
        30: {
            **idle,
            "spine": (2, 0, -3),
        },
        60: {
            **idle,
            "spine": (-1, 0, 3),
        },
        90: {
            **idle,
            "spine": (0, 0, 0),
        },
    }


def run_poses():
    return {
        0: p(
            spine=(15, 0, 0),
            head=(-5, 0, 0),
            thigh_r=(30, 0, 0),
            shin_r=(-15, 0, 0),
            thigh_l=(-25, 0, 0),
            shin_l=(10, 0, 0),
            foot_l=(20, 0, 0),
            foot_r=(0, 0, 0),
            upper_l=(50, 0, 0),
            elbow_l=(120, 0, 0),
            hand_l=(-30, 0, 0),
            upper_r=(45, 0, 0),
            elbow_r=(120, 0, 0),
            hand_r=(-30, 0, 0),
        ),
        5: p(
            spine=(15, 0, 0),
            head=(-5, 0, 0),
            thigh_r=(60, 0, 0),
            shin_r=(-40, 0, 0),
            thigh_l=(0, 0, 0),
            shin_l=(-5, 0, 0),
            foot_l=(0, 0, 0),
            foot_r=(0, 0, 0),
            upper_l=(80, 0, 0),
            elbow_l=(120, 0, 0),
            hand_l=(-30, 0, 0),
            upper_r=(-30, 0, 0),
            elbow_r=(120, 0, 0),
            hand_r=(-30, 0, 0),
        ),
        10: p(
            spine=(15, 0, 0),
            head=(-5, 0, 0),
            thigh_l=(30, 0, 0),
            shin_l=(-15, 0, 0),
            thigh_r=(-25, 0, 0),
            shin_r=(10, 0, 0),
            foot_l=(0, 0, 0),
            foot_r=(20, 0, 0),
            upper_l=(45, 0, 0),
            elbow_l=(120, 0, 0),
            hand_l=(-30, 0, 0),
            upper_r=(50, 0, 0),
            elbow_r=(120, 0, 0),
            hand_r=(-30, 0, 0),
        ),
        15: p(
            spine=(15, 0, 0),
            head=(-5, 0, 0),
            thigh_l=(0, 0, 0),
            shin_l=(-5, 0, 0),
            thigh_r=(70, 0, 0),
            shin_r=(-40, 0, 0),
            foot_l=(0, 0, 0),
            foot_r=(0, 0, 0),
            upper_l=(80, 0, 0),
            elbow_l=(120, 0, 0),
            hand_l=(-30, 0, 0),
            upper_r=(-30, 0, 0),
            elbow_r=(120, 0, 0),
            hand_r=(-30, 0, 0),
        ),
        20: p(
            spine=(15, 0, 0),
            head=(-5, 0, 0),
            thigh_r=(30, 0, 0),
            shin_r=(-15, 0, 0),
            thigh_l=(-25, 0, 0),
            shin_l=(10, 0, 0),
            foot_l=(20, 0, 0),
            foot_r=(0, 0, 0),
            upper_l=(50, 0, 0),
            elbow_l=(120, 0, 0),
            hand_l=(-30, 0, 0),
            upper_r=(45, 0, 0),
            elbow_r=(120, 0, 0),
            hand_r=(-30, 0, 0),
        ),
    }


def attack_poses():
    return {
        0: idle_poses()[0],
        3: p(
            spine=(0, 50, 0),
            head=(-3, 30, 0),
            upper_l=(90, 0, 0),
            elbow_l=(70, 0, 0),
            hand_l=(-10, 0, 0),
            upper_r=(120, 0, 0),
            elbow_r=(70, 0, 0),
            hand_r=(-10, 0, 0),
        ),
        # Fast FK lunge: only thigh/shin add the foot slide; Foot location is untouched.
        6: p(
            spine=(0, -60, 0),
            head=(-3, -20, 0),
            upper_l=(40, 0, 0),
            elbow_l=(150, 0, 0),
            hand_l=(-5, 0, -5),
            upper_r=(70, 0, 0),
            elbow_r=(170, 0, 0),
            hand_r=(-5, 0, 0),
            thigh_l=(15, 0, 0),
            shin_l=(5, 0, 0),
        ),
        10: p(
            spine=(0, 0, 0),
            head=(-3, 0, 0),
            upper_l=(0, -15, 0),
            elbow_l=(90, 0, 0),
            hand_l=(-30, 0, 0),
            upper_r=(10, 5, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-15, 0, 10),
            thigh_l=(0, 0, 0),
        ),
        16: idle_poses()[0],
    }


def super_poses():
    return {
        0: idle_poses()[0],
        10: p(
            root_z=-0.20,
            spine=(25, 0, 0),
            head=(15, 0, 0),
            upper_l=(30, 0, 0),
            elbow_l=(150, 0, 0),
            hand_l=(-10, 0, 0),
            upper_r=(30, 0, 0),
            elbow_r=(150, 0, 0),
            hand_r=(-10, 0, 0),
            thigh_l=(15, 0, 0),
            thigh_r=(15, 0, 0),
        ),
        20: p(
            root_z=0.20,
            spine=(-10, 0, 0),
            head=(-10, 0, 0),
            upper_l=(160, 0, 0),
            elbow_l=(70, 0, 0),
            hand_l=(-5, 0, 0),
            upper_r=(160, 0, 0),
            elbow_r=(70, 0, 0),
            hand_r=(-5, 0, 0),
        ),
        30: p(
            root_z=0.0,
            spine=(35, 0, 0),
            head=(15, 0, 0),
            upper_l=(90, 0, 0),
            elbow_l=(170, 0, 0),
            hand_l=(0, 0, -10),
            upper_r=(80, 0, 0),
            elbow_r=(170, 0, 0),
            hand_r=(0, 0, 0),
            thigh_l=(15, 0, 0),
            thigh_r=(15, 0, 0),
        ),
        40: p(
            root_z=0.0,
            spine=(35, 0, 0),
            head=(15, 0, 0),
            upper_l=(90, 0, 0),
            elbow_l=(170, 0, 0),
            hand_l=(0, 0, -10),
            upper_r=(80, 0, 0),
            elbow_r=(170, 0, 0),
            hand_r=(0, 0, 0),
            thigh_l=(15, 0, 0),
            thigh_r=(15, 0, 0),
        ),
        50: idle_poses()[0],
    }


def aim_poses():
    return {
        0: p(
            thigh_l=(-15, 0, 0),
            thigh_r=(-15, 0, 0),
            spine=(10, 0, 0),
            upper_l=(60, 0, 0),
            elbow_l=(90, 0, 0),
            hand_l=(-15, 0, 0),
            upper_r=(80, 0, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-15, 0, 0),
        ),
        30: p(
            thigh_l=(-15, 0, 0),
            thigh_r=(-15, 0, 0),
            spine=(12, 0, 0),
            upper_l=(58, 0, 0),
            elbow_l=(90, 0, 0),
            hand_l=(-13, 0, 0),
            upper_r=(78, 0, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-13, 0, 0),
        ),
        60: p(
            thigh_l=(-15, 0, 0),
            thigh_r=(-15, 0, 0),
            spine=(10, 0, 0),
            upper_l=(60, 0, 0),
            elbow_l=(90, 0, 0),
            hand_l=(-15, 0, 0),
            upper_r=(80, 0, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-15, 0, 0),
        ),
    }


def aim_super_poses():
    return {
        0: p(
            root_z=-0.20,
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            spine=(30, 0, 0),
            head=(20, 0, 0),
            upper_l=(30, 0, 0),
            elbow_l=(160, 0, 0),
            hand_l=(-5, 0, 0),
            upper_r=(30, 0, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-5, 0, 0),
        ),
        30: p(
            root_z=-0.20,
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            spine=(32, 0, 0),
            head=(20, 0, 0),
            upper_l=(32, 0, 0),
            elbow_l=(160, 0, 0),
            hand_l=(-3, 0, 2),
            upper_r=(32, 0, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-3, 0, -2),
        ),
        60: p(
            root_z=-0.20,
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            spine=(30, 0, 0),
            head=(20, 0, 0),
            upper_l=(30, 0, 0),
            elbow_l=(160, 0, 0),
            hand_l=(-5, 0, 0),
            upper_r=(30, 0, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-5, 0, 0),
        ),
    }


def hit_poses():
    return {
        0: idle_poses()[0],
        3: p(
            spine=(-20, 0, 0),
            head=(-15, 0, 0),
            upper_l=(50, 0, 0),
            elbow_l=(130, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(-40, 0, 0),
            elbow_r=(100, 0, 0),
            hand_r=(0, 0, 0),
        ),
        7: p(
            spine=(-22, 0, 0),
            head=(-15, 0, 0),
            upper_l=(50, 0, 0),
            elbow_l=(130, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(-40, 0, 0),
            elbow_r=(100, 0, 0),
            hand_r=(0, 0, 0),
        ),
        10: p(spine=(-5, 0, 0), head=(-5, 0, 0)),
        12: idle_poses()[0],
    }


def death_poses():
    return {
        0: idle_poses()[0],
        8: p(
            root_z=-0.20,
            thigh_l=(-40, 0, 0),
            thigh_r=(-40, 0, 0),
            spine=(15, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            upper_r=(30, 0, 0),
            elbow_r=(150, 0, 0),
            hand_r=(-10, 0, 0),
        ),
        15: p(
            root_z=-0.35,
            thigh_l=(-90, 0, 0),
            thigh_r=(-90, 0, 0),
            shin_l=(90, 0, 0),
            shin_r=(90, 0, 0),
            spine=(40, 0, 0),
            head=(30, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(60, 0, 0),
            elbow_r=(140, 0, 0),
            hand_r=(0, 0, 0),
        ),
        25: p(
            root_z=-0.35,
            thigh_l=(-90, 0, 0),
            thigh_r=(-90, 0, 0),
            shin_l=(90, 0, 0),
            shin_r=(90, 0, 0),
            spine=(40, 0, 0),
            head=(30, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(60, 0, 0),
            elbow_r=(140, 0, 0),
            hand_r=(0, 0, 0),
        ),
        40: p(
            root_z=-0.35,
            thigh_l=(-90, 0, 0),
            thigh_r=(-90, 0, 0),
            shin_l=(90, 0, 0),
            shin_r=(90, 0, 0),
            spine=(40, 0, 0),
            head=(30, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(60, 0, 0),
            elbow_r=(140, 0, 0),
            hand_r=(0, 0, 0),
        ),
    }


def spawn_poses():
    return {
        0: p(
            root_z=-0.30,
            spine=(50, 0, 0),
            head=(30, 0, 0),
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            upper_l=(0, 20, 0),
            upper_r=(0, -20, 0),
            elbow_l=(60, 0, 0),
            elbow_r=(60, 0, 0),
        ),
        10: p(
            root_z=-0.15,
            spine=(30, 0, 0),
            thigh_l=(-35, 0, 0),
            thigh_r=(-35, 0, 0),
            upper_l=(10, 12, 0),
            upper_r=(10, -12, 0),
            elbow_l=(70, 0, 0),
            elbow_r=(70, 0, 0),
        ),
        20: p(
            root_z=0.0,
            spine=(10, 0, 0),
            upper_r=(10, 5, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-15, 0, 10),
            upper_l=(0, -15, 0),
            elbow_l=(90, 0, 0),
            hand_l=(-30, 0, 0),
        ),
        45: idle_poses()[0],
    }


def victory_poses():
    return {
        0: idle_poses()[0],
        8: p(
            upper_r=(160, 0, 0),
            elbow_r=(60, 0, 0),
            forearm_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        10: p(
            upper_r=(150, 0, 0),
            elbow_r=(60, 0, 0),
            forearm_r=(0, 0, 0),
            hand_r=(0, 0, 0),
            spine=(0, 0, 0),
        ),
        15: p(
            upper_r=(150, 0, 0),
            elbow_r=(60, 0, 0),
            forearm_r=(0, 0, 0),
            hand_r=(0, 0, 540),
            spine=(5, 0, 0),
        ),
        20: p(
            upper_r=(150, 0, 0),
            elbow_r=(60, 0, 0),
            forearm_r=(0, 0, 0),
            hand_r=(0, 0, 1080),
            upper_l=(130, 0, 0),
            elbow_l=(90, 0, 0),
            spine=(-5, 0, 0),
        ),
        25: p(
            upper_r=(150, 0, 0),
            elbow_r=(60, 0, 0),
            forearm_r=(0, 0, 0),
            hand_r=(0, 0, 1080),
            upper_l=(130, 0, 0),
            elbow_l=(90, 0, 0),
            spine=(0, 0, 0),
        ),
        30: p(
            root_z=0.15,
            spine=(0, 0, 0),
            upper_l=(100, 0, 0),
            elbow_l=(90, 0, 0),
            upper_r=(100, 0, 0),
            elbow_r=(90, 0, 0),
            forearm_l=(0, 0, 0),
            forearm_r=(0, 0, 0),
            hand_l=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        35: p(
            root_z=0.0,
            spine=(40, 0, 0),
            upper_l=(80, 0, 0),
            elbow_l=(170, 0, 0),
            upper_r=(90, 0, 0),
            elbow_r=(170, 0, 0),
            thigh_l=(20, 0, 0),
            thigh_r=(20, 0, 0),
            forearm_l=(0, 0, 0),
            forearm_r=(0, 0, 0),
        ),
        40: p(
            root_z=0.0,
            spine=(0, 0, 0),
            head=(-10, 0, 0),
            upper_r=(10, 5, 0),
            elbow_r=(160, 0, 0),
            hand_r=(-15, 0, 10),
            upper_l=(0, -15, 0),
            elbow_l=(90, 0, 0),
            hand_l=(-30, 0, 0),
            forearm_l=(0, 0, 0),
            forearm_r=(0, 0, 0),
        ),
        60: idle_poses()[0],
    }


def gadget_poses():
    return {
        0: idle_poses()[0],
        4: p(
            root_z=-0.20,
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            spine=(15, 0, 0),
            upper_l=(40, 0, 0),
            elbow_l=(150, 0, 0),
            upper_r=(50, 0, 0),
            elbow_r=(150, 0, 0),
        ),
        10: p(
            root_z=-0.20,
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            spine=(15, 0, 0),
            upper_l=(40, 0, 0),
            elbow_l=(150, 0, 0),
            upper_r=(50, 0, 0),
            elbow_r=(150, 0, 0),
        ),
        16: p(
            root_z=-0.20,
            thigh_l=(-60, 0, 0),
            thigh_r=(-60, 0, 0),
            spine=(15, 0, 0),
            upper_l=(40, 0, 0),
            elbow_l=(150, 0, 0),
            upper_r=(50, 0, 0),
            elbow_r=(150, 0, 0),
        ),
    }


def aim_gadget_poses():
    return {
        0: p(
            root_z=-0.10,
            thigh_l=(-20, 0, 0),
            thigh_r=(-20, 0, 0),
            spine=(12, 0, 0),
            head=(5, 0, 0),
            upper_l=(60, 0, 0),
            elbow_l=(100, 0, 0),
            upper_r=(70, 0, 0),
            elbow_r=(100, 0, 0),
        ),
        30: p(
            root_z=-0.10,
            thigh_l=(-20, 0, 0),
            thigh_r=(-20, 0, 0),
            spine=(14, 0, 0),
            head=(5, 0, 0),
            upper_l=(62, 0, 0),
            elbow_l=(100, 0, 0),
            upper_r=(72, 0, 0),
            elbow_r=(100, 0, 0),
        ),
        60: p(
            root_z=-0.10,
            thigh_l=(-20, 0, 0),
            thigh_r=(-20, 0, 0),
            spine=(12, 0, 0),
            head=(5, 0, 0),
            upper_l=(60, 0, 0),
            elbow_l=(100, 0, 0),
            upper_r=(70, 0, 0),
            elbow_r=(100, 0, 0),
        ),
    }


POSE_BUILDERS = {
    "idle": idle_poses,
    "run": run_poses,
    "attack": attack_poses,
    "super": super_poses,
    "aim": aim_poses,
    "aim-super": aim_super_poses,
    "hit": hit_poses,
    "death": death_poses,
    "spawn": spawn_poses,
    "victory": victory_poses,
    "gadget": gadget_poses,
    "aim-gadget": aim_gadget_poses,
}


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def radians(values):
    return tuple(math.radians(value) for value in values)


def clear_actions():
    for action in list(bpy.data.actions):
        action.user_clear()
        bpy.data.actions.remove(action)


def capture_baseline(armature):
    baseline = {}
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        baseline[bone.name] = {
            "rotation": bone.rotation_euler.copy(),
            "location": bone.location.copy(),
            "scale": bone.scale.copy(),
        }
    return baseline


def reset_to_baseline(armature, baseline):
    for name, values in baseline.items():
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = values["rotation"]
        bone.location = values["location"]
        bone.scale = values["scale"]


def add_rotation(armature, baseline, semantic, degrees):
    if degrees is None:
        return
    name = BONES[semantic]
    baseline_rotation = baseline[name]["rotation"]
    delta = radians(degrees)
    armature.pose.bones[name].rotation_euler = Euler(
        tuple(base + change for base, change in zip(baseline_rotation, delta)),
        "XYZ",
    )


def apply_semantic_pose(armature, baseline, data):
    reset_to_baseline(armature, baseline)
    root = armature.pose.bones[BONES["root"]]
    root.location.z = baseline[BONES["root"]]["location"].z + float(
        data.get("root_z", 0.0)
    )

    spine = data.get("spine")
    if spine:
        for semantic, factor in (
            ("spine_lower", 0.25),
            ("spine_mid", 0.35),
            ("spine_upper", 0.25),
            ("chest", 0.15),
        ):
            add_rotation(
                armature, baseline, semantic, tuple(value * factor for value in spine)
            )
    for semantic in (
        "head",
        "upper_l",
        "elbow_l",
        "forearm_l",
        "hand_l",
        "upper_r",
        "elbow_r",
        "forearm_r",
        "hand_r",
        "thigh_l",
        "shin_l",
        "foot_l",
        "toe_l",
        "thigh_r",
        "shin_r",
        "foot_r",
        "toe_r",
    ):
        add_rotation(armature, baseline, semantic, data.get(semantic))

    grip = data.get("finger_grip", (60.0, 60.0))
    for side, degrees in zip(("l", "r"), grip):
        for name in FINGER_BONES[side]:
            baseline_rotation = baseline[name]["rotation"]
            bend = radians((float(degrees), 0.0, 0.0))
            armature.pose.bones[name].rotation_euler = Euler(
                tuple(base + change for base, change in zip(baseline_rotation, bend)),
                "XYZ",
            )


def key_pose(armature, action, frame, baseline, data):
    apply_semantic_pose(armature, baseline, data)
    for name in BONES.values():
        bone = armature.pose.bones[name]
        bone.keyframe_insert("location", frame=frame)
        bone.keyframe_insert("rotation_euler", frame=frame)
        bone.keyframe_insert("scale", frame=frame)
    for name in FINGER_BONES["l"] + FINGER_BONES["r"]:
        bone = armature.pose.bones[name]
        bone.keyframe_insert("location", frame=frame)
        bone.keyframe_insert("rotation_euler", frame=frame)
        bone.keyframe_insert("scale", frame=frame)


def smooth_action(action):
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    scene.render.fps = FPS
    # The source master keeps exported geometry in this collection hidden.
    # Focused authoring scenes must be directly inspectable when opened in
    # Blender, so reveal the collection in the scene copy only; the master is
    # opened fresh for every clip and is never saved back over.
    for collection in scene.collection.children:
        if collection.name == "glTF_not_exported":
            collection.hide_viewport = False
            collection.hide_render = False
    duration = FRAME_DURATIONS[clip]
    scene.frame_start = 1
    scene.frame_end = duration
    armature = bpy.data.objects.get("MandyRig")
    if armature is None:
        raise RuntimeError(f"{clip}: expected MandyRig armature")
    required_bones = tuple(BONES.values()) + FINGER_BONES["l"] + FINGER_BONES["r"]
    if any(name not in armature.data.bones for name in required_bones):
        raise RuntimeError(f"{clip}: MandyRig bone mapping changed")

    staff_pivot = bpy.data.objects.get("MandyStaff_SourcePivot")
    staff_marker = bpy.data.objects.get("Grip.Primary.MandyStaff_Attachment")
    staff_mesh = bpy.data.objects.get("MandyStaff_Attachment")
    if staff_pivot is None or staff_marker is None or staff_mesh is None:
        raise RuntimeError(f"{clip}: Mandy staff pivot/marker is missing")
    staff_mesh["grip_bone"] = BONES["hand_r"]
    # The v3 contract makes the right wrist the canonical weapon socket. The
    # source file is treated as a baseline, so normalize both authored sockets
    # in every focused scene before capturing the pose baseline.
    for staff_socket in (staff_pivot, staff_marker):
        staff_socket.parent = armature
        staff_socket.parent_type = "BONE"
        staff_socket.parent_bone = BONES["hand_r"]
        # The marker is a pure socket. Clear the former left-wrist offset so
        # the detached authored-root staff starts at the actual right wrist.
        staff_socket.location = (0.0, 0.0, 0.0)
        staff_socket.rotation_euler = (0.0, 0.0, 0.0)

    source_action = bpy.data.actions.get("Idle")
    armature.animation_data_create()
    armature.animation_data.action = source_action
    scene.frame_set(1)
    baseline = capture_baseline(armature)
    armature.animation_data_clear()
    clear_actions()

    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    poses = copy.deepcopy(POSE_BUILDERS[clip]())
    if min(poses) != 0 or max(poses) != duration:
        raise RuntimeError(f"{clip}: pose frames must cover 0..{duration}")
    # The brief says omitted values retain the previous frame's value. Resolve
    # that carry-forward explicitly before applying each pose; resetting to the
    # source baseline for every key would silently erase thigh/hand/head state.
    previous_pose = {}
    for brief_frame in sorted(poses):
        resolved_pose = copy.deepcopy(previous_pose)
        resolved_pose.update(poses[brief_frame])
        key_pose(armature, action, brief_frame + 1, baseline, resolved_pose)
        previous_pose = resolved_pose
    smooth_action(action)
    scene.frame_set(1)

    scene.name = f"mandy_{clip}"
    scene["hero_slug"] = HERO
    scene["clip_name"] = ACTION_NAMES[clip]
    scene["clip_slug"] = clip
    scene["clip_kind"] = (
        "ability"
        if clip in ABILITY_CLIPS
        else (
            "aim"
            if clip.startswith("aim")
            else ("locomotion" if clip in {"idle", "run"} else "event")
        )
    )
    scene["frame_start"] = 1
    scene["frame_end"] = duration
    scene["keyframe_end"] = duration + 1
    scene["fps"] = FPS
    scene["authoring_status"] = "READY_FOR_REVIEW"
    scene["source_of_truth"] = os.fspath(MASTER.relative_to(ROOT))
    scene["staff_hand"] = BONES["hand_r"]
    scene["root_motion_contract"] = (
        "Root X/Y locked; Root Z only on authored crouch/jump/death/spawn poses"
    )
    scene["foot_motion_contract"] = (
        "FK foot slide allowed only in attack/super/hit; no IK targets"
    )
    scene["skill_event_frames"] = json.dumps(
        SKILL_EVENT_FRAMES.get(clip, {}), sort_keys=True
    )
    scene["cycle_contract"] = (
        "frame 1 equals frame duration + 1" if clip in CYCLE_CLIPS else "one-shot"
    )

    target = SCENES / f"{clip}.blend"
    target.parent.mkdir(parents=True, exist_ok=True)
    for backup in (Path(f"{target}1"), Path(f"{target}@")):
        if backup.exists():
            backup.unlink()
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=True
    )
    curves = action_fcurves(action)
    frames = [point.co[0] for curve in curves for point in curve.keyframe_points]
    return {
        "clip": clip,
        "action": action.name,
        "file": os.fspath(target.relative_to(ROOT)),
        "frame_start": int(min(frames)),
        "frame_end": int(max(frames)),
        "timeline_end": duration,
        "fps": FPS,
        "curves": len(curves),
        "keyframes": sum(len(curve.keyframe_points) for curve in curves),
        "cycle": clip in CYCLE_CLIPS,
        "staff_hand": BONES["hand_r"],
    }


def main():
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    report = [author_clip(clip) for clip in ACTION_NAMES]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps({"hero": HERO, "clips": report}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {"hero": HERO, "scenes": len(report), "report": os.fspath(REPORT)},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
