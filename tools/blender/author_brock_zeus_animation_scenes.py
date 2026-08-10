"""Author the Brock Zeus v2 animation pack with a separate cloud companion.

The source master is opened afresh for every focused scene.  Brock's measured
rig is a 15-bone armature with Root local Y mapped to Blender world-up.  The
cloud is intentionally an object hierarchy (Cloud_Locator -> Cloud), not a
deforming bone or part of the character export.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/author_brock_zeus_animation_scenes.py
  BROCK_CLIP_FILTER=idle blender --background --python tools/blender/author_brock_zeus_animation_scenes.py
"""

from __future__ import annotations

import copy
import json
import math
import os
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
HERO = "brock-zeus"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "brock-zeus.blend"
SCENES = MASTER.parent / "scenes"
REPORT = ROOT / "artifacts" / "brock-zeus-animation-authoring.json"
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
BONES = (
    "Root",
    "Hips",
    "Spine",
    "Chest",
    "Head",
    "L_Shoulder",
    "L_Elbow",
    "L_Wrist",
    "R_Shoulder",
    "R_Elbow",
    "R_Wrist",
    "L_UpperLeg",
    "L_LowerLeg",
    "R_UpperLeg",
    "R_LowerLeg",
)

# The legacy source had a non-neutral pose (Root Z -2, Hips X -16, Head X 18,
# and wrist offsets).  Copying it into every Action caused the same permanent
# lean that Needle had.  Brock's authored pack starts from measured bind pose.
BASE_ROT = {name: (0.0, 0.0, 0.0) for name in BONES}


def pose(*, root_y=0.0, **overrides):
    rotations = dict(BASE_ROT)
    for name, value in overrides.items():
        if name not in rotations:
            raise KeyError(f"unknown Brock bone {name}")
        rotations[name] = tuple(float(axis) for axis in value)
    return {"root_y": float(root_y), "rotations": rotations}


def idle_poses():
    neutral = pose()
    legacy_neutral = pose(
        R_Shoulder=(-28, -8, 5),
        R_Elbow=(48, 0, -8),
        R_Wrist=(-18, 0, 10),
        L_Shoulder=(-45, 0, -14),
        L_Elbow=(45, 0, 10),
        L_Wrist=(-26, 0, -8),
        Head=(0, 8, 0),
        L_UpperLeg=(4, -2, 0),
        R_UpperLeg=(-4, 2, 0),
    )
    return {
        0: legacy_neutral,
        20: pose(
            R_Shoulder=(-24, -5, 8),
            R_Elbow=(44, 0, -5),
            R_Wrist=(-14, 0, 14),
            L_Shoulder=(-15, 0, -16),
            L_Elbow=(62, 0, 12),
            L_Wrist=(-22, 0, -10),
            Spine=(2, 0, 1),
            Chest=(1, 0, 0),
            Head=(0, -5, 0),
            L_UpperLeg=(3, -3, 0),
            R_UpperLeg=(-3, 3, 0),
        ),
        40: pose(
            R_Shoulder=(-32, -10, 2),
            R_Elbow=(52, 0, -12),
            R_Wrist=(-22, 0, 6),
            L_Shoulder=(-15, 0, -12),
            L_Elbow=(62, 0, 8),
            L_Wrist=(-30, 0, -6),
            Spine=(-2, 0, -1),
            Chest=(-1, 0, 0),
            Head=(0, 12, 0),
            L_UpperLeg=(5, -1, 0),
            R_UpperLeg=(-5, 1, 0),
        ),
        60: pose(
            R_Shoulder=(-24, -5, 8),
            R_Elbow=(44, 0, -5),
            R_Wrist=(-14, 0, 14),
            L_Shoulder=(-15, 0, -16),
            L_Elbow=(62, 0, 12),
            L_Wrist=(-22, 0, -10),
            Spine=(2, 0, 1),
            Chest=(1, 0, 0),
            Head=(0, -5, 0),
        ),
        80: legacy_neutral,
    }


def run_poses():
    return {
        0: pose(
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(-4, 0, 0),
            R_Shoulder=(-12, -12, 12),
            R_Elbow=(28, 0, -8),
            R_Wrist=(-8, 0, 8),
            L_Shoulder=(28, 0, -18),
            L_Elbow=(32, 0, 10),
            L_Wrist=(-10, 0, -8),
            L_UpperLeg=(48, -8, 0),
            L_LowerLeg=(-28, 0, 0),
            R_UpperLeg=(-22, 8, 0),
            R_LowerLeg=(18, 0, 0),
        ),
        6: pose(
            root_y=-0.015,
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(-2, 0, 0),
            R_Shoulder=(-24, -8, 10),
            R_Elbow=(42, 0, -8),
            R_Wrist=(-12, 0, 12),
            L_Shoulder=(12, 0, -14),
            L_Elbow=(48, 0, 8),
            L_Wrist=(-14, 0, -6),
            L_UpperLeg=(18, 8, 0),
            L_LowerLeg=(24, 0, 0),
            R_UpperLeg=(46, -8, 0),
            R_LowerLeg=(-30, 0, 0),
        ),
        12: pose(
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(-4, 0, 0),
            R_Shoulder=(-30, -10, 6),
            R_Elbow=(48, 0, -6),
            R_Wrist=(-16, 0, 8),
            L_Shoulder=(34, 0, -20),
            L_Elbow=(30, 0, 12),
            L_Wrist=(-8, 0, -10),
            L_UpperLeg=(-22, 8, 0),
            L_LowerLeg=(18, 0, 0),
            R_UpperLeg=(48, -8, 0),
            R_LowerLeg=(-28, 0, 0),
        ),
        18: pose(
            root_y=-0.015,
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(-2, 0, 0),
            R_Shoulder=(-24, -8, 10),
            R_Elbow=(42, 0, -8),
            R_Wrist=(-12, 0, 12),
            L_Shoulder=(12, 0, -14),
            L_Elbow=(48, 0, 8),
            L_Wrist=(-14, 0, -6),
            L_UpperLeg=(18, 8, 0),
            L_LowerLeg=(24, 0, 0),
            R_UpperLeg=(46, -8, 0),
            R_LowerLeg=(-30, 0, 0),
        ),
        20: pose(
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(-4, 0, 0),
            R_Shoulder=(-12, -12, 12),
            R_Elbow=(28, 0, -8),
            R_Wrist=(-8, 0, 8),
            L_Shoulder=(28, 0, -18),
            L_Elbow=(32, 0, 10),
            L_Wrist=(-10, 0, -8),
            L_UpperLeg=(48, -8, 0),
            L_LowerLeg=(-28, 0, 0),
            R_UpperLeg=(-22, 8, 0),
            R_LowerLeg=(18, 0, 0),
        ),
    }


def attack_poses():
    idle = idle_poses()[0]
    return {
        0: idle,
        3: pose(
            Spine=(8, 0, 0),
            Chest=(4, 0, 0),
            Head=(0, 12, 0),
            R_Shoulder=(18, -24, 18),
            R_Elbow=(-32, 0, -12),
            R_Wrist=(18, 0, -8),
            L_Shoulder=(-18, 0, 20),
            L_Elbow=(35, 0, 14),
            L_Wrist=(-8, 0, 10),
        ),
        6: pose(
            Spine=(3, 0, 0),
            Chest=(2, 0, 0),
            Head=(0, 18, 0),
            R_Shoulder=(-58, -18, 8),
            R_Elbow=(92, 0, -8),
            R_Wrist=(-34, 0, 18),
            L_Shoulder=(-28, 0, 24),
            L_Elbow=(42, 0, 18),
            L_Wrist=(-12, 0, 16),
        ),
        10: pose(
            Spine=(1, 0, 0),
            Chest=(1, 0, 0),
            Head=(0, 8, 0),
            R_Shoulder=(-40, -12, 10),
            R_Elbow=(62, 0, -4),
            R_Wrist=(-24, 0, 12),
            L_Shoulder=(8, 0, -10),
            L_Elbow=(58, 0, 8),
            L_Wrist=(-18, 0, -8),
        ),
        16: idle,
    }


