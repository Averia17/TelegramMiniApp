"""Author the production Needle animation pack on the live 14-bone rig.

This script is intentionally Needle-specific.  The source master supplies the
mesh, armature, materials, and rest pose; each focused scene receives exactly
one authored Action with explicit poses at the contract frames.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/author_needle_animation_scenes.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
HERO = "needle"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "needle.blend"
SCENES = MASTER.parent / "scenes"
REPORT = ROOT / "artifacts" / "needle-animation-authoring.json"
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

FRAME_ENDS = {
    "idle": 80,
    "run": 24,
    "attack": 16,
    "super": 50,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 12,
    "aim-gadget": 60,
}

CYCLE_CLIPS = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ABILITY_CLIPS = {"attack", "super", "gadget"}

# This is the actual bind-pose stance in needle.blend, expressed in local
# Euler degrees.  It is deliberately kept here rather than copied from the
# legacy Actions so the new pack has a single, reviewable baseline.
BASE_ROT = {
    "Root": (0.0, 0.0, 0.0),
    # Neutral baseline is critical: this pose is copied into every Action.
    # A non-zero Hips X rotation would permanently lean the whole hero,
    # including idle and the first frame of every one-shot animation.
    "Hips": (0.0, 0.0, 0.0),
    "Spine": (0.0, 0.0, 0.0),
    "Chest": (0.0, 0.0, 0.0),
    "Head": (0.0, 0.0, 0.0),
    "Flower": (0.0, 0.0, 0.0),
    "LeftArm": (0.0, 0.0, 0.0),
    "LeftHand": (0.0, 0.0, 0.0),
    "RightArm": (0.0, 0.0, 0.0),
    "RightHand": (0.0, 0.0, 0.0),
    "LeftLeg": (0.0, 0.0, 0.0),
    "LeftFoot": (0.0, 0.0, 0.0),
    "RightLeg": (0.0, 0.0, 0.0),
    "RightFoot": (0.0, 0.0, 0.0),
}

BONES = tuple(BASE_ROT)


def radians(values):
    return tuple(math.radians(value) for value in values)


def pose(
    *,
    root_y=0.0,
    hips=None,
    spine=None,
    chest=None,
    head=None,
    flower=None,
    left_arm=None,
    left_hand=None,
    right_arm=None,
    right_hand=None,
    left_leg=None,
    left_foot=None,
    right_leg=None,
    right_foot=None,
):
    """Return a complete local pose using BASE_ROT plus explicit overrides."""

    rotations = {name: BASE_ROT[name] for name in BONES}
    overrides = {
        "Hips": hips,
        "Spine": spine,
        "Chest": chest,
        "Head": head,
        "Flower": flower,
        "LeftArm": left_arm,
        "LeftHand": left_hand,
        "RightArm": right_arm,
        "RightHand": right_hand,
        "LeftLeg": left_leg,
        "LeftFoot": left_foot,
        "RightLeg": right_leg,
        "RightFoot": right_foot,
    }
    for name, value in overrides.items():
        if value is not None:
            rotations[name] = value
    return {"root_y": root_y, "rotations": rotations}


def idle_poses():
    return {
        0: pose(
            root_y=-0.02,
            hips=(20, 0, 0),
            spine=(18, 0, 0),
            chest=(4, 0, 0),
            head=(0, 30, 0),
            left_arm=(-20, 0, 18),
            left_hand=(0, 0, -20),
            right_arm=(-120, -90, 0),
            right_hand=(0, 0, 20),
            left_leg=(35, -8, 0),
            right_leg=(35, 8, 0),
            left_foot=(-12, 0, 0),
            right_foot=(-12, 0, 0),
        ),
        20: pose(
            root_y=0.01,
            hips=(16, 12, 0),
            spine=(20, 15, 0),
            chest=(5, 10, 0),
            head=(0, -25, -4),
            left_arm=(5, 0, -16),
            left_hand=(0, 0, 25),
            right_arm=(-105, -105, 0),
            right_hand=(0, 0, -20),
            left_leg=(28, -14, 0),
            right_leg=(42, 12, 0),
            flower=(0, -4, 0),
        ),
        40: pose(
            root_y=-0.03,
            hips=(26, -8, 0),
            spine=(25, -12, 0),
            chest=(8, -8, 0),
            head=(8, 22, 4),
            left_arm=(12, 0, -25),
            left_hand=(0, 0, 35),
            right_arm=(-130, -75, -5),
            right_hand=(0, 0, -35),
            left_leg=(45, -12, 0),
            right_leg=(45, 12, 0),
        ),
        60: pose(
            root_y=0.02,
            hips=(10, 0, 0),
            spine=(5, 0, 0),
            chest=(8, 0, 0),
            head=(0, 10, 0),
            left_arm=(70, 0, -45),
            left_hand=(0, 0, -35),
            right_arm=(-120, -120, 0),
            right_hand=(0, 0, 35),
            left_leg=(20, -6, 0),
            right_leg=(20, 6, 0),
            flower=(0, 3, 0),
        ),
        80: pose(
            root_y=-0.02,
            hips=(20, 0, 0),
            spine=(18, 0, 0),
            chest=(4, 0, 0),
            head=(0, 30, 0),
            left_arm=(-20, 0, 18),
            left_hand=(0, 0, -20),
            right_arm=(-120, -90, 0),
            right_hand=(0, 0, 20),
            left_leg=(35, -8, 0),
            right_leg=(35, 8, 0),
            left_foot=(-12, 0, 0),
            right_foot=(-12, 0, 0),
        ),
    }


def run_poses():  # Needle v2 low, predatory gait
    return {
        0: pose(
            spine=(10, 0, 0),
            head=(0, 2, 0),
            left_arm=(35, 0, -12),
            right_arm=(-145, -12, 32),
            left_leg=(0, -25, 0),
            right_leg=(0, 25, 0),
            left_foot=(4, 0, 0),
            right_foot=(-6, 0, 0),
        ),
        7: pose(
            spine=(10, 0, 0),
            head=(0, 0, 0),
            left_arm=(10, 0, -4),
            right_arm=(-128, -12, 24),
            left_leg=(0, 15, 0),
            right_leg=(0, -15, 0),
            left_foot=(8, 0, 0),
            right_foot=(-8, 0, 0),
        ),
        15: pose(
            spine=(10, 0, 0),
            head=(0, -2, 0),
            left_arm=(145, 0, 32),
            right_arm=(-165, -12, -12),
            left_leg=(0, 25, 0),
            right_leg=(0, -25, 0),
            left_foot=(-6, 0, 0),
            right_foot=(4, 0, 0),
        ),
        22: pose(
            spine=(10, 0, 0),
            head=(0, 0, 0),
            left_arm=(128, 0, 24),
            right_arm=(-10, -12, -4),
            left_leg=(0, -15, 0),
            right_leg=(0, 15, 0),
            left_foot=(-8, 0, 0),
            right_foot=(8, 0, 0),
        ),
        30: pose(
            spine=(10, 0, 0),
            head=(0, 2, 0),
            left_arm=(35, 0, -12),
            right_arm=(-145, -12, 32),
            left_leg=(0, -25, 0),
            right_leg=(0, 25, 0),
            left_foot=(4, 0, 0),
            right_foot=(-6, 0, 0),
        ),
    }


def attack_poses():
    return {
        0: pose(right_arm=(-145, -15, 16), right_hand=(0, 0, 0), head=(0, 0, 0)),
        4: pose(
            spine=(2, 0, 0),
            right_arm=(-120, -90, 0),
            right_hand=(0, -0.08, 0),
            head=(0, 12, 0),
            left_arm=(25, 0, -5),
        ),
        7: pose(
            spine=(3, 0, 0),
            right_arm=(-120, -90, 0),
            right_hand=(0, -0.12, -5),
            head=(0, 20, 0),
            left_arm=(30, 0, -7),
        ),
        12: pose(
            spine=(1, 0, 0),
            right_arm=(-135, -90, 0),
            right_hand=(0, -0.04, 0),
            head=(0, 10, 0),
            left_arm=(15, 0, -3),
        ),
        18: pose(right_arm=(-145, -15, 16), right_hand=(0, 0, 0), head=(0, 0, 0)),
    }


def super_poses():
    return {
        0: pose(),
        10: pose(
            root_y=-0.25,
            hips=(34, 0, 0),
            spine=(25, 0, 0),
            head=(20, 0, 0),
            left_arm=(-10, 0, -28),
            left_hand=(0, -0.06, 0),
            right_arm=(-132, -8, 36),
            right_hand=(0, -0.06, 0),
            left_leg=(48, 0, 0),
            right_leg=(48, 0, 0),
            left_foot=(-22, 0, 0),
            right_foot=(-22, 0, 0),
        ),
        18: pose(
            root_y=-0.25,
            hips=(38, 0, 0),
            spine=(30, 0, 0),
            head=(22, 0, 0),
            left_arm=(-18, 0, -34),
            left_hand=(0, -0.08, 0),
            right_arm=(-138, -8, 42),
            right_hand=(0, -0.08, 0),
            left_leg=(56, 0, 0),
            right_leg=(56, 0, 0),
            left_foot=(-28, 0, 0),
            right_foot=(-28, 0, 0),
        ),
        22: pose(
            root_y=-0.16,
            hips=(32, 0, 0),
            spine=(18, 0, 0),
            head=(10, 0, 0),
            left_arm=(20, 0, -18),
            right_arm=(-150, -8, 32),
            left_leg=(38, 0, 0),
            right_leg=(38, 0, 0),
            left_foot=(-18, 0, 0),
            right_foot=(-18, 0, 0),
        ),
        35: pose(
            hips=(30, 0, 0),
            spine=(3, 0, 0),
            head=(2, 0, 0),
            left_arm=(20, 0, -8),
            right_arm=(-150, -10, 22),
            left_leg=(8, 0, 0),
            right_leg=(8, 0, 0),
        ),
        45: pose(),
    }


def aim_poses():
    return {
        0: pose(
            chest=(0, 0, 20),
            head=(0, 25, 0),
            left_arm=(8, 0, -18),
            left_hand=(0, -0.05, 0),
            right_arm=(-120, -90, 0),
            right_hand=(0, -0.11, 0),
        ),
        30: pose(
            spine=(1, 0, 0),
            chest=(1, 0, 20),
            head=(0, 25, 0),
            left_arm=(8, 0, -18),
            left_hand=(0, -0.05, 0),
            right_arm=(-118, -90, 0),
            right_hand=(0, -0.10, 0),
        ),
        60: pose(
            chest=(0, 0, 20),
            head=(0, 25, 0),
            left_arm=(8, 0, -18),
            left_hand=(0, -0.05, 0),
            right_arm=(-120, -90, 0),
            right_hand=(0, -0.11, 0),
        ),
    }


def aim_super_poses():
    return {
        0: pose(
            hips=(30, 0, 0),
            spine=(15, 0, 0),
            head=(15, 0, 0),
            left_arm=(22, 0, -22),
            left_hand=(0, -0.05, 0),
            right_arm=(-150, -8, 28),
            right_hand=(0, -0.05, 0),
        ),
        30: pose(
            hips=(30, 0, 0),
            spine=(17, 0, 0),
            head=(15, 0, 0),
            left_arm=(25, 0, -22),
            left_hand=(0, -0.05, 0),
            right_arm=(-147, -8, 28),
            right_hand=(0, -0.05, 0),
        ),
        60: pose(
            hips=(30, 0, 0),
            spine=(15, 0, 0),
            head=(15, 0, 0),
            left_arm=(22, 0, -22),
            left_hand=(0, -0.05, 0),
            right_arm=(-150, -8, 28),
            right_hand=(0, -0.05, 0),
        ),
    }


def hit_poses():
    return {
        0: pose(),
        3: pose(
            spine=(-15, 0, 0),
            chest=(-8, 0, 0),
            head=(-15, 0, 0),
            left_arm=(35, 0, -12),
            right_arm=(-150, -8, 28),
            left_hand=(0, 0.04, 0),
            right_hand=(0, 0.04, 0),
            left_leg=(10, 0, 0),
            right_leg=(10, 0, 0),
        ),
        6: pose(
            spine=(-18, 0, 0),
            chest=(-10, 0, 0),
            head=(-17, 0, 0),
            left_arm=(42, 0, -14),
            right_arm=(-145, -8, 30),
            left_hand=(0, 0.05, 0),
            right_hand=(0, 0.05, 0),
            left_leg=(12, 0, 0),
            right_leg=(12, 0, 0),
        ),
        9: pose(
            spine=(-4, 0, 0),
            chest=(-2, 0, 0),
            head=(-4, 0, 0),
            left_arm=(20, 0, -6),
            right_arm=(-145, -10, 22),
            left_leg=(4, 0, 0),
            right_leg=(4, 0, 0),
        ),
        12: pose(),
    }


def death_poses():
    return {
        0: pose(),
        10: pose(
            root_y=-0.10,
            hips=(34, 0, 0),
            spine=(15, 0, 0),
            head=(10, 0, 0),
            left_arm=(25, 0, -10),
            right_arm=(-140, -12, 18),
            left_leg=(35, 0, 0),
            right_leg=(35, 0, 0),
        ),
        20: pose(
            root_y=-0.35,
            hips=(42, 0, 0),
            spine=(40, 0, 0),
            head=(30, 0, 0),
            left_arm=(35, 0, -18),
            right_arm=(-140, -12, 22),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
            left_foot=(-45, 0, 0),
            right_foot=(-45, 0, 0),
        ),
        35: pose(
            root_y=-0.35,
            hips=(42, 0, 0),
            spine=(42, 0, 0),
            head=(30, 0, 0),
            left_arm=(42, 0, -18),
            right_arm=(-145, -12, 22),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
            left_foot=(-48, 0, 0),
            right_foot=(-48, 0, 0),
        ),
        45: pose(
            root_y=-0.35,
            hips=(42, 0, 0),
            spine=(42, 0, 0),
            head=(30, 0, 0),
            left_arm=(42, 0, -18),
            right_arm=(-145, -12, 22),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
            left_foot=(-48, 0, 0),
            right_foot=(-48, 0, 0),
        ),
    }


def spawn_poses():
    return {
        0: pose(
            root_y=-0.30,
            hips=(42, 0, 0),
            spine=(50, 0, 0),
            head=(30, 0, 0),
            left_arm=(30, 0, -28),
            right_arm=(-145, -12, 28),
            left_leg=(65, 0, 0),
            right_leg=(65, 0, 0),
            left_foot=(-38, 0, 0),
            right_foot=(-38, 0, 0),
        ),
        10: pose(
            root_y=-0.15,
            hips=(38, 0, 0),
            spine=(30, 0, 0),
            head=(20, 0, 0),
            left_arm=(28, 0, -18),
            right_arm=(-145, -12, 24),
            left_leg=(45, 0, 0),
            right_leg=(45, 0, 0),
            left_foot=(-22, 0, 0),
            right_foot=(-22, 0, 0),
        ),
        25: pose(
            hips=(32, 0, 0),
            spine=(10, 0, 0),
            head=(7, 0, 0),
            left_arm=(55, 0, -30),
            right_arm=(-165, -8, 38),
            left_leg=(15, 0, 0),
            right_leg=(15, 0, 0),
        ),
        35: pose(left_arm=(45, 0, -20), right_arm=(-155, -10, 30)),
        45: pose(),
    }


def victory_poses():
    return {
        0: pose(),
        15: pose(
            spine=(-5, 0, 0),
            head=(-10, 0, 0),
            left_arm=(75, 0, -70),
            # RightArm is mirrored in the rest pose; this is the actual FK
            # pose that lifts its hand through the side for a clear victory
            # silhouette.
            right_arm=(-120, -120, 0),
            left_hand=(-8, 0, 0),
            right_hand=(-8, 0, 0),
        ),
        30: pose(
            spine=(-6, 0, 0),
            head=(-11, 0, 0),
            left_arm=(90, 0, -78),
            right_arm=(-120, -120, 0),
            left_hand=(-10, 0, 0),
            right_hand=(-10, 0, 0),
            flower=(0, 3, 0),
        ),
        45: pose(
            spine=(-2, 0, 0),
            head=(-4, 0, 0),
            left_arm=(55, 0, -40),
            right_arm=(-150, -120, 30),
            left_hand=(-4, 0, 0),
            right_hand=(-4, 0, 0),
        ),
        60: pose(),
    }


def gadget_poses():
    return {
        0: pose(),
        2: pose(
            hips=(32, 0, 0),
            spine=(20, 0, 0),
            head=(15, 0, 0),
            left_arm=(28, 0, -15),
            right_arm=(-145, -12, 28),
            left_leg=(15, 0, 0),
            right_leg=(15, 0, 0),
        ),
        5: pose(
            hips=(34, 0, 0),
            spine=(25, 0, 0),
            head=(18, 0, 0),
            left_arm=(35, 0, -18),
            right_arm=(-150, -12, 30),
            left_leg=(18, 0, 0),
            right_leg=(18, 0, 0),
        ),
        8: pose(
            hips=(30, 0, 0),
            spine=(8, 0, 0),
            head=(6, 0, 0),
            left_arm=(20, 0, -7),
            right_arm=(-145, -12, 24),
            left_leg=(5, 0, 0),
            right_leg=(5, 0, 0),
        ),
        10: pose(),
    }


def aim_gadget_poses():
    return {
        0: pose(
            root_y=-0.10,
            # A smaller forward pitch keeps this ready stance low without
            # making the stylized body read as falling onto its face.
            hips=(10, 0, 0),
            spine=(12, 0, 0),
            head=(-5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-145, -12, 34),
            left_leg=(30, 0, 0),
            right_leg=(30, 0, 0),
        ),
        30: pose(
            root_y=-0.10,
            hips=(10, 0, 0),
            spine=(14, 0, 0),
            head=(-5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-145, -12, 34),
            left_leg=(30, 0, 0),
            right_leg=(30, 0, 0),
        ),
        60: pose(
            root_y=-0.10,
            hips=(10, 0, 0),
            spine=(12, 0, 0),
            head=(-5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-145, -12, 34),
            left_leg=(30, 0, 0),
            right_leg=(30, 0, 0),
        ),
    }


def v2_idle_poses():
    # Keep the shared entry pose upright.  The aggressive forward pitch belongs
    # to the middle beats of the v2 clips, not to every clip's first frame.
    # Otherwise every animation looks globally tilted when the harness switches
    # actions or cross-fades from one action to another.
    neutral = pose(
        root_y=0.0,
        hips=(0, 0, 0),
        spine=(0, 0, 0),
        chest=(0, 0, 0),
        head=(0, 15, 0),
        left_arm=(-20, 0, 18),
        left_hand=(0, 0, -20),
        right_arm=(-120, -90, 0),
        right_hand=(0, 0, 20),
        left_leg=(35, -8, 0),
        right_leg=(35, 8, 0),
    )
    return {
        0: neutral,
        20: pose(
            root_y=0.01,
            hips=(2, 8, 0),
            spine=(3, 6, 0),
            chest=(1, 3, 0),
            head=(0, -20, -4),
            left_arm=(5, 0, -16),
            left_hand=(0, 0, 25),
            right_arm=(-105, -105, 0),
            right_hand=(0, 0, -20),
            left_leg=(28, -14, 0),
            right_leg=(42, 12, 0),
            flower=(0, -4, 0),
        ),
        40: pose(
            root_y=-0.03,
            hips=(4, -6, 0),
            spine=(5, -8, 0),
            chest=(2, -5, 0),
            head=(5, 18, 4),
            left_arm=(12, 0, -25),
            left_hand=(0, 0, 35),
            right_arm=(-130, -75, -5),
            right_hand=(0, 0, -35),
            left_leg=(45, -12, 0),
            right_leg=(45, 12, 0),
        ),
        60: pose(
            root_y=0.02,
            hips=(2, 0, 0),
            spine=(1, 0, 0),
            chest=(1, 0, 0),
            head=(0, 10, 0),
            left_arm=(70, 0, -45),
            left_hand=(0, 0, -35),
            right_arm=(-120, -120, 0),
            right_hand=(0, 0, 35),
            left_leg=(20, -6, 0),
            right_leg=(20, 6, 0),
            flower=(0, 3, 0),
        ),
        80: neutral,
    }


def v2_run_poses():
    return {
        0: pose(
            root_y=-0.05,
            hips=(35, 0, 0),
            spine=(40, 0, 0),
            head=(5, 0, 0),
            left_arm=(65, 0, -35),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, -25),
            right_hand=(0, 0, 25),
            left_leg=(60, -20, 0),
            right_leg=(25, 20, 0),
            left_foot=(-20, 0, 0),
            right_foot=(8, 0, 0),
        ),
        6: pose(
            hips=(18, 8, 0),
            spine=(35, 8, 0),
            head=(0, -4, 0),
            left_arm=(-30, 0, 20),
            right_arm=(-105, -110, 0),
            left_hand=(0, 0, 30),
            right_hand=(0, 0, -30),
            left_leg=(20, 18, 0),
            right_leg=(70, -18, 0),
            left_foot=(8, 0, 0),
            right_foot=(-30, 0, 0),
        ),
        12: pose(
            root_y=-0.05,
            hips=(35, 0, 0),
            spine=(40, 0, 0),
            head=(5, 0, 0),
            left_arm=(-30, 0, 20),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, 25),
            right_hand=(0, 0, -25),
            left_leg=(25, 20, 0),
            right_leg=(60, -20, 0),
            left_foot=(8, 0, 0),
            right_foot=(-20, 0, 0),
        ),
        18: pose(
            hips=(18, -8, 0),
            spine=(35, -8, 0),
            head=(0, 4, 0),
            left_arm=(65, 0, -35),
            right_arm=(-30, 0, 20),
            left_hand=(0, 0, -25),
            right_hand=(0, 0, 30),
            left_leg=(70, 18, 0),
            right_leg=(20, -18, 0),
            left_foot=(-30, 0, 0),
            right_foot=(8, 0, 0),
        ),
        24: pose(
            root_y=-0.05,
            hips=(35, 0, 0),
            spine=(40, 0, 0),
            head=(5, 0, 0),
            left_arm=(65, 0, -35),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, -25),
            right_hand=(0, 0, 25),
            left_leg=(60, -20, 0),
            right_leg=(25, 20, 0),
            left_foot=(-20, 0, 0),
            right_foot=(8, 0, 0),
        ),
    }


def v2_attack_poses():
    return {
        0: v2_idle_poses()[0],
        3: pose(
            hips=(28, 0, 0),
            spine=(30, 0, 0),
            head=(10, 0, 0),
            right_arm=(-45, -60, 10),
            right_hand=(0, 0, -25),
            left_arm=(-60, 0, 25),
            left_hand=(0, 0, 25),
            left_leg=(45, -8, 0),
            right_leg=(45, 8, 0),
        ),
        6: pose(
            hips=(30, 0, 0),
            spine=(30, 0, 0),
            head=(10, 0, 0),
            right_arm=(-105, -120, 0),
            right_hand=(0, 0, 45),
            left_arm=(-60, 0, 25),
            left_hand=(0, 0, -45),
            left_leg=(40, -8, 0),
            right_leg=(40, 8, 0),
        ),
        10: pose(
            hips=(22, 0, 0),
            spine=(20, 0, 0),
            head=(5, 0, 0),
            right_arm=(-135, -90, 0),
            right_hand=(0, 0, -30),
            left_arm=(-25, 0, 18),
            left_hand=(0, 0, 25),
            left_leg=(35, -8, 0),
            right_leg=(35, 8, 0),
        ),
        16: v2_idle_poses()[0],
    }


def v2_super_poses():
    return {
        0: v2_idle_poses()[0],
        8: pose(
            root_y=-0.30,
            hips=(70, 0, 0),
            spine=(45, 0, 0),
            head=(25, 0, 0),
            left_arm=(15, 0, -35),
            left_hand=(0, 0, -20),
            right_arm=(-135, -90, 0),
            right_hand=(0, 0, 20),
            left_leg=(80, 0, 0),
            right_leg=(80, 0, 0),
            left_foot=(-30, 0, 0),
            right_foot=(-30, 0, 0),
        ),
        12: pose(
            root_y=-0.30,
            hips=(72, 0, 0),
            spine=(48, 0, 0),
            head=(28, 0, 0),
            left_arm=(10, 0, -38),
            right_arm=(-135, -90, 0),
            left_leg=(85, 0, 0),
            right_leg=(85, 0, 0),
            left_foot=(-32, 0, 0),
            right_foot=(-32, 0, 0),
        ),
        16: pose(
            root_y=0.20,
            hips=(-10, 0, 0),
            spine=(-20, 0, 0),
            head=(-15, 0, 0),
            left_arm=(110, 0, -70),
            left_hand=(0, 0, -40),
            right_arm=(-120, -120, 0),
            right_hand=(0, 0, 40),
            left_leg=(-10, -8, 0),
            right_leg=(-10, 8, 0),
        ),
        25: pose(
            hips=(30, 0, 0),
            spine=(20, 0, 0),
            head=(10, 0, 0),
            left_arm=(35, 0, -25),
            right_arm=(-120, -90, 0),
            left_leg=(45, 0, 0),
            right_leg=(45, 0, 0),
        ),
        35: pose(
            root_y=0.02,
            hips=(12, 0, 0),
            spine=(5, 0, 0),
            head=(2, 0, 0),
            left_arm=(15, 0, -10),
            right_arm=(-115, -90, 0),
            left_hand=(0, 0, 15),
            right_hand=(0, 0, -15),
        ),
        50: v2_idle_poses()[0],
    }


def v2_aim_poses():
    return {
        0: pose(
            root_y=-0.15,
            hips=(45, 0, 0),
            spine=(30, 0, 0),
            head=(0, 25, 0),
            left_arm=(10, 0, -28),
            left_hand=(0, 0, 35),
            right_arm=(-120, -90, 0),
            right_hand=(0, 0, 15),
            left_leg=(50, -6, 0),
            right_leg=(50, 6, 0),
        ),
        20: pose(
            root_y=-0.12,
            hips=(42, 8, 0),
            spine=(32, 12, 0),
            head=(0, -10, 0),
            left_arm=(-10, 0, -18),
            left_hand=(0, 0, -30),
            right_arm=(-120, -90, 0),
            right_hand=(0, 0, 15),
            left_leg=(48, -8, 0),
            right_leg=(48, 8, 0),
        ),
        40: pose(
            root_y=-0.15,
            hips=(45, -5, 0),
            spine=(30, -8, 0),
            head=(0, 25, 0),
            left_arm=(10, 0, -28),
            left_hand=(0, 0, 35),
            right_arm=(-118, -95, 0),
            right_hand=(0, 0, -15),
            left_leg=(50, -6, 0),
            right_leg=(50, 6, 0),
        ),
        60: pose(
            root_y=-0.15,
            hips=(45, 0, 0),
            spine=(30, 0, 0),
            head=(0, 25, 0),
            left_arm=(10, 0, -28),
            left_hand=(0, 0, 35),
            right_arm=(-120, -90, 0),
            right_hand=(0, 0, 15),
            left_leg=(50, -6, 0),
            right_leg=(50, 6, 0),
        ),
    }


def v2_aim_super_poses():
    return {
        0: pose(
            root_y=-0.25,
            hips=(75, 0, 0),
            spine=(45, 0, 0),
            head=(25, 0, 0),
            left_arm=(15, 0, -32),
            right_arm=(-135, -90, 0),
            left_hand=(0, 0, 20),
            right_hand=(0, 0, -20),
            left_leg=(75, 0, 0),
            right_leg=(75, 0, 0),
            left_foot=(-28, 0, 0),
            right_foot=(-28, 0, 0),
        ),
        15: pose(
            root_y=-0.15,
            hips=(60, 0, 0),
            spine=(50, 0, 0),
            head=(22, 0, 0),
            left_arm=(20, 0, -35),
            right_arm=(-130, -90, 0),
            left_hand=(0, 0, 25),
            right_hand=(0, 0, -25),
            left_leg=(65, 0, 0),
            right_leg=(65, 0, 0),
        ),
        30: pose(
            root_y=-0.25,
            hips=(75, 0, 0),
            spine=(35, 0, 0),
            head=(18, 0, 0),
            left_arm=(10, 0, -28),
            right_arm=(-140, -90, 0),
            left_hand=(0, 0, 20),
            right_hand=(0, 0, -20),
            left_leg=(75, 0, 0),
            right_leg=(75, 0, 0),
        ),
        45: pose(
            root_y=-0.15,
            hips=(60, 0, 0),
            spine=(50, 0, 0),
            head=(22, 0, 0),
            left_arm=(20, 0, -35),
            right_arm=(-130, -90, 0),
            left_hand=(0, 0, 25),
            right_hand=(0, 0, -25),
            left_leg=(65, 0, 0),
            right_leg=(65, 0, 0),
        ),
        60: pose(
            root_y=-0.25,
            hips=(75, 0, 0),
            spine=(45, 0, 0),
            head=(25, 0, 0),
            left_arm=(15, 0, -32),
            right_arm=(-135, -90, 0),
            left_hand=(0, 0, 20),
            right_hand=(0, 0, -20),
            left_leg=(75, 0, 0),
            right_leg=(75, 0, 0),
            left_foot=(-28, 0, 0),
            right_foot=(-28, 0, 0),
        ),
    }


def v2_hit_poses():
    return {
        0: v2_idle_poses()[0],
        3: pose(
            spine=(-15, 45, 0),
            chest=(-10, 20, 0),
            head=(-15, -35, 0),
            left_arm=(75, 0, -35),
            right_arm=(-120, -120, 0),
            left_hand=(0, 0, 35),
            right_hand=(0, 0, -35),
            left_leg=(20, 0, 0),
            right_leg=(20, 0, 0),
        ),
        6: pose(
            hips=(35, 20, 0),
            spine=(-8, 35, 0),
            head=(0, -30, 0),
            left_arm=(-60, 0, 25),
            right_arm=(-135, -90, 0),
            left_hand=(0, 0, 20),
            right_hand=(0, 0, -20),
            left_leg=(50, -35, 0),
            right_leg=(15, 35, 0),
            right_foot=(-25, 0, 0),
        ),
        10: pose(
            hips=(15, 0, 0),
            spine=(5, 0, 0),
            head=(0, 10, 0),
            left_arm=(20, 0, -15),
            right_arm=(-120, -90, 0),
            left_leg=(25, -8, 0),
            right_leg=(25, 8, 0),
        ),
        12: v2_idle_poses()[0],
    }


def v2_death_poses():
    return {
        0: v2_idle_poses()[0],
        8: pose(
            root_y=-0.10,
            hips=(65, 0, 0),
            spine=(50, 0, 0),
            head=(30, 0, 0),
            left_arm=(60, 0, -35),
            right_arm=(-120, -90, 0),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
        ),
        15: pose(
            root_y=-0.40,
            hips=(80, 0, 0),
            spine=(80, 0, 0),
            head=(40, 0, 0),
            left_arm=(25, 0, -20),
            right_arm=(-135, -80, 0),
            left_hand=(0, 0, -25),
            right_hand=(0, 0, 25),
            left_leg=(85, 0, 0),
            right_leg=(85, 0, 0),
            left_foot=(-45, 0, 0),
            right_foot=(-45, 0, 0),
        ),
        25: pose(
            root_y=-0.40,
            hips=(80, 0, 0),
            spine=(70, 0, 0),
            head=(40, 0, 0),
            left_arm=(-35, 0, 20),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, 25),
            right_hand=(0, 0, -20),
            left_leg=(85, 0, 0),
            right_leg=(85, 0, 0),
            left_foot=(-48, 0, 0),
            right_foot=(-48, 0, 0),
        ),
        40: pose(
            root_y=-0.40,
            hips=(80, 0, 0),
            spine=(70, 0, 0),
            head=(40, 0, 0),
            left_arm=(-35, 0, 20),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, 25),
            right_hand=(0, 0, -20),
            left_leg=(85, 0, 0),
            right_leg=(85, 0, 0),
            left_foot=(-48, 0, 0),
            right_foot=(-48, 0, 0),
        ),
    }


def v2_spawn_poses():
    return {
        0: pose(
            root_y=-0.30,
            hips=(80, 0, 0),
            spine=(70, 0, 0),
            head=(30, 0, 0),
            left_arm=(30, 0, -30),
            right_arm=(-135, -70, 0),
            left_leg=(85, 0, 0),
            right_leg=(85, 0, 0),
            left_foot=(-40, 0, 0),
            right_foot=(-40, 0, 0),
        ),
        10: pose(
            root_y=-0.10,
            hips=(50, 0, 0),
            spine=(40, 0, 0),
            head=(20, 0, 0),
            left_arm=(35, 0, -25),
            right_arm=(-125, -80, 0),
            left_leg=(55, 0, 0),
            right_leg=(55, 0, 0),
        ),
        18: pose(
            hips=(-10, 0, 0),
            spine=(-10, 0, 0),
            head=(-10, 0, 0),
            left_arm=(75, 0, -65),
            right_arm=(-120, -120, 0),
            left_hand=(0, 0, -35),
            right_hand=(0, 0, 35),
            left_leg=(10, -10, 0),
            right_leg=(10, 10, 0),
        ),
        30: pose(
            root_y=-0.02,
            hips=(20, 0, 0),
            spine=(15, 0, 0),
            head=(5, 0, 0),
            left_arm=(35, 0, -25),
            right_arm=(-120, -90, 0),
            left_leg=(25, -6, 0),
            right_leg=(25, 6, 0),
        ),
        45: v2_idle_poses()[0],
    }


def v2_victory_poses():
    return {
        0: v2_idle_poses()[0],
        10: pose(
            root_y=-0.15,
            hips=(50, 0, 0),
            spine=(30, 0, 0),
            head=(5, 0, 0),
            left_arm=(90, 0, -65),
            right_arm=(-120, -120, 0),
            left_hand=(0, 0, -40),
            right_hand=(0, 0, 40),
            left_leg=(60, 0, 0),
            right_leg=(60, 0, 0),
        ),
        20: pose(
            root_y=0.25,
            hips=(-10, 0, 0),
            spine=(-10, 0, 0),
            head=(-15, 0, 0),
            left_arm=(110, 0, -75),
            right_arm=(-120, -120, 0),
            left_hand=(0, 0, -45),
            right_hand=(0, 0, 45),
            left_leg=(-10, -10, 0),
            right_leg=(-10, 10, 0),
        ),
        30: pose(
            hips=(50, 0, 0),
            spine=(30, 0, 0),
            head=(5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-120, -90, 0),
            left_leg=(50, 0, 0),
            right_leg=(50, 0, 0),
        ),
        45: pose(
            hips=(25, 0, 0),
            spine=(10, 0, 0),
            head=(0, 0, 0),
            left_arm=(10, 0, -20),
            right_arm=(-120, -90, 0),
            left_leg=(25, 0, 0),
            right_leg=(25, 0, 0),
        ),
        60: v2_idle_poses()[0],
    }


def v2_gadget_poses():
    return {
        0: v2_idle_poses()[0],
        2: pose(
            root_y=-0.20,
            hips=(60, 0, 0),
            spine=(40, 0, 0),
            head=(15, 0, 0),
            left_arm=(25, 0, -20),
            right_arm=(-105, -60, 0),
            left_leg=(60, 0, 0),
            right_leg=(60, 0, 0),
        ),
        5: pose(
            hips=(-10, 0, 0),
            spine=(-5, 0, 0),
            head=(-5, 0, 0),
            left_arm=(65, 0, -45),
            right_arm=(-105, -120, 0),
            left_hand=(0, 0, -35),
            right_hand=(0, 0, 35),
            left_leg=(-5, 0, 0),
            right_leg=(-5, 0, 0),
        ),
        8: pose(
            root_y=0.02,
            hips=(10, 0, 0),
            spine=(5, 0, 0),
            head=(0, 0, 0),
            left_arm=(25, 0, -20),
            right_arm=(-120, -90, 0),
            left_leg=(20, 0, 0),
            right_leg=(20, 0, 0),
        ),
        12: v2_idle_poses()[0],
    }


def v2_aim_gadget_poses():
    return {
        0: pose(
            root_y=-0.15,
            hips=(60, 0, 0),
            spine=(50, 0, 0),
            head=(-15, 0, 0),
            left_arm=(20, 0, -35),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, 30),
            right_hand=(0, 0, -20),
            left_leg=(60, 0, 0),
            right_leg=(60, 0, 0),
        ),
        20: pose(
            root_y=-0.18,
            hips=(60, 0, 0),
            spine=(53, 0, 0),
            head=(-12, 0, 0),
            left_arm=(15, 0, -35),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, -30),
            right_hand=(0, 0, 20),
            left_leg=(60, 0, 0),
            right_leg=(60, 0, 0),
        ),
        40: pose(
            root_y=-0.12,
            hips=(50, 0, 0),
            spine=(47, 0, 0),
            head=(-15, 0, 0),
            left_arm=(20, 0, -30),
            right_arm=(-115, -105, 0),
            left_hand=(0, 0, 30),
            right_hand=(0, 0, -25),
            left_leg=(50, 0, 0),
            right_leg=(50, 0, 0),
        ),
        60: pose(
            root_y=-0.15,
            hips=(60, 0, 0),
            spine=(50, 0, 0),
            head=(-15, 0, 0),
            left_arm=(20, 0, -35),
            right_arm=(-120, -90, 0),
            left_hand=(0, 0, 30),
            right_hand=(0, 0, -20),
            left_leg=(60, 0, 0),
            right_leg=(60, 0, 0),
        ),
    }


def v3_pose(
    *,
    root_y=0.0,
    hips_x=0.0,
    hips_y=0.0,
    hips_z=0.0,
    spine_x=0.0,
    spine_y=0.0,
    spine_z=0.0,
    chest_x=0.0,
    chest_y=0.0,
    chest_z=0.0,
    neck_x=0.0,
    head_x=0.0,
    head_y=0.0,
    head_z=0.0,
    left_arm=0.0,
    left_arm_y=0.0,
    left_arm_z=0.0,
    left_forearm=0.0,
    left_hand_x=0.0,
    left_hand_z=0.0,
    right_arm=0.0,
    right_arm_y=0.0,
    right_arm_z=0.0,
    right_forearm=0.0,
    right_hand_x=0.0,
    right_hand_z=0.0,
    left_leg=0.0,
    left_leg_y=0.0,
    left_leg_z=0.0,
    right_leg=0.0,
    right_leg_y=0.0,
    right_leg_z=0.0,
    left_foot=0.0,
    right_foot=0.0,
):
    """Translate the v3 table onto NeedleRig's actual 14-bone hierarchy.

    The brief names Neck and separate forearm bones, but NeedleRig has no such
    bones.  Neck pitch is folded into Head; each forearm value is combined with
    the matching hand value on the available Hand bone.  This keeps the v3
    torso/root limits meaningful without inventing nonexistent channels.
    """

    return pose(
        root_y=root_y,
        hips=(hips_x, hips_y, hips_z),
        spine=(spine_x, spine_y, spine_z),
        chest=(chest_x, chest_y, chest_z),
        head=(neck_x + head_x, head_y, head_z),
        left_arm=(left_arm, left_arm_y, left_arm_z),
        left_hand=(left_forearm + left_hand_x, 0.0, left_hand_z),
        right_arm=(right_arm, right_arm_y, right_arm_z),
        right_hand=(right_forearm + right_hand_x, 0.0, right_hand_z),
        left_leg=(left_leg, left_leg_y, left_leg_z),
        right_leg=(right_leg, right_leg_y, right_leg_z),
        left_foot=(left_foot, 0.0, 0.0),
        right_foot=(right_foot, 0.0, 0.0),
    )


def v3_idle_poses():
    return {
        0: v3_pose(
            root_y=0.0,
            hips_x=-3,
            spine_x=8,
            chest_x=5,
            neck_x=-2,
            head_y=15,
            right_arm=30,
            right_forearm=80,
            right_hand_x=-20,
            left_arm=-15,
            left_forearm=70,
            left_hand_x=-20,
            left_leg=40,
            right_leg=-10,
            left_foot=5,
        ),
        20: v3_pose(
            root_y=-0.01,
            hips_x=-5,
            spine_x=10,
            chest_x=3,
            head_y=-10,
            right_arm=35,
            right_forearm=80,
            right_hand_x=-20,
            left_arm=-20,
            left_forearm=70,
            left_hand_x=-20,
            left_leg=38,
            right_leg=-8,
        ),
        40: v3_pose(
            root_y=0.0,
            hips_x=-2,
            spine_x=6,
            chest_x=6,
            head_y=20,
            right_arm=25,
            right_forearm=80,
            right_hand_x=-20,
            left_arm=-10,
            left_forearm=70,
            left_hand_x=-20,
            left_leg=45,
            right_leg=-10,
            left_foot=4,
        ),
        60: v3_pose(
            root_y=0.0,
            hips_x=-3,
            spine_x=8,
            chest_x=5,
            neck_x=-2,
            head_y=15,
            right_arm=30,
            right_forearm=80,
            right_hand_x=-20,
            left_arm=-15,
            left_forearm=70,
            left_hand_x=-20,
            left_leg=40,
            right_leg=-10,
            left_foot=5,
        ),
        80: v3_pose(
            root_y=0.0,
            hips_x=-3,
            spine_x=8,
            chest_x=5,
            neck_x=-2,
            head_y=15,
            right_arm=30,
            right_forearm=80,
            right_hand_x=-20,
            left_arm=-15,
            left_forearm=70,
            left_hand_x=-20,
            left_leg=40,
            right_leg=-10,
            left_foot=5,
        ),
    }


def v3_run_poses():
    # V3 correction: the torso is only Hips 5 + Spine 8 degrees. The crouch
    # comes from the legs, never from a 35 + 40 degree upper-body fold.
    return {
        0: v3_pose(
            root_y=0.0482,
            hips_x=5,
            spine_x=8,
            head_x=-5,
            left_leg=50,
            right_leg=-20,
            left_arm=-30,
            right_arm=70,
            left_forearm=20,
            right_forearm=30,
        ),
        6: v3_pose(
            root_y=0.0050,
            hips_x=5,
            spine_x=8,
            head_x=-3,
            left_leg=20,
            right_leg=60,
            left_arm=20,
            right_arm=20,
            left_forearm=20,
            right_forearm=30,
        ),
        12: v3_pose(
            root_y=0.0440,
            hips_x=5,
            spine_x=8,
            head_x=-5,
            left_leg=-20,
            right_leg=50,
            left_arm=70,
            right_arm=-30,
            left_forearm=20,
            right_forearm=30,
        ),
        18: v3_pose(
            root_y=0.0101,
            hips_x=5,
            spine_x=8,
            head_x=-3,
            left_leg=60,
            right_leg=20,
            left_arm=20,
            right_arm=20,
            left_forearm=20,
            right_forearm=30,
        ),
        24: v3_pose(
            root_y=0.0482,
            hips_x=5,
            spine_x=8,
            head_x=-5,
            left_leg=50,
            right_leg=-20,
            left_arm=-30,
            right_arm=70,
            left_forearm=20,
            right_forearm=30,
        ),
    }


def v3_attack_poses():
    idle = v3_idle_poses()[0]
    return {
        0: idle,
        3: v3_pose(
            root_y=-0.2253,
            hips_x=-8,
            spine_x=15,
            chest_x=10,
            right_arm=-40,
            right_forearm=60,
            left_arm=-30,
            left_forearm=50,
        ),
        6: v3_pose(
            root_y=-0.2722,
            hips_x=0,
            spine_x=10,
            chest_x=5,
            right_arm=90,
            right_forearm=170,
            right_hand_z=10,
            left_arm=-50,
            left_forearm=30,
        ),
        10: v3_pose(
            root_y=-0.2597,
            hips_x=-2,
            spine_x=6,
            chest_x=2,
            right_arm=20,
            right_forearm=90,
            left_arm=-20,
            left_forearm=50,
        ),
        16: idle,
    }


def v3_super_poses():
    idle = v3_idle_poses()[0]
    return {
        0: idle,
        8: v3_pose(
            root_y=0.0552,
            hips_x=-20,
            spine_x=25,
            chest_x=15,
            right_arm=60,
            right_forearm=160,
            left_arm=60,
            left_forearm=160,
            left_leg=80,
            right_leg=80,
        ),
        12: v3_pose(
            root_y=0.0552,
            hips_x=-20,
            spine_x=25,
            chest_x=15,
            right_arm=60,
            right_forearm=160,
            left_arm=60,
            left_forearm=160,
            left_leg=80,
            right_leg=80,
        ),
        16: v3_pose(
            root_y=0.20,
            hips_x=10,
            spine_x=-10,
            chest_x=-5,
            head_x=-15,
            right_arm=150,
            left_arm=150,
            left_leg=30,
            right_leg=30,
        ),
        25: v3_pose(
            root_y=0.0557,
            hips_x=-10,
            spine_x=30,
            chest_x=10,
            right_arm=90,
            right_forearm=80,
            left_arm=90,
            left_forearm=80,
            left_leg=50,
            right_leg=50,
        ),
        40: v3_pose(
            root_y=0.0217,
            hips_x=-3,
            spine_x=8,
            chest_x=5,
            right_arm=35,
            right_forearm=60,
            left_arm=25,
            left_forearm=60,
            left_leg=35,
            right_leg=0,
        ),
        50: idle,
    }


def v3_aim_poses():
    return {
        0: v3_pose(
            root_y=0.0513,
            hips_x=-5,
            spine_x=12,
            chest_x=3,
            head_y=10,
            right_arm=80,
            right_forearm=160,
            right_hand_x=-15,
            left_arm=-10,
            left_forearm=80,
            left_hand_x=-20,
            left_leg=45,
            right_leg=-5,
        ),
        30: v3_pose(
            root_y=0.0513,
            hips_x=-5,
            spine_x=10,
            chest_x=3,
            head_y=10,
            right_arm=78,
            right_forearm=160,
            right_hand_x=-15,
            left_arm=-5,
            left_forearm=80,
            left_hand_x=-20,
            left_leg=45,
            right_leg=-5,
        ),
        60: v3_pose(
            root_y=0.0513,
            hips_x=-5,
            spine_x=12,
            chest_x=3,
            head_y=10,
            right_arm=80,
            right_forearm=160,
            right_hand_x=-15,
            left_arm=-10,
            left_forearm=80,
            left_hand_x=-20,
            left_leg=45,
            right_leg=-5,
        ),
    }


def v3_aim_super_poses():
    return {
        0: v3_pose(
            root_y=0.0023,
            hips_x=-20,
            spine_x=30,
            chest_x=10,
            head_x=20,
            right_arm=40,
            right_forearm=150,
            left_arm=40,
            left_forearm=150,
            left_leg=90,
            right_leg=90,
        ),
        30: v3_pose(
            root_y=0.0178,
            hips_x=-18,
            spine_x=25,
            chest_x=8,
            head_x=18,
            right_arm=40,
            right_forearm=150,
            left_arm=40,
            left_forearm=150,
            left_leg=85,
            right_leg=85,
        ),
        60: v3_pose(
            root_y=0.0023,
            hips_x=-20,
            spine_x=30,
            chest_x=10,
            head_x=20,
            right_arm=40,
            right_forearm=150,
            left_arm=40,
            left_forearm=150,
            left_leg=90,
            right_leg=90,
        ),
    }


def v3_hit_poses():
    idle = v3_idle_poses()[0]
    return {
        0: idle,
        3: v3_pose(
            root_y=-0.1456,
            hips_x=-10,
            spine_x=-5,
            chest_x=-5,
            right_arm=-30,
            left_arm=40,
            left_leg=20,
            right_leg=0,
        ),
        6: v3_pose(
            root_y=-0.1919,
            hips_x=-15,
            spine_x=-10,
            right_arm=-50,
            left_arm=60,
            left_leg=20,
            right_leg=0,
        ),
        10: v3_pose(
            root_y=-0.1958,
            hips_x=-4,
            spine_x=4,
            chest_x=2,
            right_arm=10,
            left_arm=20,
            left_leg=10,
            right_leg=0,
        ),
        12: idle,
    }


def v3_death_poses():
    idle = v3_idle_poses()[0]
    return {
        0: idle,
        8: v3_pose(
            root_y=0.0623,
            hips_x=-15,
            spine_x=30,
            left_leg=70,
            right_leg=70,
            right_arm=60,
            left_arm=40,
        ),
        15: v3_pose(
            root_y=0.0023,
            hips_x=-20,
            spine_x=50,
            chest_x=20,
            head_x=30,
            left_leg=90,
            right_leg=90,
            right_arm=60,
            left_arm=40,
        ),
        25: v3_pose(
            root_y=-0.40,
            hips_x=-20,
            hips_z=30,
            spine_x=50,
            spine_z=20,
            chest_x=20,
            head_x=30,
            left_leg=-90,
            right_leg=90,
            right_arm=45,
            left_arm=25,
        ),
        40: v3_pose(
            root_y=-0.40,
            hips_x=-20,
            hips_z=30,
            spine_x=50,
            spine_z=20,
            chest_x=20,
            head_x=30,
            left_leg=-90,
            right_leg=90,
            right_arm=45,
            left_arm=25,
        ),
    }


def v3_spawn_poses():
    idle = v3_idle_poses()[0]
    return {
        0: v3_pose(
            root_y=-0.30,
            hips_x=-30,
            spine_x=60,
            chest_x=20,
            left_leg=100,
            right_leg=100,
        ),
        10: v3_pose(
            root_y=-0.10, hips_x=-15, spine_x=30, chest_x=10, left_leg=70, right_leg=70
        ),
        18: v3_pose(
            root_y=0.0,
            hips_x=-5,
            spine_x=-5,
            chest_x=-5,
            right_arm_z=80,
            left_arm_z=-80,
            left_leg=40,
            right_leg=-10,
        ),
        30: v3_pose(
            root_y=0.0,
            hips_x=-3,
            spine_x=8,
            chest_x=5,
            left_leg=30,
            right_leg=0,
            right_arm=20,
            left_arm=-10,
        ),
        45: idle,
    }


def v3_victory_poses():
    idle = v3_idle_poses()[0]
    return {
        0: idle,
        10: v3_pose(root_y=0.0336, left_leg=60, right_leg=60),
        15: v3_pose(
            root_y=0.25,
            hips_x=10,
            spine_x=-15,
            right_arm=160,
            left_arm=160,
            left_leg=20,
            right_leg=20,
        ),
        25: v3_pose(
            root_y=0.0557,
            hips_x=-10,
            spine_x=30,
            right_arm=90,
            right_forearm=80,
            left_arm=90,
            left_forearm=80,
            left_leg=50,
            right_leg=50,
        ),
        35: v3_pose(
            root_y=0.0217,
            hips_x=-3,
            spine_x=8,
            chest_x=5,
            right_arm=35,
            right_forearm=60,
            left_arm=25,
            left_forearm=60,
            left_leg=35,
            right_leg=0,
        ),
        60: idle,
    }


def v3_gadget_poses():
    idle = v3_idle_poses()[0]
    return {
        0: idle,
        3: v3_pose(
            root_y=-0.0505,
            hips_x=-10,
            spine_x=20,
            right_arm=20,
            right_forearm=60,
            left_arm=20,
            left_forearm=60,
            left_leg=30,
            right_leg=-20,
        ),
        6: v3_pose(
            root_y=0.0325,
            hips_x=5,
            spine_x=-5,
            right_arm=80,
            right_forearm=80,
            left_arm=80,
            left_forearm=80,
            left_leg=30,
            right_leg=-20,
        ),
        9: v3_pose(
            root_y=-0.2722,
            hips_x=0,
            spine_x=3,
            right_arm=25,
            right_forearm=50,
            left_arm=20,
            left_forearm=50,
        ),
        12: idle,
    }


def v3_aim_gadget_poses():
    return {
        0: v3_pose(
            root_y=0.0305,
            hips_x=-8,
            spine_x=20,
            chest_x=10,
            head_x=-10,
            right_arm=90,
            right_forearm=160,
            left_arm=20,
            left_forearm=140,
            left_leg=70,
            right_leg=0,
        ),
        30: v3_pose(
            root_y=0.0288,
            hips_x=-6,
            spine_x=23,
            chest_x=10,
            head_x=-10,
            right_arm=90,
            right_forearm=160,
            left_arm=20,
            left_forearm=140,
            left_leg=68,
            right_leg=0,
        ),
        60: v3_pose(
            root_y=0.0305,
            hips_x=-8,
            spine_x=20,
            chest_x=10,
            head_x=-10,
            right_arm=90,
            right_forearm=160,
            left_arm=20,
            left_forearm=140,
            left_leg=70,
            right_leg=0,
        ),
    }


POSE_BUILDERS = {
    "idle": v3_idle_poses,
    "run": v3_run_poses,
    "attack": v3_attack_poses,
    "super": v3_super_poses,
    "aim": v3_aim_poses,
    "aim-super": v3_aim_super_poses,
    "hit": v3_hit_poses,
    "death": v3_death_poses,
    "spawn": v3_spawn_poses,
    "victory": v3_victory_poses,
    "gadget": v3_gadget_poses,
    "aim-gadget": v3_aim_gadget_poses,
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


def clear_actions(keep=None):
    for action in list(bpy.data.actions):
        if action == keep:
            continue
        action.user_clear()
        bpy.data.actions.remove(action)


def reset_pose(armature):
    for name in BONES:
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def apply_pose(armature, data):
    reset_pose(armature)
    for name, values in data["rotations"].items():
        armature.pose.bones[name].rotation_euler = radians(values)
    # NeedleRig's Root bone is oriented so local Y maps to Blender world Z.
    # Local Z maps to depth and would make crouches look like forward falls.
    armature.pose.bones["Root"].location.y = float(data["root_y"])


def key_pose(armature, action, frame, data):
    apply_pose(armature, data)
    for name in BONES:
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


def ensure_needle_arm_deformation(armature):
    """Make the visible Needle arm masses follow the authored arm bones.

    The source file contains the large organic arms and wooden palms as
    separate objects parented to the armature object, but without an
    Armature modifier or vertex groups.  Rigid bone parenting is intentional
    here: these are separate hard-surface/organic pieces, not one continuous
    deforming skin.  It preserves their authored bind pose and prevents the
    whole arm mesh from being rotated through the chest by a single vertex
    group.  Keep this idempotent so rerunning the authoring script repairs a
    refreshed master file as well.
    """

    bindings = {
        "V6_OrganicArm_-1": "LeftArm",
        "V6_OrganicArm_1": "RightArm",
        "V6_WoodPalm_-1": "LeftHand",
        "V6_WoodPalm_1": "RightHand",
    }
    for object_name, bone_name in bindings.items():
        mesh = bpy.data.objects.get(object_name)
        if mesh is None or mesh.type != "MESH":
            raise RuntimeError(
                f"Needle master is missing visible arm mesh: {object_name}"
            )
        world_matrix = mesh.matrix_world.copy()
        for modifier in list(mesh.modifiers):
            if modifier.type == "ARMATURE":
                mesh.modifiers.remove(modifier)
        mesh.vertex_groups.clear()
        mesh.parent = armature
        mesh.parent_type = "BONE"
        mesh.parent_bone = bone_name
        mesh.matrix_world = world_matrix


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = FRAME_ENDS[clip]
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None or armature.name != "NeedleRig":
        raise RuntimeError(f"{clip}: expected NeedleRig armature")
    if set(armature.data.bones.keys()) != set(BONES):
        raise RuntimeError(f"{clip}: live rig bone set changed")

    armature.animation_data_clear()
    clear_actions()
    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    poses = POSE_BUILDERS[clip]()
    expected_end = FRAME_ENDS[clip]
    if min(poses) != 0 or max(poses) != expected_end:
        raise RuntimeError(f"{clip}: pose frames do not cover 0..{expected_end}")
    for frame in sorted(poses):
        key_pose(armature, action, frame, poses[frame])
    smooth_action(action)
    scene.frame_set(0)

    scene.name = f"needle_{clip}"
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
    scene["frame_start"] = 0
    scene["frame_end"] = expected_end
    scene["fps"] = FPS
    scene["authoring_status"] = "READY_FOR_REVIEW"
    scene["source_of_truth"] = os.fspath(MASTER.relative_to(ROOT))
    scene["root_motion_contract"] = (
        "Root local X/Z locked; Root local Y is world-up and authored only for super/death/spawn/aim-gadget"
    )
    scene["cycle_contract"] = (
        "frame 0 equals frame end" if clip in CYCLE_CLIPS else "one-shot"
    )

    target = SCENES / f"{clip}.blend"
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(target))
    curves = action_fcurves(action)
    frames = [point.co[0] for curve in curves for point in curve.keyframe_points]
    return {
        "clip": clip,
        "action": action.name,
        "file": os.fspath(target.relative_to(ROOT)),
        "frame_start": int(min(frames)),
        "frame_end": int(max(frames)),
        "fps": FPS,
        "curves": len(curves),
        "keyframes": sum(len(curve.keyframe_points) for curve in curves),
        "cycle": clip in CYCLE_CLIPS,
    }


def main():
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    # Persist the skinning repair in the source of truth before generating
    # linked animation scenes from it.
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    master_armature = bpy.data.objects.get("NeedleRig")
    if master_armature is None:
        raise RuntimeError("Needle master is missing NeedleRig")
    ensure_needle_arm_deformation(master_armature)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER))
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
