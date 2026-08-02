"""Author Mandy's twelve focused scenes from the real MandyRig.

The brief uses 0-based frames. Blender keys are written at ``brief + 1``;
cycle closing keys therefore live at ``duration + 1`` while the timeline end
stays at ``duration``.

The source master pose at frame 20 is the neutral baseline. This pass is designed
to preserve the exact source transforms and applies only small local deltas around
that authored pose, so Mandy keeps the natural hand shape and stance already
present in ``mandy.blend``. The staff contract is strict:
``L_wrist_s_047`` is the only weapon hand and the right hand never grips it.
"""

from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler, Vector

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
    "spawn": {"staff_visible": 18},
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

RIGHT_ARM_POSE_FIELDS = (
    "upper_r",
    "elbow_r",
    "forearm_r",
    "hand_r",
)
RIGHT_ARM_NATURAL_DELTAS = {
    # Calibrated against mandy.blend frame 20: the arm comes in front of the
    # torso at waist height, while the wrist and fingers retain their authored
    # relaxed orientation.
    "upper_r": (0.0, -24.0, -38.0),
    "elbow_r": (24.0, 0.0, 0.0),
    "forearm_r": (0.0, 0.0, 0.0),
    # Local Y 180 turns the authored fist inward so the fingers point toward
    # Mandy's torso instead of away from it.
    "hand_r": (0.0, 180.0, 0.0),
}


def p(**changes):
    """Return a complete semantic pose in real bone-local Euler deltas."""

    pose = {
        "root_up": 0.0,
        "hips": (0.0, 0.0, 0.0),
        "torso": (0.0, 0.0, 0.0),
        "head": (0.0, 0.0, 0.0),
        "upper_l": (0.0, 0.0, 0.0),
        "elbow_l": (0.0, 0.0, 0.0),
        "forearm_l": (0.0, 0.0, 0.0),
        "hand_l": (0.0, 0.0, 0.0),
        "upper_r": (0.0, 0.0, 0.0),
        "elbow_r": (0.0, 0.0, 0.0),
        "forearm_r": (0.0, 0.0, 0.0),
        "hand_r": (0.0, 0.0, 0.0),
        "thigh_l": (0.0, 0.0, 0.0),
        "shin_l": (0.0, 0.0, 0.0),
        "foot_l": (0.0, 0.0, 0.0),
        "toe_l": (0.0, 0.0, 0.0),
        "thigh_r": (0.0, 0.0, 0.0),
        "shin_r": (0.0, 0.0, 0.0),
        "foot_r": (0.0, 0.0, 0.0),
        "toe_r": (0.0, 0.0, 0.0),
        "finger_grip": (0.0, 0.0),
    }
    pose.update(changes)
    return pose


def apply_natural_right_arm_pose(poses):
    """Keep the free right arm visible in a natural front-facing pose.

    ``mandy.blend`` supplies the baseline and the authored relaxed wrist/finger
    shape. A small, measured shoulder/elbow correction brings the arm out from
    behind the torso without lifting it; the wrist and fingers stay at their
    exact source rotations on every animation frame.
    """

    for pose in poses.values():
        for field in RIGHT_ARM_POSE_FIELDS:
            pose[field] = RIGHT_ARM_NATURAL_DELTAS[field]
        left_grip, _right_grip = pose["finger_grip"]
        pose["finger_grip"] = (left_grip, 0.0)


def idle_base():
    # Zero arm deltas deliberately preserve the natural source pose. The
    # source frame already has the left fingers wrapped around the staff and a
    # relaxed right fist; an idle pass must not lift either arm artificially.
    return p(
        hips=(-2.0, 0.0, 0.0),
        torso=(3.0, 0.0, 0.0),
        head=(-3.0, 0.0, 0.0),
    )


def idle_poses():
    base = idle_base()
    return {
        0: base,
        30: {
            **base,
            "hips": (2.0, 0.0, -4.0),
            "torso": (3.0, 0.0, -3.0),
            "head": (-1.0, 8.0, 0.0),
        },
        60: {
            **base,
            "hips": (2.0, 0.0, 4.0),
            "torso": (3.0, 0.0, 3.0),
            "head": (-1.0, -8.0, 0.0),
        },
        90: base,
    }