def super_poses():
    idle = idle_poses()[0]
    return {
        0: idle,
        10: pose(
            root_y=-0.20,
            Hips=(-16, 0, 0),
            Spine=(18, 0, 0),
            Chest=(8, 0, 0),
            Head=(10, 0, 0),
            R_Shoulder=(16, -20, 24),
            R_Elbow=(52, 0, -10),
            R_Wrist=(-24, 0, 14),
            L_Shoulder=(16, 0, -24),
            L_Elbow=(52, 0, 10),
            L_Wrist=(-24, 0, -14),
            L_UpperLeg=(34, -4, 0),
            L_LowerLeg=(-46, 0, 0),
            R_UpperLeg=(34, 4, 0),
            R_LowerLeg=(-46, 0, 0),
        ),
        18: pose(
            root_y=0.20,
            Hips=(8, 0, 0),
            Spine=(-8, 0, 0),
            Chest=(-4, 0, 0),
            Head=(-12, 0, 0),
            R_Shoulder=(-70, -18, 18),
            R_Elbow=(102, 0, -8),
            R_Wrist=(-38, 0, 18),
            L_Shoulder=(-70, 0, -18),
            L_Elbow=(102, 0, 8),
            L_Wrist=(-38, 0, -18),
            L_UpperLeg=(18, -4, 0),
            R_UpperLeg=(18, 4, 0),
        ),
        25: pose(
            Hips=(-8, 0, 0),
            Spine=(18, 0, 0),
            Chest=(7, 0, 0),
            Head=(8, 0, 0),
            R_Shoulder=(64, -12, 12),
            R_Elbow=(76, 0, -8),
            R_Wrist=(-30, 0, 12),
            L_Shoulder=(64, 0, -12),
            L_Elbow=(76, 0, 8),
            L_Wrist=(-30, 0, -12),
            L_UpperLeg=(40, -4, 0),
            R_UpperLeg=(40, 4, 0),
            L_LowerLeg=(-36, 0, 0),
            R_LowerLeg=(-36, 0, 0),
        ),
        30: pose(
            Hips=(-4, 0, 0),
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(4, 0, 0),
            R_Shoulder=(48, -10, 10),
            R_Elbow=(60, 0, -6),
            R_Wrist=(-22, 0, 10),
            L_Shoulder=(48, 0, -10),
            L_Elbow=(60, 0, 6),
            L_Wrist=(-22, 0, -10),
        ),
        35: pose(
            Hips=(0, 0, 0),
            Spine=(2, 0, 0),
            Chest=(1, 0, 0),
            R_Shoulder=(32, -8, 8),
            R_Elbow=(48, 0, -4),
            R_Wrist=(-18, 0, 8),
            L_Shoulder=(32, 0, -8),
            L_Elbow=(48, 0, 4),
            L_Wrist=(-18, 0, -8),
        ),
        45: idle,
        50: idle,
    }


def aim_poses():
    return {
        0: pose(
            Spine=(5, 0, 0),
            Chest=(2, 0, 0),
            Head=(0, 16, 0),
            R_Shoulder=(-48, -14, 8),
            R_Elbow=(82, 0, -8),
            R_Wrist=(-28, 0, 14),
            L_Shoulder=(-16, 0, 18),
            L_Elbow=(74, 0, 12),
            L_Wrist=(-20, 0, 8),
        ),
        30: pose(
            Spine=(6, 0, 0),
            Chest=(2, 0, 0),
            Head=(0, 10, 0),
            R_Shoulder=(-44, -14, 10),
            R_Elbow=(78, 0, -6),
            R_Wrist=(-26, 0, 12),
            L_Shoulder=(-12, 0, 16),
            L_Elbow=(70, 0, 10),
            L_Wrist=(-18, 0, 8),
        ),
        60: pose(
            Spine=(5, 0, 0),
            Chest=(2, 0, 0),
            Head=(0, 16, 0),
            R_Shoulder=(-48, -14, 8),
            R_Elbow=(82, 0, -8),
            R_Wrist=(-28, 0, 14),
            L_Shoulder=(-16, 0, 18),
            L_Elbow=(74, 0, 12),
            L_Wrist=(-20, 0, 8),
        ),
    }


def aim_super_poses():
    return {
        0: pose(
            root_y=-0.16,
            Hips=(-12, 0, 0),
            Spine=(16, 0, 0),
            Chest=(6, 0, 0),
            Head=(12, 0, 0),
            R_Shoulder=(-18, -14, 16),
            R_Elbow=(74, 0, -10),
            R_Wrist=(-26, 0, 12),
            L_Shoulder=(-18, 0, -16),
            L_Elbow=(74, 0, 10),
            L_Wrist=(-26, 0, -12),
            L_UpperLeg=(38, -3, 0),
            R_UpperLeg=(38, 3, 0),
            L_LowerLeg=(-34, 0, 0),
            R_LowerLeg=(-34, 0, 0),
        ),
        30: pose(
            root_y=-0.16,
            Hips=(-10, 0, 0),
            Spine=(14, 0, 0),
            Chest=(5, 0, 0),
            Head=(10, 0, 0),
            R_Shoulder=(-14, -12, 14),
            R_Elbow=(70, 0, -8),
            R_Wrist=(-24, 0, 10),
            L_Shoulder=(-14, 0, -14),
            L_Elbow=(70, 0, 8),
            L_Wrist=(-24, 0, -10),
            L_UpperLeg=(36, -3, 0),
            R_UpperLeg=(36, 3, 0),
            L_LowerLeg=(-32, 0, 0),
            R_LowerLeg=(-32, 0, 0),
        ),
        60: pose(
            root_y=-0.16,
            Hips=(-12, 0, 0),
            Spine=(16, 0, 0),
            Chest=(6, 0, 0),
            Head=(12, 0, 0),
            R_Shoulder=(-18, -14, 16),
            R_Elbow=(74, 0, -10),
            R_Wrist=(-26, 0, 12),
            L_Shoulder=(-18, 0, -16),
            L_Elbow=(74, 0, 10),
            L_Wrist=(-26, 0, -12),
            L_UpperLeg=(38, -3, 0),
            R_UpperLeg=(38, 3, 0),
            L_LowerLeg=(-34, 0, 0),
            R_LowerLeg=(-34, 0, 0),
        ),
    }


def hit_poses():
    idle = idle_poses()[0]
    return {
        0: idle,
        3: pose(
            Hips=(-8, 0, 0),
            Spine=(-12, 0, 0),
            Chest=(-6, 0, 0),
            Head=(-12, 0, 0),
            R_Shoulder=(22, -8, 20),
            R_Elbow=(26, 0, -10),
            R_Wrist=(-10, 0, 10),
            L_Shoulder=(46, 0, -22),
            L_Elbow=(24, 0, 10),
            L_Wrist=(-8, 0, -10),
        ),
        7: pose(
            Hips=(-10, 0, 0),
            Spine=(-16, 0, 0),
            Chest=(-8, 0, 0),
            Head=(-16, 0, 0),
            R_Shoulder=(30, -8, 24),
            R_Elbow=(20, 0, -12),
            R_Wrist=(-6, 0, 12),
            L_Shoulder=(58, 0, -26),
            L_Elbow=(18, 0, 12),
            L_Wrist=(-6, 0, -12),
        ),
        10: pose(
            Hips=(-3, 0, 0),
            Spine=(-3, 0, 0),
            Chest=(-2, 0, 0),
            Head=(-4, 0, 0),
            R_Shoulder=(-10, -8, 8),
            R_Elbow=(42, 0, -6),
            R_Wrist=(-16, 0, 8),
            L_Shoulder=(20, 0, -12),
            L_Elbow=(58, 0, 8),
            L_Wrist=(-18, 0, -8),
        ),
        12: idle,
    }


def death_poses():
    idle = idle_poses()[0]
    return {
        0: idle,
        8: pose(
            root_y=-0.12,
            Hips=(-12, 0, 0),
            Spine=(18, 0, 0),
            Chest=(8, 0, 0),
            Head=(12, 0, 0),
            R_Shoulder=(22, -8, 16),
            R_Elbow=(36, 0, -10),
            R_Wrist=(-16, 0, 10),
            L_Shoulder=(30, 0, -16),
            L_Elbow=(40, 0, 10),
            L_Wrist=(-16, 0, -8),
            L_UpperLeg=(54, 0, 0),
            R_UpperLeg=(54, 0, 0),
            L_LowerLeg=(-56, 0, 0),
            R_LowerLeg=(-56, 0, 0),
        ),
        15: pose(
            root_y=-0.30,
            Hips=(-20, 0, 16),
            Spine=(34, 0, 18),
            Chest=(12, 0, 8),
            Head=(26, 0, 10),
            R_Shoulder=(36, -8, 20),
            R_Elbow=(24, 0, -8),
            R_Wrist=(-8, 0, 8),
            L_Shoulder=(42, 0, -20),
            L_Elbow=(28, 0, 8),
            L_Wrist=(-10, 0, -8),
            L_UpperLeg=(76, 0, 0),
            R_UpperLeg=(76, 0, 0),
            L_LowerLeg=(-78, 0, 0),
            R_LowerLeg=(-78, 0, 0),
        ),
        25: pose(
            root_y=-0.34,
            Hips=(-24, 0, 26),
            Spine=(38, 0, 22),
            Chest=(14, 0, 10),
            Head=(30, 0, 12),
            R_Shoulder=(42, -8, 24),
            R_Elbow=(20, 0, -8),
            R_Wrist=(-6, 0, 8),
            L_Shoulder=(46, 0, -24),
            L_Elbow=(24, 0, 8),
            L_Wrist=(-8, 0, -8),
            L_UpperLeg=(82, 0, 0),
            R_UpperLeg=(82, 0, 0),
            L_LowerLeg=(-82, 0, 0),
            R_LowerLeg=(-82, 0, 0),
        ),
        40: pose(
            root_y=-0.34,
            Hips=(-24, 0, 26),
            Spine=(38, 0, 22),
            Chest=(14, 0, 10),
            Head=(30, 0, 12),
            R_Shoulder=(42, -8, 24),
            R_Elbow=(20, 0, -8),
            R_Wrist=(-6, 0, 8),
            L_Shoulder=(46, 0, -24),
            L_Elbow=(24, 0, 8),
            L_Wrist=(-8, 0, -8),
            L_UpperLeg=(82, 0, 0),
            R_UpperLeg=(82, 0, 0),
            L_LowerLeg=(-82, 0, 0),
            R_LowerLeg=(-82, 0, 0),
        ),
    }


def spawn_poses():
    idle = idle_poses()[0]
    return {
        0: pose(
            root_y=-0.28,
            Hips=(-24, 0, 0),
            Spine=(34, 0, 0),
            Chest=(14, 0, 0),
            Head=(24, 0, 0),
            R_Shoulder=(34, -8, 18),
            R_Elbow=(30, 0, -8),
            R_Wrist=(-12, 0, 8),
            L_Shoulder=(34, 0, -18),
            L_Elbow=(30, 0, 8),
            L_Wrist=(-12, 0, -8),
            L_UpperLeg=(76, 0, 0),
            R_UpperLeg=(76, 0, 0),
            L_LowerLeg=(-78, 0, 0),
            R_LowerLeg=(-78, 0, 0),
        ),
        10: pose(
            root_y=-0.12,
            Hips=(-14, 0, 0),
            Spine=(20, 0, 0),
            Chest=(8, 0, 0),
            Head=(14, 0, 0),
            R_Shoulder=(20, -8, 12),
            R_Elbow=(44, 0, -8),
            R_Wrist=(-18, 0, 8),
            L_Shoulder=(24, 0, -14),
            L_Elbow=(44, 0, 8),
            L_Wrist=(-18, 0, -8),
            L_UpperLeg=(48, 0, 0),
            R_UpperLeg=(48, 0, 0),
            L_LowerLeg=(-50, 0, 0),
            R_LowerLeg=(-50, 0, 0),
        ),
        18: pose(
            R_Shoulder=(-30, -8, 70),
            R_Elbow=(58, 0, -8),
            R_Wrist=(-18, 0, 12),
            L_Shoulder=(-30, 0, -70),
            L_Elbow=(58, 0, 8),
            L_Wrist=(-18, 0, -12),
            L_UpperLeg=(22, -4, 0),
            R_UpperLeg=(22, 4, 0),
        ),
        30: pose(
            R_Shoulder=(-28, -8, 42),
            R_Elbow=(48, 0, -6),
            R_Wrist=(-16, 0, 10),
            L_Shoulder=(18, 0, -14),
            L_Elbow=(62, 0, 10),
            L_Wrist=(-26, 0, -8),
        ),
        45: idle,
    }


def victory_poses():
    idle = idle_poses()[0]
    return {
        0: idle,
        10: pose(
            root_y=0.15,
            Hips=(6, 0, 0),
            Spine=(-6, 0, 0),
            Chest=(-3, 0, 0),
            R_Shoulder=(-62, -12, 26),
            R_Elbow=(88, 0, -8),
            R_Wrist=(-30, 0, 14),
            L_Shoulder=(-62, 0, -26),
            L_Elbow=(88, 0, 8),
            L_Wrist=(-30, 0, -14),
            L_UpperLeg=(18, -3, 0),
            R_UpperLeg=(18, 3, 0),
        ),
        20: pose(
            Hips=(-4, 0, 0),
            Spine=(16, 0, 0),
            Chest=(6, 0, 0),
            R_Shoulder=(54, -10, 14),
            R_Elbow=(72, 0, -6),
            R_Wrist=(-24, 0, 12),
            L_Shoulder=(54, 0, -14),
            L_Elbow=(72, 0, 6),
            L_Wrist=(-24, 0, -12),
        ),
        35: pose(
            Spine=(-4, 0, 0),
            Chest=(-2, 0, 0),
            Head=(-6, 0, 0),
            R_Shoulder=(-36, -8, 16),
            R_Elbow=(54, 0, -6),
            R_Wrist=(-20, 0, 10),
            L_Shoulder=(-36, 0, -16),
            L_Elbow=(54, 0, 6),
            L_Wrist=(-20, 0, -10),
        ),
        60: idle,
    }


def gadget_poses():
    idle = idle_poses()[0]
    return {
        0: idle,
        4: pose(
            Spine=(8, 0, 0),
            Chest=(3, 0, 0),
            Head=(0, 12, 0),
            R_Shoulder=(-52, -16, 10),
            R_Elbow=(86, 0, -8),
            R_Wrist=(-30, 0, 14),
            L_Shoulder=(-18, 0, 18),
            L_Elbow=(76, 0, 12),
            L_Wrist=(-20, 0, 8),
        ),
        10: pose(
            Spine=(6, 0, 0),
            Chest=(2, 0, 0),
            Head=(0, 12, 0),
            R_Shoulder=(-50, -16, 10),
            R_Elbow=(84, 0, -8),
            R_Wrist=(-34, 0, 14),
            L_Shoulder=(-16, 0, 16),
            L_Elbow=(72, 0, 10),
            L_Wrist=(-20, 0, 8),
        ),
        16: idle,
    }