def run_poses():
    left = dict(
        upper_l=(38.0, -5.0, -52.0), elbow_l=(92.0, 0.0, 0.0), hand_l=(-18.0, 0.0, 4.0)
    )
    return {
        0: p(
            hips=(4, 0, 0),
            torso=(8, 0, 0),
            head=(-4, 0, 0),
            **left,
            thigh_l=(32, 0, 0),
            shin_l=(-22, 0, 0),
            foot_l=(12, 0, 0),
            thigh_r=(-26, 0, 0),
            shin_r=(12, 0, 0),
            upper_r=(-28, 0, 0),
            elbow_r=(18, 0, 0),
            hand_r=(8, 0, 0),
        ),
        6: p(
            hips=(4, 0, 0),
            torso=(8, 0, 0),
            head=(-4, 0, 0),
            **left,
            thigh_l=(-22, 0, 0),
            shin_l=(12, 0, 0),
            foot_l=(-5, 0, 0),
            thigh_r=(34, 0, 0),
            shin_r=(-24, 0, 0),
            upper_r=(28, 0, 0),
            elbow_r=(22, 0, 0),
            hand_r=(-8, 0, 0),
        ),
        12: p(
            hips=(4, 0, 0),
            torso=(8, 0, 0),
            head=(-4, 0, 0),
            **left,
            thigh_l=(-26, 0, 0),
            shin_l=(12, 0, 0),
            foot_l=(-5, 0, 0),
            thigh_r=(32, 0, 0),
            shin_r=(-22, 0, 0),
            upper_r=(28, 0, 0),
            elbow_r=(18, 0, 0),
            hand_r=(-8, 0, 0),
        ),
        18: p(
            hips=(4, 0, 0),
            torso=(8, 0, 0),
            head=(-4, 0, 0),
            **left,
            thigh_l=(34, 0, 0),
            shin_l=(-24, 0, 0),
            foot_l=(12, 0, 0),
            thigh_r=(-22, 0, 0),
            shin_r=(12, 0, 0),
            upper_r=(-28, 0, 0),
            elbow_r=(22, 0, 0),
            hand_r=(8, 0, 0),
        ),
        20: p(
            hips=(4, 0, 0),
            torso=(8, 0, 0),
            head=(-4, 0, 0),
            **left,
            thigh_l=(32, 0, 0),
            shin_l=(-22, 0, 0),
            foot_l=(12, 0, 0),
            thigh_r=(-26, 0, 0),
            shin_r=(12, 0, 0),
            upper_r=(-28, 0, 0),
            elbow_r=(18, 0, 0),
            hand_r=(8, 0, 0),
        ),
    }


def attack_poses():
    base = idle_base()
    return {
        0: base,
        3: p(
            hips=(0, 28, 0),
            torso=(5, 18, 0),
            head=(-2, 8, 0),
            upper_l=(118, 0, -42),
            elbow_l=(58, 0, 0),
            hand_l=(-12, 0, 0),
            upper_r=(-38, 0, 26),
            elbow_r=(28, 0, 0),
            hand_r=(12, 0, 0),
        ),
        # Impact: the measured forward direction of MandyRig is local -Y.
        # The old nearly-straight elbow pose left the staff vertical behind
        # the torso.  This pose bends the elbow and turns the upper arm on
        # its real local Z axis so the full staff sweeps horizontally in
        # front of Mandy while the right arm only counterbalances.
        6: p(
            hips=(0, -12, 0),
            torso=(4, -8, 0),
            head=(-2, -4, 0),
            # Local Z +30 keeps the full-size source staff horizontal in front
            # of the torso at impact; the old near-straight pose left it behind.
            # forward metric even though the wrist was correctly attached.
            upper_l=(30, 0, 30),
            elbow_l=(112, 0, 0),
            hand_l=(-8, 0, -4),
            upper_r=(28, 0, 20),
            elbow_r=(70, 0, 0),
            hand_r=(4, 0, 0),
        ),
        10: p(
            hips=(0, -10, 0),
            torso=(2, -5, 0),
            head=(-2, -2, 0),
            upper_l=(22, 0, -10),
            elbow_l=(110, 0, 0),
            hand_l=(-16, 0, 0),
            upper_r=(12, 0, 24),
            elbow_r=(76, 0, 0),
            hand_r=(-14, 0, 0),
        ),
        16: base,
    }