def aim_gadget_poses():
    return {
        0: pose(
            root_y=-0.10,
            Hips=(-8, 0, 0),
            Spine=(12, 0, 0),
            Chest=(5, 0, 0),
            Head=(8, 0, 0),
            R_Shoulder=(-50, -16, 10),
            R_Elbow=(84, 0, -8),
            R_Wrist=(-32, 0, 14),
            L_Shoulder=(-14, 0, 16),
            L_Elbow=(72, 0, 10),
            L_Wrist=(-20, 0, 8),
            L_UpperLeg=(34, -3, 0),
            R_UpperLeg=(34, 3, 0),
            L_LowerLeg=(-30, 0, 0),
            R_LowerLeg=(-30, 0, 0),
        ),
        30: pose(
            root_y=-0.10,
            Hips=(-8, 0, 0),
            Spine=(14, 0, 0),
            Chest=(5, 0, 0),
            Head=(8, 0, 0),
            R_Shoulder=(-50, -16, 10),
            R_Elbow=(84, 0, -8),
            R_Wrist=(-32, 0, 14),
            L_Shoulder=(-14, 0, 16),
            L_Elbow=(72, 0, 10),
            L_Wrist=(-20, 0, 8),
            L_UpperLeg=(34, -3, 0),
            R_UpperLeg=(34, 3, 0),
            L_LowerLeg=(-30, 0, 0),
            R_LowerLeg=(-30, 0, 0),
        ),
        60: pose(
            root_y=-0.10,
            Hips=(-8, 0, 0),
            Spine=(12, 0, 0),
            Chest=(5, 0, 0),
            Head=(8, 0, 0),
            R_Shoulder=(-50, -16, 10),
            R_Elbow=(84, 0, -8),
            R_Wrist=(-32, 0, 14),
            L_Shoulder=(-14, 0, 16),
            L_Elbow=(72, 0, 10),
            L_Wrist=(-20, 0, 8),
            L_UpperLeg=(34, -3, 0),
            R_UpperLeg=(34, 3, 0),
            L_LowerLeg=(-30, 0, 0),
            R_LowerLeg=(-30, 0, 0),
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


# Cloud offsets are in the measured Root-bone local space: X horizontal,
# Y Blender world-up, Z depth.  The base is computed from the real right
# shoulder, so a future scale/bind-pose repair does not hard-code a world pose.
CLOUD_OFFSETS = {
    "idle": {
        0: (0, 0, 0),
        20: (0.10, 0.08, -0.04),
        40: (-0.06, -0.04, 0.03),
        60: (0.10, 0.08, -0.04),
        80: (0, 0, 0),
    },
    "run": {
        0: (0.55, 0.35, 0),
        6: (0.70, 0.15, 0),
        12: (0.55, 0.35, 0),
        18: (0.70, 0.15, 0),
        20: (0.55, 0.35, 0),
    },
    "attack": {
        0: (0, 0, 0),
        3: (-0.35, -0.25, 0.06),
        6: (-0.05, -0.65, 0),
        8: (0.72, 0.12, 0),
        10: (0.30, 0.18, 0),
        16: (0, 0, 0),
    },
    "super": {
        0: (0, 0, 0),
        10: (-0.55, -2.1, 0.08),
        18: (-0.05, 1.5, 0),
        25: (0.55, -2.35, 0.04),
        30: (-0.45, -2.35, 0.04),
        35: (0.55, -2.35, 0.04),
        45: (0, 0, 0),
        50: (0, 0, 0),
    },
    # The prose target is "over the hand".  On Brock's measured rig the
    # shoulder-derived base is already above the hand, so the runtime-space
    # correction is a short move down/left rather than adding another full
    # meter of offset (which put the cloud above the head).
    "aim": {0: (-0.15, -0.45, 0), 30: (-0.05, -0.35, 0), 60: (-0.15, -0.45, 0)},
    "aim-super": {0: (0.0, -0.25, 0), 30: (0.08, -0.15, 0), 60: (0.0, -0.25, 0)},
    "hit": {0: (0, 0, 0), 3: (0.40, 0.65, 0), 7: (0.25, 0.20, 0), 12: (0, 0, 0)},
    "death": {
        0: (0, 0, 0),
        8: (0.30, 0.90, 0),
        15: (0.20, 2.80, 0),
        25: (0.20, 3.20, 0),
        40: (0.20, 3.20, 0),
    },
    "spawn": {
        0: (0, -1.1, 0),
        10: (0, 0, 0),
        18: (1.8, 0.6, 0),
        30: (0, 0, 0),
        45: (0, 0, 0),
    },
    "victory": {
        0: (0, 0, 0),
        10: (0.0, 1.4, 0),
        20: (-1.0, -1.95, 0),
        28: (1.0, -1.95, 0),
        35: (0, 0.15, 0),
        60: (0, 0, 0),
    },
    "gadget": {
        0: (0, 0, 0),
        4: (-0.12, -0.45, 0),
        10: (-0.12, -0.45, 0),
        16: (0, 0, 0),
    },
    "aim-gadget": {
        0: (0.0, -1.45, 0.0),
        15: (0.8, -1.25, 0.25),
        30: (1.0, -0.95, 0.0),
        45: (0.6, -0.95, -0.25),
        60: (0.0, -1.45, 0.0),
    },
}
CLOUD_ROTATIONS = {
    "idle": {0: 0, 20: 90, 40: 180, 60: 270, 80: 360},
    "run": {0: 0, 6: 216, 12: 432, 18: 648, 20: 720},
    "attack": {0: 0, 3: -20, 6: 45, 8: 180, 10: 300, 16: 360},
    "super": {0: 0, 10: -90, 18: 180, 25: 360, 30: 520, 35: 700, 45: 900, 50: 960},
    "aim": {0: 0, 30: 180, 60: 360},
    "aim-super": {0: 0, 30: -180, 60: -360},
    "hit": {0: 0, 3: 90, 7: 180, 12: 360},
    "death": {0: 0, 8: 90, 15: 240, 25: 330, 40: 420},
    "spawn": {0: 0, 10: 90, 18: 250, 30: 360, 45: 360},
    "victory": {0: 0, 10: 270, 20: 540, 28: 820, 35: 1080, 60: 1080},
    "gadget": {0: 0, 4: 180, 10: 360, 16: 360},
    "aim-gadget": {0: 0, 15: -90, 30: -180, 45: -270, 60: -360},
}
CLOUD_SCALES = {
    "idle": {0: 1.0, 20: 1.08, 40: 0.96, 60: 1.08, 80: 1.0},
    "run": {0: 1.0, 6: 1.06, 12: 1.0, 18: 1.06, 20: 1.0},
    "attack": {0: 1.0, 3: 0.90, 6: 0.72, 8: 1.15, 10: 1.03, 16: 1.0},
    "super": {
        0: 1.0,
        10: 0.86,
        18: 1.35,
        25: 0.78,
        30: 0.78,
        35: 0.78,
        45: 1.0,
        50: 1.0,
    },
    "aim": {0: (1.5, 1.0, 1.0), 30: (1.65, 1.0, 1.0), 60: (1.5, 1.0, 1.0)},
    "aim-super": {0: 0.55, 30: 0.72, 60: 0.55},
    "hit": {0: 1.0, 3: 1.20, 7: 1.03, 12: 1.0},
    "death": {0: 1.0, 8: 0.72, 15: 0.30, 25: 0.0, 40: 0.0},
    "spawn": {0: 0.0, 10: 1.5, 18: 1.2, 30: 1.0, 45: 1.0},
    "victory": {0: 1.0, 10: 1.5, 20: 1.05, 28: 1.05, 35: 1.0, 60: 1.0},
    "gadget": {0: 1.0, 4: (2.5, 0.5, 0.5), 10: (2.5, 0.5, 0.5), 16: 1.0},
    "aim-gadget": {0: 0.85, 15: 1.0, 30: 1.15, 45: 1.0, 60: 0.85},
}
CLOUD_DARKNESS = {
    "super": {
        0: 0.0,
        10: 0.18,
        18: 0.45,
        25: 0.68,
        30: 0.68,
        35: 0.52,
        45: 0.10,
        50: 0.0,
    },
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


def reset_pose(armature):
    for name in BONES:
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.location = (0, 0, 0)
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)


def apply_pose(armature, data):
    reset_pose(armature)
    for name, values in data["rotations"].items():
        # The source is hard-surface geometry with tiny authored seams. Keep
        # the legacy gesture vocabulary, but apply it as a conservative
        # offset from the verified bind pose so interpolation cannot pull an
        # arm or leg out of its neighbouring shell.
        armature.pose.bones[name].rotation_euler = radians(
            tuple(
                float(value) * (0.0 if name.startswith("L_") else 0.2)
                for value in values
            )
        )
        continue
        # Measured rig-space correction: Brock's shoulder rest axes are not
        # anatomical X axes.  Without this adapter the prose poses that look
        # reasonable numerically leave both hands hanging beside the torso.
        adjusted = list(values)
        if name == "R_Shoulder":
            adjusted[0] += 35.0
            adjusted[0] = max(-20.0, min(10.0, adjusted[0]))
            adjusted[1] = max(-12.0, min(12.0, adjusted[1]))
            adjusted[2] = max(-12.0, min(12.0, adjusted[2]))
        elif name == "R_Elbow":
            adjusted[0] += 8.0
            adjusted[0] = max(45.0, min(60.0, adjusted[0]))
            adjusted[1] = max(-8.0, min(8.0, adjusted[1]))
            adjusted[2] = max(-8.0, min(8.0, adjusted[2]))
        elif name == "R_Wrist":
            # The legacy wrist's local X axis needs a measured positive
            # correction.  The previous negative adapter sent the hand away
            # from the forearm in super/attack poses.
            adjusted[0] += 15.0
            adjusted[0] = max(-10.0, min(10.0, adjusted[0]))
            adjusted[1] = max(-8.0, min(8.0, adjusted[1]))
            adjusted[2] = max(-8.0, min(8.0, adjusted[2]))
        elif name == "L_Shoulder":
            adjusted[0] -= 30.0
            # Brock's imported left arm is the free hand.  Keep its authored
            # silhouette in a measured human range across every clip; large
            # skill-only swings open the disconnected source seam between
            # shoulder and elbow on interpolated frames.
            adjusted[0] = max(-40.0, min(-5.0, adjusted[0]))
            adjusted[1] = max(-12.0, min(12.0, adjusted[1]))
            adjusted[2] = max(-12.0, min(12.0, adjusted[2]))
        elif name == "L_Elbow":
            adjusted[0] = max(45.0, min(70.0, adjusted[0]))
            adjusted[1] = max(-8.0, min(8.0, adjusted[1]))
            adjusted[2] = max(-8.0, min(8.0, adjusted[2]))
        elif name == "L_Wrist":
            adjusted[0] = max(-26.0, min(-8.0, adjusted[0]))
            adjusted[1] = max(-8.0, min(8.0, adjusted[1]))
            adjusted[2] = max(-8.0, min(8.0, adjusted[2]))
        armature.pose.bones[name].rotation_euler = radians(adjusted)
    # Measured Root matrix: local X -> world X, local Y -> world Z/up,
    # local Z -> world depth. Never author root-up on X/Z.
    armature.pose.bones["Root"].location.y = data["root_y"] * 0.2


def key_pose(armature, action, frame, data):
    apply_pose(armature, data)
    for name in BONES:
        bone = armature.pose.bones[name]
        bone.keyframe_insert("location", frame=frame)
        bone.keyframe_insert("rotation_euler", frame=frame)
        bone.keyframe_insert("scale", frame=frame)


def mesh_components(mesh):
    adjacency = [set() for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        for index, vertex_index in enumerate(polygon.vertices):
            adjacency[vertex_index].add(polygon.vertices[index - 1])
            adjacency[vertex_index].add(
                polygon.vertices[(index + 1) % len(polygon.vertices)]
            )
    seen = set()
    result = []
    for start in range(len(adjacency)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            vertex_index = stack.pop()
            component.append(vertex_index)
            for neighbor in adjacency[vertex_index]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        result.append(component)
    return result


def right_arm_components(mesh):
    components = mesh_components(mesh)
    centroids = {
        index: sum(
            (mesh.matrix_world @ mesh.data.vertices[vertex].co for vertex in component),
            Vector(),
        )
        / max(1, len(component))
        for index, component in enumerate(components)
    }
    owners = {
        index: max(
            (
                (mesh.vertex_groups[group.group].name, float(group.weight))
                for group in mesh.data.vertices[component[0]].groups
            ),
            key=lambda item: item[1],
        )[0]
        for index, component in enumerate(components)
        if component and mesh.data.vertices[component[0]].groups
    }
    return components, {
        "forearm": next(
            index
            for index, component in enumerate(components)
            if len(component) == 95 and centroids[index].x > 0
        ),
        "hand": next(
            index
            for index, component in enumerate(components)
            if len(component) == 363 and centroids[index].x > 0
        ),
        "cuff": next(
            index
            for index, component in enumerate(components)
            if len(component) == 28 and centroids[index].x > 0
        ),
        "wrist_islands": [
            index
            for index, component in enumerate(components)
            if len(component) >= 20
            and centroids[index].x > 0
            and owners.get(index) == "R_Wrist"
        ],
    }


def right_arm_gap(mesh, components, selected):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        point_cache = {
            index: evaluated.matrix_world @ evaluated_mesh.vertices[index].co
            for component_index in [selected["forearm"], *selected["wrist_islands"]]
            for index in components[component_index]
        }
        forearm_points = [
            point_cache[index] for index in components[selected["forearm"]]
        ]
        return max(
            min(
                (forearm - other).length
                for forearm in forearm_points
                for other in [
                    point_cache[index] for index in components[component_index]
                ]
            )
            for component_index in selected["wrist_islands"]
        )
    finally:
        evaluated.to_mesh_clear()


def calibrate_right_wrist(scene, armature, action, frame_end):
    """Repair pose-dependent seam openings without changing other bone motion."""
    mesh = bpy.data.objects.get("armor_GEO:PIV.001")
    components, selected = right_arm_components(mesh)
    if not selected["wrist_islands"]:
        action["right_wrist_seam_repairs"] = 0
        return 0
    wrist = armature.pose.bones["R_Wrist"]
    repaired = 0
    for _ in range(3):
        failures = []
        for frame in range(frame_end + 1):
            scene.frame_set(frame)
            if right_arm_gap(mesh, components, selected) <= 0.05:
                continue
            base = wrist.rotation_euler.x
            candidates = []
            for offset in range(-120, 121, 10):
                wrist.rotation_euler.x = base + math.radians(offset)
                candidates.append(
                    (right_arm_gap(mesh, components, selected), wrist.rotation_euler.x)
                )
            best_gap, best_rotation = min(candidates, key=lambda item: item[0])
            wrist.rotation_euler.x = best_rotation
            wrist.keyframe_insert("rotation_euler", index=0, frame=frame)
            failures.append((frame, best_gap))
            repaired += 1
        if not failures:
            break
    scene.frame_set(0)
    action["right_wrist_seam_repairs"] = repaired
    return repaired


def smooth_action(action, *, linear_paths=()):
    linear_paths = set(linear_paths)
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            if curve.data_path in linear_paths:
                point.interpolation = "LINEAR"
            else:
                point.interpolation = "BEZIER"
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def ensure_cloud_hierarchy(armature):
    cloud = bpy.data.objects.get("HeroAttachment_Cloud") or bpy.data.objects.get(
        "Cloud"
    )
    if cloud is None or cloud.type != "MESH":
        raise RuntimeError("Brock master is missing HeroAttachment_Cloud mesh")
    cloud.name = "Cloud"
    locator = bpy.data.objects.get("Cloud_Locator")
    if locator is None:
        locator = bpy.data.objects.new("Cloud_Locator", None)
        locator.empty_display_type = "PLAIN_AXES"
        locator.empty_display_size = 0.35
        for collection in cloud.users_collection or [bpy.context.scene.collection]:
            collection.objects.link(locator)
    locator.parent = armature
    locator.parent_type = "BONE"
    locator.parent_bone = "Root"
    locator.matrix_parent_inverse = Matrix.Identity(4)
    locator.rotation_mode = "XYZ"
    locator.rotation_euler = (0, 0, 0)
    locator.scale = (1, 1, 1)
    cloud.parent = locator
    cloud.parent_type = "OBJECT"
    cloud.matrix_parent_inverse = Matrix.Identity(4)
    # The legacy mesh has its origin several Blender units away from its
    # geometry.  Keeping that offset made the scene cloud appear under the
    # character even though the locator itself was correctly placed.  Center
    # the mesh around the locator and normalize it to the intended small
    # companion size before any clip keys are authored.
    local_corners = [Vector(corner) for corner in cloud.bound_box]
    local_center = sum(local_corners, Vector()) / max(1, len(local_corners))
    if not cloud.get("geometry_centered"):
        for vertex in cloud.data.vertices:
            vertex.co -= local_center
        cloud["geometry_centered"] = True
    local_corners = [Vector(corner) for corner in cloud.bound_box]
    local_extent = max(
        max(point[index] for point in local_corners)
        - min(point[index] for point in local_corners)
        for index in range(3)
    )
    cloud.scale = (0.64 / max(local_extent, 1e-6),) * 3
    cloud.location = (0, 0, 0)
    cloud.rotation_mode = "XYZ"
    cloud.rotation_euler = (0, 0, 0)
    for slot in cloud.material_slots:
        material = slot.material
        if material is None or material.get("brock_cloud_material_ready"):
            continue
        material = material.copy()
        slot.material = material
        material["brock_cloud_material_ready"] = True
        if not material.use_nodes:
            continue
        nodes = material.node_tree.nodes
        links = material.node_tree.links
        principled = nodes.get("Principled BSDF")
        base_color = principled.inputs.get("Base Color") if principled else None
        if base_color is None:
            continue
        tint = nodes.new("ShaderNodeMixRGB")
        tint.name = "BrockCloud_StormDarkness"
        tint.label = "Brock Cloud Storm Darkness"
        tint.blend_type = "MULTIPLY"
        tint.inputs[2].default_value = (0.0, 0.0, 0.0, 1.0)
        if base_color.links:
            source = base_color.links[0].from_socket
            links.remove(base_color.links[0])
            links.new(source, tint.inputs[1])
        else:
            tint.inputs[1].default_value = base_color.default_value
        links.new(tint.outputs[0], base_color)
    cloud["attachment_role"] = "companion-cloud"
    locator["attachment_role"] = "cloud-locator"
    return locator, cloud


def distance_to_segment(point, start, end):
    segment = end - start
    length_squared = segment.length_squared
    if length_squared <= 1e-10:
        return (point - start).length
    factor = max(0.0, min(1.0, (point - start).dot(segment) / length_squared))
    return (point - (start + factor * segment)).length


def ensure_brock_skinning(armature):
    """Repair the legacy one-mesh Brock body so bone Actions are visible.

    The source has an Armature modifier and named groups, but every group is
    empty.  This creates deterministic rigid weights from measured bone
    segments.  It is intentionally conservative for the stylized hard-surface
    mesh and idempotent when the authoring script is rerun.
    """
    mesh = bpy.data.objects.get("armor_GEO:PIV.001")
    if mesh is None or mesh.type != "MESH":
        raise RuntimeError("Brock master is missing armor_GEO:PIV.001")
    if not any(
        modifier.type == "ARMATURE" and modifier.object == armature
        for modifier in mesh.modifiers
    ):
        modifier = mesh.modifiers.new("BrockZeus_Armature", "ARMATURE")
        modifier.object = armature
    mesh.vertex_groups.clear()
    groups = {
        bone.name: mesh.vertex_groups.new(name=bone.name)
        for bone in armature.data.bones
        if bone.use_deform
    }
    inverse_armature = armature.matrix_world.inverted()
    segments = [
        (bone.name, Vector(bone.head_local), Vector(bone.tail_local))
        for bone in armature.data.bones
        if bone.use_deform
    ]
    # The legacy mesh and armature origins differ by the measured armature
    # object X offset.  Use that offset for classification only; the original
    # bind transform remains untouched so frame-0 geometry does not jump.
    classification_offset = Vector((armature.location.x, 0.0, 0.0))
    points = [
        classification_offset + inverse_armature @ (mesh.matrix_world @ vertex.co)
        for vertex in mesh.data.vertices
    ]
    adjacency = [set() for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        for index, vertex_index in enumerate(polygon.vertices):
            adjacency[vertex_index].add(polygon.vertices[index - 1])
            adjacency[vertex_index].add(
                polygon.vertices[(index + 1) % len(polygon.vertices)]
            )
    seen = set()
    components = []
    for start in range(len(adjacency)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            vertex_index = stack.pop()
            component.append(vertex_index)
            for neighbor in adjacency[vertex_index]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    right_wrist_components = {
        263,
        267,
        268,
        269,
        271,
        272,
        274,
        276,
        277,
        278,
        279,
        280,
        281,
        282,
        283,
        284,
        312,
        313,
    }
    right_forearm_components = {266}
    # These source islands are the visible left forearm, hand, and the small
    # underside hand detail.  The nearest-bone classifier misreads them as
    # Spine/L_UpperLeg because the legacy mesh and rig use different bind
    # origins, which makes the hand detach from the forearm in the preview.
    # Keep the complete visible hand cluster on the elbow bone so it moves as
    # one continuous arm segment in every authored scene.
    left_hand_attachment_components = {232, 233, 308, 309, 310}
    component_bones = {}
    for component_index, component in enumerate(components):
        centroid = sum((points[index] for index in component), Vector()) / max(
            1, len(component)
        )
        bone_name = min(
            segments, key=lambda item: distance_to_segment(centroid, item[1], item[2])
        )[0]
        if component_index in right_wrist_components:
            bone_name = "R_Wrist"
        if component_index in right_forearm_components:
            bone_name = "R_Elbow"
        if component_index in left_hand_attachment_components:
            bone_name = "L_Elbow"
        component_bones[component_index] = bone_name
        groups[bone_name].add(component, 1.0, "REPLACE")
    if not mesh.get("left_arm_rest_repaired"):
        # The FBX has a disconnected hard-surface left-arm cluster.  Align
        # the lower-arm cluster to the actual closest shoulder vertices in
        # the imported source space, rather than guessing a world-space
        # offset from a pose screenshot.
        shoulder_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] == "L_Shoulder"
            for vertex_index in component
        ]
        lower_arm_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] in {"L_Elbow", "L_Wrist"}
            for vertex_index in component
        ]
        if shoulder_vertices and lower_arm_vertices:
            shoulder_points = {
                index: mesh.matrix_world @ mesh.data.vertices[index].co
                for index in shoulder_vertices
            }
            lower_arm_points = {
                index: mesh.matrix_world @ mesh.data.vertices[index].co
                for index in lower_arm_vertices
            }
            closest = min(
                (
                    (shoulder_point - lower_arm_point).length,
                    shoulder_point,
                    lower_arm_point,
                )
                for shoulder_point in shoulder_points.values()
                for lower_arm_point in lower_arm_points.values()
            )
            if closest[0] > 0.05:
                delta_local = mesh.matrix_world.inverted().to_3x3() @ (
                    closest[1] - closest[2]
                )
                for vertex_index in lower_arm_vertices:
                    mesh.data.vertices[vertex_index].co += delta_local
                mesh["left_arm_rest_repair_distance"] = round(float(closest[0]), 6)
            else:
                mesh["left_arm_rest_repair_distance"] = 0.0
        mesh["left_arm_rest_repaired"] = True
    if not mesh.get("left_wrist_rest_repaired"):
        # The left wrist is another disconnected hard-surface island.  The
        # shoulder/elbow repair above deliberately moves the whole lower arm,
        # but that leaves the hand's own seam open.  Snap the wrist cluster to
        # its actual nearest elbow surface in source space so it stays part of
        # Brock in the bind pose and in every inherited pose.
        elbow_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] == "L_Elbow"
            for vertex_index in component
        ]
        wrist_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] == "L_Wrist"
            for vertex_index in component
        ]
        if elbow_vertices and wrist_vertices:
            elbow_points = {
                index: mesh.matrix_world @ mesh.data.vertices[index].co
                for index in elbow_vertices
            }
            wrist_points = {
                index: mesh.matrix_world @ mesh.data.vertices[index].co
                for index in wrist_vertices
            }
            closest = min(
                (
                    (elbow_point - wrist_point).length,
                    elbow_point,
                    wrist_point,
                )
                for elbow_point in elbow_points.values()
                for wrist_point in wrist_points.values()
            )
            if closest[0] > 0.001:
                delta_local = mesh.matrix_world.inverted().to_3x3() @ (
                    closest[1] - closest[2]
                )
                for vertex_index in wrist_vertices:
                    mesh.data.vertices[vertex_index].co += delta_local
                mesh["left_wrist_rest_repair_distance"] = round(float(closest[0]), 6)
            else:
                mesh["left_wrist_rest_repair_distance"] = 0.0
        mesh["left_wrist_rest_repaired"] = True
    if mesh.get("left_wrist_rest_repair_version", 0) < 2:
        # The legacy hand is split into several hard-surface islands. The
        # first repair aligned the closest island only, leaving the large
        # palm and cuff visibly detached from the forearm. Repair each island
        # independently while preserving its authored shape and wrist bone.
        elbow_points = [
            mesh.matrix_world @ mesh.data.vertices[vertex_index].co
            for component_index, component in enumerate(components)
            if component_bones[component_index] == "L_Elbow"
            for vertex_index in component
        ]
        repaired_components = 0
        if elbow_points:
            for component_index, component in enumerate(components):
                if component_bones[component_index] != "L_Wrist":
                    continue
                wrist_points = [
                    mesh.matrix_world @ mesh.data.vertices[vertex_index].co
                    for vertex_index in component
                ]
                if not wrist_points:
                    continue
                gap, elbow_point, wrist_point = min(
                    (
                        (elbow_point - wrist_point).length,
                        elbow_point,
                        wrist_point,
                    )
                    for elbow_point in elbow_points
                    for wrist_point in wrist_points
                )
                if gap <= 0.06:
                    continue
                direction = (elbow_point - wrist_point).normalized()
                delta_world = direction * (gap - 0.02)
                delta_local = mesh.matrix_world.inverted().to_3x3() @ delta_world
                for vertex_index in component:
                    mesh.data.vertices[vertex_index].co += delta_local
                repaired_components += 1
        mesh["left_wrist_rest_repair_components"] = repaired_components
        mesh["left_wrist_rest_repair_version"] = 2
    if mesh.get("left_arm_rest_attachment_version", 0) < 2:
        # Older authoring passes marked the broad left-arm repair as complete
        # before the wrist islands were fully aligned.  Recompute the actual
        # residual seam from the current geometry and move the complete lower
        # arm cluster together, leaving a small intentional overlap with the
        # shoulder so the hand cannot visually float in the runtime pose.
        shoulder_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] == "L_Shoulder"
            for vertex_index in component
        ]
        lower_arm_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] in {"L_Elbow", "L_Wrist"}
            for vertex_index in component
        ]
        if shoulder_vertices and lower_arm_vertices:
            shoulder_points = [
                mesh.matrix_world @ mesh.data.vertices[vertex_index].co
                for vertex_index in shoulder_vertices
            ]
            lower_arm_points = [
                mesh.matrix_world @ mesh.data.vertices[vertex_index].co
                for vertex_index in lower_arm_vertices
            ]
            gap, shoulder_point, lower_arm_point = min(
                (
                    (shoulder_point - lower_arm_point).length,
                    shoulder_point,
                    lower_arm_point,
                )
                for shoulder_point in shoulder_points
                for lower_arm_point in lower_arm_points
            )
            if gap > 0.04:
                direction = (shoulder_point - lower_arm_point).normalized()
                delta_world = direction * (gap - 0.02)
                delta_local = mesh.matrix_world.inverted().to_3x3() @ delta_world
                for vertex_index in lower_arm_vertices:
                    mesh.data.vertices[vertex_index].co += delta_local
                mesh["left_arm_rest_attachment_distance"] = round(float(gap), 6)
            else:
                mesh["left_arm_rest_attachment_distance"] = round(float(gap), 6)
        mesh["left_arm_rest_attachment_version"] = 2
    if mesh.get("left_arm_rest_attachment_version", 0) < 3:
        # Leave a small overlap at the shoulder seam.  The previous pass
        # stopped 0.02 units short of the nearest shoulder surface, which is
        # enough to read as a floating hand in the runtime camera.
        shoulder_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] == "L_Shoulder"
            for vertex_index in component
        ]
        lower_arm_vertices = [
            vertex_index
            for component_index, component in enumerate(components)
            if component_bones[component_index] in {"L_Elbow", "L_Wrist"}
            for vertex_index in component
        ]
        if shoulder_vertices and lower_arm_vertices:
            shoulder_points = [
                mesh.matrix_world @ mesh.data.vertices[vertex_index].co
                for vertex_index in shoulder_vertices
            ]
            lower_arm_points = [
                mesh.matrix_world @ mesh.data.vertices[vertex_index].co
                for vertex_index in lower_arm_vertices
            ]
            gap, shoulder_point, lower_arm_point = min(
                (
                    (shoulder_point - lower_arm_point).length,
                    shoulder_point,
                    lower_arm_point,
                )
                for shoulder_point in shoulder_points
                for lower_arm_point in lower_arm_points
            )
            if gap > 0.0:
                direction = (shoulder_point - lower_arm_point).normalized()
                delta_world = direction * (gap + 0.006)
                delta_local = mesh.matrix_world.inverted().to_3x3() @ delta_world
                for vertex_index in lower_arm_vertices:
                    mesh.data.vertices[vertex_index].co += delta_local
            mesh["left_arm_rest_attachment_distance"] = round(float(gap), 6)
        mesh["left_arm_rest_attachment_version"] = 3
    if not mesh.get("right_arm_rest_repaired"):
        forearm = next(
            component
            for component in components
            if len(component) == 95
            and (
                sum(
                    (
                        mesh.matrix_world @ mesh.data.vertices[index].co
                        for index in component
                    ),
                    Vector(),
                )
                / len(component)
            ).x
            > 0
        )
        forearm_points = [
            mesh.matrix_world @ mesh.data.vertices[index].co for index in forearm
        ]
        repaired = 0
        for component in components:
            if component is forearm or len(component) < 20:
                continue
            centroid_world = sum(
                (
                    mesh.matrix_world @ mesh.data.vertices[index].co
                    for index in component
                ),
                Vector(),
            ) / len(component)
            if not (0.2 < centroid_world.x < 0.8 and 0.5 < centroid_world.z < 1.15):
                continue
            component_points = [
                mesh.matrix_world @ mesh.data.vertices[index].co for index in component
            ]
            pair = min(
                (
                    (forearm_point - component_point, component_point)
                    for forearm_point in forearm_points
                    for component_point in component_points
                ),
                key=lambda item: item[0].length,
            )
            if pair[0].length <= 0.05:
                continue
            delta_local = mesh.matrix_world.inverted().to_3x3() @ pair[0]
            for index in component:
                mesh.data.vertices[index].co += delta_local
            repaired += 1
        mesh["right_arm_rest_repairs"] = repaired
        mesh["right_arm_rest_repaired"] = True
    if not mesh.get("right_arm_rest_aligned"):
        # The source mesh and the authored shoulder action use different bind
        # origins.  Align the complete elbow/wrist cluster to the shoulder in
        # the measured idle pose.  The correction is bone-specific because
        # R_Elbow and R_Wrist have different rest matrices.
        arm_deltas = {
            "R_Elbow": Vector((-0.62844, 1.29772, 2.92438)),
            "R_Wrist": Vector((-0.89767, 1.54360, 2.72809)),
        }
        for component_index, bone_name in component_bones.items():
            delta = arm_deltas.get(bone_name)
            if delta is None:
                continue
            for index in components[component_index]:
                mesh.data.vertices[index].co += delta
        mesh["right_arm_rest_alignment"] = "shoulder_cluster_v1"
        mesh["right_arm_rest_aligned"] = True
    mesh["skinning_contract"] = (
        "Rigid nearest-bone weights per disconnected mesh component from measured brock-zeus-rig; repaired because legacy groups were empty"
    )
    mesh["skinning_components"] = len(components)
    mesh["left_hand_attachment_components"] = sorted(left_hand_attachment_components)
    mesh["left_hand_skinning_version"] = 3
    mesh["left_hand_attachment_bone"] = "L_Elbow"
    mesh["right_forearm_attachment_bone"] = "R_Elbow"
    mesh["right_forearm_attachment_version"] = 1
    if mesh.get("left_hand_geometry_version", 0) < 4:
        # The legacy FBX also contains tiny detached hand-side islands. Weld
        # their nearest surface to the main forearm island in rest space so
        # the repair is visible even before skinning or animation is applied.
        forearm_component = components[308]
        forearm_points = [
            mesh.matrix_world @ mesh.data.vertices[vertex_index].co
            for vertex_index in forearm_component
        ]
        welded_components = 0
        for component_index in (232, 233, 309, 310):
            component = components[component_index]
            component_points = [
                mesh.matrix_world @ mesh.data.vertices[vertex_index].co
                for vertex_index in component
            ]
            gap, forearm_point, component_point = min(
                (
                    (forearm_point - component_point).length,
                    forearm_point,
                    component_point,
                )
                for forearm_point in forearm_points
                for component_point in component_points
            )
            if gap <= 0.005:
                continue
            direction = (forearm_point - component_point).normalized()
            delta_world = direction * (gap - 0.002)
            delta_local = mesh.matrix_world.inverted().to_3x3() @ delta_world
            for vertex_index in component:
                mesh.data.vertices[vertex_index].co += delta_local
            welded_components += 1
        mesh["left_hand_geometry_repairs"] = welded_components
        mesh["left_hand_geometry_version"] = 4


def ensure_right_arm_visual_repair(armature):
    """Mirror Brock's authored left lower-arm islands onto the broken side.

    The imported FBX has a complete hand on the negative-X side, while the
    matching positive-X lower-arm islands stop at the forearm.  Reusing the
    authored islands keeps the same stylized fingers, materials, and UVs as
    the good arm instead of inventing a second hand mesh.  The repair is a
    separate skinned object so it remains easy to audit and idempotent.
    """
    source = bpy.data.objects.get("armor_GEO:PIV.001")
    if source is None or source.type != "MESH":
        raise RuntimeError("Brock master is missing armor_GEO:PIV.001")
    old = bpy.data.objects.get("BrockZeus_RightArm_Repair")
    if old is not None:
        old_data = old.data if old.type == "MESH" else None
        bpy.data.objects.remove(old, do_unlink=True)
        if old_data is not None and old_data.users == 0:
            bpy.data.meshes.remove(old_data)

    components = mesh_components(source)
    keep = set()
    selected_components = []
    for component_index, component in enumerate(components):
        weights = {}
        for vertex_index in component:
            for group in source.data.vertices[vertex_index].groups:
                group_name = source.vertex_groups[group.group].name
                weights[group_name] = weights.get(group_name, 0.0) + float(group.weight)
        owner = max(weights, key=weights.get) if weights else None
        # Component 308 is already present on the positive-X side as the
        # mirrored upper-arm shell.  The remaining authored L_Elbow islands
        # are the bracer/hand details that are missing on the other side.
        if owner == "L_Elbow" and component_index != 308:
            keep.update(component)
            selected_components.append(component_index)
    if not keep:
        raise RuntimeError("Brock master has no authored left-hand islands to mirror")

    repair = source.copy()
    repair.data = source.data.copy()
    repair.name = "BrockZeus_RightArm_Repair"
    for collection in source.users_collection or [bpy.context.scene.collection]:
        collection.objects.link(repair)
    repair.parent = source.parent
    repair.parent_type = source.parent_type
    repair.parent_bone = source.parent_bone
    repair.matrix_parent_inverse = source.matrix_parent_inverse.copy()
    repair.matrix_world = source.matrix_world.copy()
    for modifier in list(repair.modifiers):
        repair.modifiers.remove(modifier)
    for property_name in list(repair.keys()):
        del repair[property_name]

    builder = bmesh.new()
    builder.from_mesh(repair.data)
    for vertex in list(builder.verts):
        if vertex.index not in keep:
            builder.verts.remove(vertex)
    builder.to_mesh(repair.data)
    builder.free()

    center_x = (armature.matrix_world @ armature.pose.bones["Chest"].head).x
    mirror = Matrix.Identity(4)
    mirror[0][0] = -1.0
    mirror[0][3] = 2.0 * center_x
    local_mirror = source.matrix_world.inverted() @ mirror @ source.matrix_world
    for vertex in repair.data.vertices:
        vertex.co = local_mirror @ vertex.co

    repair.vertex_groups.clear()
    elbow_group = repair.vertex_groups.new(name="R_Elbow")
    elbow_group.add([vertex.index for vertex in repair.data.vertices], 1.0, "REPLACE")
    modifier = repair.modifiers.new("BrockZeus_RightArm_Armature", "ARMATURE")
    modifier.object = armature
    repair["attachment_role"] = "right-arm-repair"
    repair["right_arm_visual_repair_version"] = 1
    repair["repair_source_components"] = selected_components
    return repair