def super_poses():
    base = idle_base()
    return {
        0: base,
        10: p(
            root_up=-0.20,
            hips=(-6, 0, 0),
            torso=(10, 0, 0),
            head=(2, 0, 0),
            thigh_l=(-34, 0, 0),
            shin_l=(54, 0, 0),
            thigh_r=(-34, 0, 0),
            shin_r=(54, 0, 0),
            # The charge keeps the staff planted instead of lifting it into
            # the face; the source hand/socket pose already points it down.
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(-18, 0, 30),
            elbow_r=(28, 0, 0),
            hand_r=(8, 0, 0),
        ),
        20: p(
            root_up=0.25,
            hips=(4, 0, 0),
            torso=(-8, 0, 0),
            head=(-4, 0, 0),
            thigh_l=(28, 0, 0),
            shin_l=(-18, 0, 0),
            thigh_r=(28, 0, 0),
            shin_r=(-18, 0, 0),
            # Local Z +42 is the measured forward-facing overhead variant;
            # the old -18 value put the full-size staff behind the head.
            upper_l=(148, 0, 42),
            elbow_l=(58, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(18, 0, 34),
            elbow_r=(34, 0, 0),
            hand_r=(8, 0, 0),
        ),
        30: p(
            hips=(-4, 0, 0),
            torso=(10, 0, 0),
            head=(4, 0, 0),
            thigh_l=(-18, 0, 0),
            shin_l=(36, 0, 0),
            thigh_r=(-18, 0, 0),
            shin_r=(36, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(36, 0, 28),
            elbow_r=(48, 0, 0),
            hand_r=(8, 0, 0),
        ),
        40: p(
            hips=(-4, 0, 0),
            torso=(8, 0, 0),
            head=(3, 0, 0),
            thigh_l=(-18, 0, 0),
            shin_l=(36, 0, 0),
            thigh_r=(-18, 0, 0),
            shin_r=(36, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(20, 0, 24),
            elbow_r=(70, 0, 0),
            hand_r=(-8, 0, 0),
        ),
        50: base,
    }


def aim_poses():
    pose = p(
        hips=(-3, 0, 0),
        torso=(8, 0, 0),
        head=(-2, 0, 0),
        # Aim uses the same calibrated forward horizontal grip as Attack's
        # impact/recovery, not the old near-straight pose that pointed down.
        upper_l=(22, 0, -10),
        elbow_l=(110, 0, 0),
        hand_l=(-14, 0, 0),
        upper_r=(-92, 0, 72),
        elbow_r=(30, 0, 0),
        hand_r=(24, 0, 0),
    )
    return {0: pose, 30: {**pose, "torso": (10, 0, 0), "hand_l": (-14, 0, 2)}, 60: pose}


def aim_super_poses():
    pose = p(
        root_up=-0.16,
        hips=(-8, 0, 0),
        torso=(10, 0, 0),
        head=(4, 0, 0),
        thigh_l=(-52, 0, 0),
        shin_l=(70, 0, 0),
        thigh_r=(-52, 0, 0),
        shin_r=(70, 0, 0),
        upper_l=(0, 0, 0),
        elbow_l=(0, 0, 0),
        hand_l=(0, 0, 0),
        upper_r=(6, 0, 34),
        elbow_r=(34, 0, 0),
        hand_r=(8, 0, 0),
    )
    return {0: pose, 30: {**pose, "torso": (12, 0, 0), "hand_l": (-2, 0, 2)}, 60: pose}


def hit_poses():
    base = idle_base()
    return {
        0: base,
        3: p(
            hips=(0, 0, -4),
            torso=(-10, 0, -4),
            head=(-8, 0, 0),
            upper_l=(-28, 0, -20),
            elbow_l=(108, 0, 0),
            hand_l=(8, 0, 0),
            upper_r=(0, 0, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        7: p(
            hips=(0, 0, -4),
            torso=(-12, 0, -5),
            head=(-8, 0, 0),
            upper_l=(-38, 0, -24),
            elbow_l=(116, 0, 0),
            hand_l=(10, 0, 0),
            upper_r=(0, 0, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        10: p(
            torso=(-4, 0, -2),
            head=(-3, 0, 0),
            upper_r=(0, 0, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        12: base,
    }


def death_poses():
    return {
        0: idle_base(),
        8: p(
            root_up=-0.12,
            hips=(-8, 0, 0),
            torso=(8, 0, 0),
            head=(6, 0, 0),
            thigh_l=(-42, 0, 0),
            shin_l=(58, 0, 0),
            thigh_r=(-42, 0, 0),
            shin_r=(58, 0, 0),
            # Lay the staff forward on the ground while the body settles.
            upper_l=(-60, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(28, 0, 18),
            elbow_r=(118, 0, 0),
            hand_r=(12, 0, 0),
            finger_grip=(0, 0),
        ),
        15: p(
            root_up=-0.30,
            hips=(-10, 0, 0),
            torso=(12, 0, 0),
            head=(10, 0, 0),
            thigh_l=(-72, 0, 0),
            shin_l=(96, 0, 0),
            thigh_r=(-72, 0, 0),
            shin_r=(96, 0, 0),
            upper_l=(-60, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(42, 0, 18),
            elbow_r=(80, 0, 0),
            hand_r=(22, 0, 0),
            finger_grip=(0, 0),
        ),
        25: p(
            root_up=-0.30,
            hips=(-10, 0, 0),
            torso=(12, 0, 0),
            head=(10, 0, 0),
            thigh_l=(-72, 0, 0),
            shin_l=(96, 0, 0),
            thigh_r=(-72, 0, 0),
            shin_r=(96, 0, 0),
            upper_l=(-60, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(12, 0, 18),
            elbow_r=(20, 0, 0),
            hand_r=(30, 0, 0),
            finger_grip=(0, 0),
        ),
        40: p(
            root_up=-0.30,
            hips=(-10, 0, 0),
            torso=(12, 0, 0),
            head=(10, 0, 0),
            thigh_l=(-72, 0, 0),
            shin_l=(96, 0, 0),
            thigh_r=(-72, 0, 0),
            shin_r=(96, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(12, 0, 18),
            elbow_r=(20, 0, 0),
            hand_r=(30, 0, 0),
            finger_grip=(0, 0),
        ),
    }


def spawn_poses():
    return {
        0: p(
            root_up=-0.24,
            hips=(-10, 0, 0),
            torso=(12, 0, 0),
            head=(8, 0, 0),
            thigh_l=(-58, 0, 0),
            shin_l=(72, 0, 0),
            thigh_r=(-58, 0, 0),
            shin_r=(72, 0, 0),
            upper_l=(8, 20, -10),
            elbow_l=(62, 0, 0),
            upper_r=(0, 0, 0),
            elbow_r=(0, 0, 0),
        ),
        10: p(
            root_up=-0.10,
            hips=(-6, 0, 0),
            torso=(10, 0, 0),
            head=(5, 0, 0),
            thigh_l=(-38, 0, 0),
            shin_l=(50, 0, 0),
            thigh_r=(-38, 0, 0),
            shin_r=(50, 0, 0),
            upper_l=(18, 12, -14),
            elbow_l=(72, 0, 0),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
        ),
        18: p(
            root_up=0.0,
            hips=(-2, 0, 0),
            torso=(6, 0, 0),
            head=(2, 0, 0),
            upper_l=(62, 0, -18),
            elbow_l=(110, 0, 0),
            hand_l=(-12, 0, 0),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        45: idle_base(),
    }


def victory_poses():
    base = idle_base()
    return {
        0: base,
        10: p(
            upper_l=(148, 0, 42),
            elbow_l=(62, 0, 0),
            hand_l=(-8, 0, 0),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        15: p(
            upper_l=(148, 0, 42),
            elbow_l=(62, 0, 0),
            hand_l=(-8, 0, 360),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        20: p(
            upper_l=(148, 0, 42),
            elbow_l=(62, 0, 0),
            hand_l=(-8, 0, 720),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        25: p(
            root_up=0.15,
            hips=(3, 0, 0),
            torso=(6, 0, 0),
            head=(-4, 0, 0),
            # Rotate around the authored left-hand junction so the full
            # staff points down to the strike point without moving the
            # fingers off the white/orange grip seam.
            upper_l=(-60, 0, 120),
            elbow_l=(0, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        30: p(
            hips=(-2, 0, 0),
            torso=(10, 0, 0),
            head=(4, 0, 0),
            thigh_l=(-18, 0, 0),
            shin_l=(36, 0, 0),
            thigh_r=(-18, 0, 0),
            shin_r=(36, 0, 0),
            upper_l=(-60, 0, 120),
            elbow_l=(0, 0, 0),
            hand_l=(-4, 0, 0),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        40: p(
            hips=(2, 0, 0),
            torso=(6, 0, 0),
            head=(-6, 0, 0),
            upper_l=(24, 0, -8),
            elbow_l=(110, 0, 0),
            hand_l=(-14, 0, 0),
            upper_r=(0, -140, 0),
            elbow_r=(0, 0, 0),
            hand_r=(0, 0, 0),
        ),
        60: base,
    }


def gadget_poses():
    return {
        0: idle_base(),
        4: p(
            root_up=-0.16,
            hips=(-8, 0, 0),
            torso=(10, 0, 0),
            thigh_l=(-40, 0, 0),
            shin_l=(58, 0, 0),
            thigh_r=(-40, 0, 0),
            shin_r=(58, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(-28, 0, 30),
            elbow_r=(28, 0, 0),
            hand_r=(8, 0, 0),
        ),
        10: p(
            root_up=-0.16,
            hips=(-8, 0, 0),
            torso=(10, 0, 0),
            thigh_l=(-40, 0, 0),
            shin_l=(58, 0, 0),
            thigh_r=(-40, 0, 0),
            shin_r=(58, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(-28, 0, 30),
            elbow_r=(28, 0, 0),
            hand_r=(8, 0, 0),
        ),
        16: p(
            root_up=-0.16,
            hips=(-8, 0, 0),
            torso=(10, 0, 0),
            thigh_l=(-40, 0, 0),
            shin_l=(58, 0, 0),
            thigh_r=(-40, 0, 0),
            shin_r=(58, 0, 0),
            upper_l=(0, 0, 0),
            elbow_l=(0, 0, 0),
            hand_l=(0, 0, 0),
            upper_r=(-28, 0, 30),
            elbow_r=(28, 0, 0),
            hand_r=(8, 0, 0),
        ),
    }


def aim_gadget_poses():
    pose = p(
        root_up=-0.08,
        hips=(-5, 0, 0),
        torso=(10, 0, 0),
        head=(3, 0, 0),
        thigh_l=(-30, 0, 0),
        shin_l=(44, 0, 0),
        thigh_r=(-30, 0, 0),
        shin_r=(44, 0, 0),
        # AimGadget is low, but the staff must still be horizontal and
        # readable in front of Mandy rather than vertical at her side.
        upper_l=(22, 0, -10),
        elbow_l=(110, 0, 0),
        hand_l=(-14, 0, 0),
        upper_r=(8, 0, 30),
        elbow_r=(32, 0, 0),
        hand_r=(10, 0, 0),
    )
    return {0: pose, 30: {**pose, "torso": (12, 0, 0), "hand_l": (-6, 0, 2)}, 60: pose}


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
    return [
        curve
        for layer in action.layers
        for strip in layer.strips
        for bag in getattr(strip, "channelbags", [])
        for curve in bag.fcurves
    ]


def clear_actions():
    for action in list(bpy.data.actions):
        # Some imported legacy actions already report zero users. Calling
        # user_clear() on those makes Blender log an ID user underflow while
        # opening the next source scene.
        if action.users:
            action.user_clear()
        bpy.data.actions.remove(action)


def reset_to_rest(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def capture_baseline(armature):
    return {
        bone.name: {
            "rotation": bone.rotation_euler.copy(),
            "location": bone.location.copy(),
            "scale": bone.scale.copy(),
        }
        for bone in armature.pose.bones
    }


def add_rotation(armature, baseline, semantic, degrees):
    if degrees is None:
        return
    name = BONES[semantic]
    base = baseline[name]["rotation"]
    delta = tuple(math.radians(value) for value in degrees)
    armature.pose.bones[name].rotation_euler = Euler(
        tuple(a + b for a, b in zip(base, delta)), "XYZ"
    )


def apply_semantic_pose(armature, baseline, data):
    for name, values in baseline.items():
        bone = armature.pose.bones[name]
        bone.rotation_euler = values["rotation"]
        bone.location = values["location"]
        bone.scale = values["scale"]

    # Root_2_01 bone-local Y is Blender world-up in the measured Mandy rig.
    root = armature.pose.bones[BONES["root"]]
    root.location.y = baseline[BONES["root"]]["location"].y + float(data["root_up"])
    add_rotation(armature, baseline, "hips", data["hips"])
    torso = data["torso"]
    for semantic, factor in (
        ("spine_lower", 0.20),
        ("spine_mid", 0.30),
        ("spine_upper", 0.30),
        ("chest", 0.20),
    ):
        add_rotation(
            armature, baseline, semantic, tuple(value * factor for value in torso)
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
        add_rotation(armature, baseline, semantic, data[semantic])
    for side, degrees in zip(("l", "r"), data["finger_grip"]):
        for name in FINGER_BONES[side]:
            base = baseline[name]["rotation"]
            armature.pose.bones[name].rotation_euler = Euler(
                (base.x + math.radians(float(degrees)), base.y, base.z), "XYZ"
            )


def key_pose(armature, action, frame, baseline, data):
    apply_semantic_pose(armature, baseline, data)
    for bone in armature.pose.bones:
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


def canonicalize_staff(armature):
    pivot = bpy.data.objects.get("MandyStaff_SourcePivot")
    marker = bpy.data.objects.get("Grip.Primary.MandyStaff_Attachment")
    staff = bpy.data.objects.get("MandyStaff_Attachment")
    if not pivot or not marker or not staff:
        raise RuntimeError("Mandy staff pivot/marker/mesh is missing")
    # mandy.blend already contains the authored hand-to-weapon relationship:
    # the source pivot sits at the junction between the white ball/shaft and
    # the orange handle. Keep that pivot fixed and rotate only around it; the
    # former canonicalization moved the mesh along its long axis to meet the
    # floor, which put the fingers on the blue shaft instead of at the
    # authored grip junction.
    for socket in (pivot, marker):
        world_matrix = socket.matrix_world.copy()
        socket.parent = armature
        socket.parent_type = "BONE"
        socket.parent_bone = BONES["hand_l"]
        socket.matrix_world = world_matrix
    # The source staff's positive local Z points almost horizontally. Match
    # Mandy's authored silhouette: the long body leaves the white/orange seam
    # diagonally down and forward while the hand/socket position is unchanged.
    current_axis = (
        staff.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))
    ).normalized()
    target_axis = Vector((-0.24, -0.83, -0.50)).normalized()
    world_delta = current_axis.rotation_difference(target_axis)
    parent_rotation = pivot.matrix_world.to_quaternion()
    local_delta = parent_rotation.inverted() @ world_delta @ parent_rotation
    staff.matrix_local = local_delta.to_matrix().to_4x4() @ staff.matrix_local
    bpy.context.view_layer.update()
    staff["attachment_role"] = "held-weapon"
    staff["grip_bone"] = BONES["hand_l"]
    marker["attachment_role"] = "weapon-grip-marker"
    return pivot, marker, staff


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    scene.render.fps = FPS
    for collection in scene.collection.children:
        if collection.name == "glTF_not_exported":
            collection.hide_viewport = False
            collection.hide_render = False
    duration = FRAME_DURATIONS[clip]
    scene.frame_start = 1
    scene.frame_end = duration
    # Frame 20 is the authored neutral pose in mandy.blend. Capture it before
    # writing any new keys; this keeps the existing grip and hand silhouette.
    scene.frame_set(20)
    armature = bpy.data.objects.get("MandyRig")
    if armature is None:
        raise RuntimeError("expected MandyRig")
    required = tuple(BONES.values()) + FINGER_BONES["l"] + FINGER_BONES["r"]
    if any(name not in armature.data.bones for name in required):
        raise RuntimeError("MandyRig bone mapping changed")
    baseline = capture_baseline(armature)
    # Calibrate the prop against the actual authored Idle pose, not the raw
    # rest pose. The left arm is deliberately posed around the staff, so a
    # rest-pose calibration would rotate the prop sideways when Idle is keyed.
    apply_semantic_pose(armature, baseline, idle_base())
    pivot, marker, staff = canonicalize_staff(armature)
    if pivot.parent_bone != BONES["hand_l"] or marker.parent_bone != BONES["hand_l"]:
        raise RuntimeError("staff must be parented to L_wrist_s_047")
    clear_actions()
    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    poses = copy.deepcopy(POSE_BUILDERS[clip]())
    # The full-size source staff occupies more of the silhouette than the
    # earlier reduced prop. Add explicit avoidance keys at the few transition
    # frames where the free right hand could otherwise cross it; left-hand
    # staff motion and the authored body pose remain unchanged.
    if clip == "spawn":
        poses[26] = {
            **poses[18],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[33] = {
            **poses[18],
            "upper_r": (0, -140, 0),
            "elbow_r": (0, 80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[36] = {
            **poses[33],
            "upper_r": (0, -140, 0),
            "elbow_r": (0, 80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[38] = {
            **poses[36],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[40] = {
            **poses[38],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
    elif clip == "victory":
        poses[8] = {
            **poses[10],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -40, 0),
            "hand_r": (0, 0, 0),
        }
        poses[14] = {
            **poses[15],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -40, 0),
            "hand_r": (0, 0, 0),
        }
        poses[6] = {
            **poses[10],
            "upper_r": (0, -80, 0),
            "elbow_r": (0, 40, 0),
            "hand_r": (0, 0, 0),
        }
        poses[5] = {
            **poses[6],
            "upper_r": (0, -120, 0),
            "elbow_r": (0, 40, 0),
            "hand_r": (0, 0, 0),
        }
        poses[13] = {
            **poses[15],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, 0, 0),
            "hand_r": (0, 0, 0),
        }
        poses[39] = {
            **poses[40],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[40] = {
            **poses[40],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[41] = {
            **poses[40],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[46] = {
            **poses[40],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[48] = {
            **poses[46],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[50] = {
            **poses[46],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[52] = {
            **poses[50],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[54] = {
            **poses[52],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[56] = {
            **poses[54],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        poses[58] = {
            **poses[56],
            "upper_r": (0, -180, 0),
            "elbow_r": (0, -80, 0),
            "hand_r": (0, 0, 0),
        }
        # Route the staff around the visible right hand before the ground
        # strike; without this short intermediate arc the tassel clips the
        # free fist at Victory frame 24.
        for frame in (22, 23, 24):
            poses[frame] = {
                **poses[25],
                "upper_l": (-20, 0, 70),
                "elbow_l": (35, 0, 0),
                "hand_l": (-4, 0, 0),
            }
    # The free right arm is intentionally not an animation driver. Restore the
    # calibrated natural front pose after any legacy avoidance keys above; this
    # prevents Spawn/Victory and every in-between from putting the wrist
    # behind Mandy's back.
    apply_natural_right_arm_pose(poses)
    duration_keys = set(poses)
    if min(duration_keys) != 0 or max(duration_keys) != duration:
        raise RuntimeError(f"{clip}: pose frames must cover 0..{duration}")
    for brief_frame in sorted(poses):
        key_pose(armature, action, brief_frame + 1, baseline, poses[brief_frame])
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
    scene["staff_hand"] = BONES["hand_l"]
    scene["right_hand_contact"] = "forbidden"
    scene["loc_up_channel"] = f"pose.bones[\"{BONES['root']}\"].location.y"
    scene["root_motion_contract"] = "Root local X/Z locked; local Y is Loc Up only"
    scene["torso_pitch_budget_degrees"] = 20.0
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
    # Save the generated scene as the active file.  ``copy=True`` makes Blender
    # keep the source file active and, on repeated overwrites, can fail while
    # creating the version-backup ``@`` file on Windows.
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=False
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
        "staff_hand": BONES["hand_l"],
        "root_up_channel": "location.y",
    }


def main():
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    report = [author_clip(clip) for clip in ACTION_NAMES]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(
            {
                "hero": HERO,
                "scenes": report,
                "weapon_hand": BONES["hand_l"],
                "right_hand_contact": "forbidden",
                "loc_up_channel": "Root_2_01.location.y",
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "hero": HERO,
                "scenes": len(report),
                "report": os.fspath(REPORT),
                "weapon_hand": BONES["hand_l"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