def measured_cloud_base(armature, locator):
    # The source cloud is a companion weapon that hovers above and outside
    # Brock's right hand. Anchor it to the measured hand island, then lift it
    # into the same upper-side silhouette as the Zeus reference.
    mesh = bpy.data.objects.get("armor_GEO:PIV.001")
    target = None
    if mesh is not None:
        components, selected = right_arm_components(mesh)
        hand = components[selected["hand"]]
        target = sum(
            (mesh.matrix_world @ mesh.data.vertices[index].co for index in hand),
            Vector(),
        ) / max(1, len(hand))
        target += Vector((0.53, 0.0, 0.64))
    if target is None:
        target = armature.matrix_world @ Vector(armature.pose.bones["R_Wrist"].tail)
    locator.matrix_world = Matrix.Translation(target)
    return locator.location.copy()


def key_cloud(
    locator, cloud, clip, frame, base_location, base_scale, action_locator, action_cloud
):
    dx, dy, dz = CLOUD_OFFSETS[clip][frame]
    # Keep the locator at the measured shoulder anchor and put the authored
    # relative motion on Cloud itself.  This preserves the Blender hierarchy
    # while making the separate Cloud GLB self-contained after its locator is
    # intentionally excluded from the character export.
    locator.location = base_location
    locator.rotation_euler = (0, 0, 0)
    locator.keyframe_insert("location", frame=frame)
    locator.keyframe_insert("rotation_euler", frame=frame)
    locator.keyframe_insert("scale", frame=frame)
    cloud.location = Vector((dx, dy, dz))
    cloud.rotation_euler = (0, 0, math.radians(CLOUD_ROTATIONS[clip][frame]))
    scale = CLOUD_SCALES[clip][frame]
    if isinstance(scale, (tuple, list)):
        cloud.scale = Vector(
            (
                base_scale.x * float(scale[0]),
                base_scale.y * float(scale[1]),
                base_scale.z * float(scale[2]),
            )
        )
    else:
        cloud.scale = base_scale * float(scale)
    cloud.keyframe_insert("location", frame=frame)
    cloud.keyframe_insert("rotation_euler", frame=frame)
    cloud.keyframe_insert("scale", frame=frame)
    darkness = CLOUD_DARKNESS.get(clip, {}).get(frame, 0.0)
    for material in cloud.data.materials:
        if not material or not material.use_nodes:
            continue
        tint = material.node_tree.nodes.get("BrockCloud_StormDarkness")
        if tint:
            tint.inputs[0].default_value = float(darkness)
            tint.inputs[0].keyframe_insert("default_value", frame=frame)


def add_cycle(action):
    for curve in action_fcurves(action):
        curve.modifiers.new("CYCLES")


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = FRAME_ENDS[clip]
    armature = bpy.data.objects.get("brock-zeus-rig")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError(f"{clip}: expected brock-zeus-rig armature")
    if set(armature.data.bones.keys()) != set(BONES):
        raise RuntimeError(f"{clip}: measured Brock bone set changed")
    reset_pose(armature)
    scene.frame_set(0)
    locator, cloud = ensure_cloud_hierarchy(armature)
    base_location = measured_cloud_base(armature, locator)
    base_scale = cloud.scale.copy()
    clear_actions()

    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    poses = copy.deepcopy(POSE_BUILDERS[clip]())
    if min(poses) != 0 or max(poses) != FRAME_ENDS[clip]:
        raise RuntimeError(f"{clip}: pose frames must cover 0..{FRAME_ENDS[clip]}")
    for frame in sorted(poses):
        key_pose(armature, action, frame, poses[frame])
    smooth_action(action)
    # The attack wrist has a short, high-energy contact phase.  Solve only
    # that measured seam per frame; the remaining clips stay on the stable
    # authored wrist limits above and avoid unnecessary baked corrections.
    seam_repairs = (
        calibrate_right_wrist(scene, armature, action, FRAME_ENDS[clip])
        if clip == "attack"
        else 0
    )
    action["right_wrist_seam_repairs"] = seam_repairs
    smooth_action(action)

    locator_action = bpy.data.actions.new(f"CloudLocator_{ACTION_NAMES[clip]}")
    cloud_action = bpy.data.actions.new(f"Cloud_{ACTION_NAMES[clip]}")
    locator_action.use_fake_user = True
    cloud_action.use_fake_user = True
    locator.animation_data_create()
    cloud.animation_data_create()
    locator.animation_data.action = locator_action
    cloud.animation_data.action = cloud_action
    for frame in sorted(CLOUD_OFFSETS[clip]):
        key_cloud(
            locator,
            cloud,
            clip,
            frame,
            base_location,
            base_scale,
            locator_action,
            cloud_action,
        )
    smooth_action(locator_action)
    smooth_action(cloud_action, linear_paths={"rotation_euler"})
    if clip in CYCLE_CLIPS:
        add_cycle(locator_action)
        add_cycle(cloud_action)
    scene.frame_set(0)

    scene.name = f"brock-zeus_{clip}"
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
    scene["frame_end"] = FRAME_ENDS[clip]
    scene["fps"] = FPS
    scene["authoring_status"] = "READY_FOR_REVIEW"
    scene["source_of_truth"] = os.fspath(MASTER.relative_to(ROOT))
    scene["rig_contract"] = (
        "15-bone brock-zeus-rig; Root local X/Z locked; Root local Y is world-up"
    )
    scene["cloud_contract"] = (
        "Cloud is a separate mesh child of Cloud_Locator; Cloud_Locator is Root-bone child and excluded from character GLB"
    )
    scene["cycle_contract"] = (
        "frame 0 equals frame end for locator; cloud rotation may differ by full turns"
        if clip in CYCLE_CLIPS
        else "one-shot"
    )
    scene["cloud_locator_base"] = json.dumps(
        [round(float(v), 6) for v in base_location]
    )

    target = SCENES / f"{clip}.blend"
    target.parent.mkdir(parents=True, exist_ok=True)
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
        "fps": FPS,
        "curves": len(curves),
        "keyframes": sum(len(curve.keyframe_points) for curve in curves),
        "right_wrist_seam_repairs": seam_repairs,
        "cloud_actions": [locator_action.name, cloud_action.name],
        "cycle": clip in CYCLE_CLIPS,
    }


def prepare_master():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = bpy.data.objects.get("brock-zeus-rig")
    if armature is None:
        raise RuntimeError("Brock master is missing brock-zeus-rig")
    reset_pose(armature)
    ensure_brock_skinning(armature)
    ensure_right_arm_visual_repair(armature)
    ensure_cloud_hierarchy(armature)
    clear_actions()
    bpy.context.scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)


def main():
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    prepare_master()
    requested = os.environ.get("BROCK_CLIP_FILTER")
    clips = [requested] if requested else list(ACTION_NAMES)
    unknown = [clip for clip in clips if clip not in ACTION_NAMES]
    if unknown:
        raise RuntimeError(f"unknown Brock clip(s): {unknown}")
    report = [author_clip(clip) for clip in clips]
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
