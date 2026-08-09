"""Author Kaze's twelve focused scenes on the measured Kaze rig.

Kaze's imported skeleton has 76 bones and no ``Root``, ``Forearm`` or
``Neck`` bones with the names from the brief.  This adapter deliberately uses
the real chains from ``kaze.blend`` and keys a complete pose at every authored
beat.  Embedded fan meshes stay visible in the review scenes and follow the
left/right wrist grip markers; the runtime exporter removes those meshes and
uses the detached weapon GLB instead.

Run with Blender 5.2 from the repository root:
  blender --background --python tools/blender/author_kaze_animation_scenes.py

Set ``KAZE_CLIP_FILTER=idle`` to generate one focused clip during visual
calibration.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
HERO = "kaze"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "kaze.blend"
SCENES = MASTER.parent / "scenes"
REPORT = ROOT / "artifacts" / "kaze-animation-authoring.json"
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
    "idle": 70,
    "run": 18,
    "attack": 20,
    "super": 25,
    "aim": 60,
    "aim-super": 60,
    "hit": 10,
    "death": 35,
    "spawn": 40,
    "victory": 50,
    "gadget": 12,
    "aim-gadget": 60,
}
CYCLE_CLIPS = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ABILITY_CLIPS = {"attack", "super", "gadget"}

# The authoring adapter maps the brief's semantic channels onto the imported
# Kaze hierarchy.  The two lower bend bones are retained because skipping them
# makes a long sleeve/forearm chain look like it is rotating at the elbow.
BONES = {
    "root": "hips_s",
    "spine_lower": "spine_lower_s1",
    "spine_middle": "spine_middle_s",
    "spine_upper": "spine_upper_s",
    "chest": "chest_s",
    "head": "head_s",
    "upper_l": "L_shoulder_s",
    "elbow_l": "L_elbow_s",
    "forearm_l": "L_lower_elbow_0_bend_s",
    "wrist_l": "L_wrist_s",
    "upper_r": "R_shoulder_s",
    "elbow_r": "R_elbow_s",
    "forearm_r": "R_lower_elbow_0_bend_s",
    "wrist_r": "R_wrist_s",
    "leg_l": "L_leg_s",
    "thigh_l": "L_upper_leg_0_bend_s",
    "knee_l": "L_knee_s",
    "shin_l": "L_lower_knee_0_bend_s",
    "foot_l": "L_foot_s",
    "roll_l": "L_foot_roll_s",
    "leg_r": "R_leg_s",
    "thigh_r": "R_upper_leg_0_bend_s",
    "knee_r": "R_knee_s",
    "shin_r": "R_lower_knee_0_bend_s",
    "foot_r": "R_foot_s",
    "roll_r": "R_foot_roll_s",
}
FINGER_BONES = {
    "l": (
        "L_thumb_0_s",
        "L_thumb_1_s",
        "L_index_0_s",
        "L_index_1_s",
        "L_pinky_0_s",
        "L_pinky_1_s",
    ),
    "r": (
        "R_thumb_0_s",
        "R_thumb_1_s",
        "R_index_0_s",
        "R_index_1_s",
        "R_pinky_0_s",
        "R_pinky_1_s",
    ),
}
ATTACHMENTS = {
    "left": (
        "HeroAttachment_FanLeft",
        "Grip.Primary.HeroAttachment_FanLeft",
        "L_wrist_s",
    ),
    "right": (
        "HeroAttachment_FanRight",
        "Grip.Primary.HeroAttachment_FanRight",
        "R_wrist_s",
    ),
}
EMBEDDED_GRIP_LOCAL = {
    # Use the panel's central hub as the socket point.  The long source handle
    # then stays inside the sleeve instead of leaving a visible gap to the fan.
    "HeroAttachment_FanLeft": (0.00, 1.67, 3.75),
    "HeroAttachment_FanRight": (0.00, 1.67, 3.75),
}
EMBEDDED_FAN_OUTWARD_ROTATIONS = {
    # Turn the opened panels a quarter turn around their thin local axis so
    # they grow outward from the cuffs instead of lying along the forearms.
    # The signs are mirrored because the two source fans use opposite hands.
    "HeroAttachment_FanLeft": Matrix.Rotation(math.radians(-25), 4, "Z")
    @ Matrix.Rotation(math.pi, 4, "X")
    @ Matrix.Rotation(math.radians(-90), 4, "Y"),
    "HeroAttachment_FanRight": Matrix.Rotation(math.radians(25), 4, "Z")
    @ Matrix.Rotation(math.pi, 4, "X")
    @ Matrix.Rotation(math.radians(90), 4, "Y"),
}
RIGHT_ARM_SEMANTICS = {"upper_r", "elbow_r", "forearm_r", "wrist_r"}


def radians(values):
    return tuple(math.radians(value) for value in values)


def blend_pose(first, second, amount):
    """Interpolate every authored channel for stable in-between poses."""
    result = {}
    for key, value in first.items():
        other = second[key]
        if isinstance(value, tuple):
            result[key] = tuple(
                left + (right - left) * amount for left, right in zip(value, other)
            )
        else:
            result[key] = value + (other - value) * amount
    return result


def pose(
    *,
    root_up=0.0,
    hips=(0, 0, 0),
    torso=(0, 0, 0),
    head=(0, 0, 0),
    upper_l=(0, 0, 0),
    elbow_l=(0, 0, 0),
    forearm_l=(0, 0, 0),
    wrist_l=(0, 0, 0),
    upper_r=(0, 0, 0),
    elbow_r=(0, 0, 0),
    forearm_r=(0, 0, 0),
    wrist_r=(0, 0, 0),
    leg_l=(0, 0, 0),
    thigh_l=(0, 0, 0),
    knee_l=(0, 0, 0),
    shin_l=(0, 0, 0),
    foot_l=(0, 0, 0),
    roll_l=(0, 0, 0),
    leg_r=(0, 0, 0),
    thigh_r=(0, 0, 0),
    knee_r=(0, 0, 0),
    shin_r=(0, 0, 0),
    foot_r=(0, 0, 0),
    roll_r=(0, 0, 0),
    grip=(22, 22),
):
    data = {
        "root_up": float(root_up),
        "hips": hips,
        "torso": torso,
        "head": head,
        "upper_l": upper_l,
        "elbow_l": elbow_l,
        "forearm_l": forearm_l,
        "wrist_l": wrist_l,
        "upper_r": upper_r,
        "elbow_r": elbow_r,
        "forearm_r": forearm_r,
        "wrist_r": wrist_r,
        "leg_l": leg_l,
        "thigh_l": thigh_l,
        "knee_l": knee_l,
        "shin_l": shin_l,
        "foot_l": foot_l,
        "roll_l": roll_l,
        "leg_r": leg_r,
        "thigh_r": thigh_r,
        "knee_r": knee_r,
        "shin_r": shin_r,
        "foot_r": foot_r,
        "roll_r": roll_r,
        "grip": grip,
    }
    return data


def low_base():
    """Ready stance: sleeves angle outward so each fan exits its cuff."""
    return pose(
        torso=(8, 0, 0),
        head=(-2, 10, 0),
        upper_l=(30, 0, -8),
        elbow_l=(-14, 0, 0),
        forearm_l=(-8, 0, 0),
        wrist_l=(3, 0, -4),
        upper_r=(30, 0, 8),
        elbow_r=(-14, 0, 0),
        forearm_r=(-8, 0, 0),
        wrist_r=(3, 0, 4),
        leg_l=(0, -8, 0),
        thigh_l=(0, 0, 0),
        knee_l=(18, 0, 0),
        shin_l=(-6, 0, 0),
        foot_l=(0, 0, 0),
        leg_r=(0, 8, 0),
        thigh_r=(0, 0, 0),
        knee_r=(18, 0, 0),
        shin_r=(-6, 0, 0),
        foot_r=(0, 0, 0),
    )


def idle_poses():
    base = low_base()
    return {
        0: base,
        18: {
            **base,
            "hips": (0, 7, 0),
            "torso": (9, 6, 0),
            "head": (-1, 20, 0),
            "wrist_l": (8, 0, -13),
            "wrist_r": (8, 0, 13),
        },
        35: {
            **base,
            "hips": (0, -7, 0),
            "torso": (9, -6, 0),
            "head": (-1, -16, 0),
            "wrist_l": (5, 0, -7),
            "wrist_r": (5, 0, 7),
        },
        52: {
            **base,
            "hips": (0, 4, 0),
            "torso": (7, 4, 0),
            "head": (-3, 12, 0),
            "wrist_l": (7, 0, -11),
            "wrist_r": (7, 0, 11),
        },
        70: base,
    }


def run_poses():
    left_forward = dict(
        upper_l=(-42, 0, -10),
        elbow_l=(-38, 0, 0),
        forearm_l=(-6, 0, 0),
        wrist_l=(4, -3, -4),
    )
    right_forward = dict(
        upper_r=(-42, 0, 10),
        elbow_r=(-38, 0, 0),
        forearm_r=(-6, 0, 0),
        wrist_r=(4, 3, 4),
    )
    left_back = dict(
        upper_l=(-24, 0, -6),
        elbow_l=(-48, 0, 0),
        forearm_l=(-8, 0, 0),
        wrist_l=(2, 0, -3),
    )
    right_back = dict(
        upper_r=(-24, 0, 6),
        elbow_r=(-48, 0, 0),
        forearm_r=(-8, 0, 0),
        wrist_r=(2, 0, 3),
    )
    arms_mid = dict(
        upper_l=(-32, 0, -8),
        elbow_l=(-44, 0, 0),
        forearm_l=(-7, 0, 0),
        wrist_l=(3, -1, -3),
        upper_r=(-32, 0, 8),
        elbow_r=(-44, 0, 0),
        forearm_r=(-7, 0, 0),
        wrist_r=(3, 1, 3),
    )
    return {
        0: pose(
            root_up=-0.01,
            torso=(8, 0, 0),
            head=(-2, 3, 0),
            **left_back,
            **right_forward,
            leg_l=(0, -5, 0),
            thigh_l=(-14, 0, 0),
            knee_l=(32, 0, 0),
            shin_l=(-12, 0, 0),
            foot_l=(4, 0, 0),
            leg_r=(0, 5, 0),
            thigh_r=(6, 0, 0),
            knee_r=(14, 0, 0),
            shin_r=(-4, 0, 0),
            foot_r=(-2, 0, 0),
        ),
        5: pose(
            root_up=-0.025,
            torso=(9, 0, 0),
            head=(-2, -2, 0),
            **arms_mid,
            leg_l=(0, 2, 0),
            thigh_l=(4, 0, 0),
            knee_l=(18, 0, 0),
            shin_l=(-6, 0, 0),
            foot_l=(-2, 0, 0),
            leg_r=(0, -2, 0),
            thigh_r=(-6, 0, 0),
            knee_r=(26, 0, 0),
            shin_r=(-10, 0, 0),
            foot_r=(3, 0, 0),
        ),
        9: pose(
            root_up=-0.01,
            torso=(8, 0, 0),
            head=(-2, 3, 0),
            **left_forward,
            **right_back,
            leg_l=(0, 5, 0),
            thigh_l=(6, 0, 0),
            knee_l=(14, 0, 0),
            shin_l=(-4, 0, 0),
            foot_l=(-2, 0, 0),
            leg_r=(0, -5, 0),
            thigh_r=(-14, 0, 0),
            knee_r=(32, 0, 0),
            shin_r=(-12, 0, 0),
            foot_r=(4, 0, 0),
        ),
        14: pose(
            root_up=-0.025,
            torso=(9, 0, 0),
            head=(-2, -2, 0),
            **arms_mid,
            leg_l=(0, -2, 0),
            thigh_l=(-6, 0, 0),
            knee_l=(26, 0, 0),
            shin_l=(-10, 0, 0),
            foot_l=(3, 0, 0),
            leg_r=(0, 2, 0),
            thigh_r=(4, 0, 0),
            knee_r=(18, 0, 0),
            shin_r=(-6, 0, 0),
            foot_r=(-2, 0, 0),
        ),
        18: pose(
            root_up=-0.01,
            torso=(8, 0, 0),
            head=(-2, 3, 0),
            **left_back,
            **right_forward,
            leg_l=(0, -5, 0),
            thigh_l=(-14, 0, 0),
            knee_l=(32, 0, 0),
            shin_l=(-12, 0, 0),
            foot_l=(4, 0, 0),
            leg_r=(0, 5, 0),
            thigh_r=(6, 0, 0),
            knee_r=(14, 0, 0),
            shin_r=(-4, 0, 0),
            foot_r=(-2, 0, 0),
        ),
    }


def attack_poses():
    base = low_base()
    poses = {
        0: base,
        2: {
            **base,
            "hips": (0, -8, 0),
            "torso": (7, -4, 0),
            "head": (-2, -12, 0),
            "upper_r": (-28, 18, 56),
            "elbow_r": (-58, 0, 0),
            "forearm_r": (-18, 0, 0),
            "wrist_r": (14, 0, 18),
            "upper_l": (-50, 8, -34),
            "elbow_l": (-26, 0, 0),
            "forearm_l": (-8, 0, 0),
            "wrist_l": (8, 0, -8),
        },
        5: {
            **base,
            "hips": (0, -12, 0),
            "torso": (8, -6, 0),
            "head": (-2, -18, 0),
            "upper_r": (-4, 34, 52),
            "elbow_r": (-28, 0, 0),
            "forearm_r": (-8, 0, 0),
            "wrist_r": (18, 0, 28),
            "upper_l": (-54, 8, -32),
            "elbow_l": (-30, 0, 0),
            "forearm_l": (-10, 0, 0),
            "wrist_l": (8, 0, -10),
        },
        7: {
            **base,
            "hips": (0, 4, 0),
            "torso": (8, 2, 0),
            "head": (-2, 12, 0),
            "upper_r": (-52, -8, 34),
            "elbow_r": (-34, 0, 0),
            "forearm_r": (-12, 0, 0),
            "wrist_r": (8, 0, 8),
            "upper_l": (-30, -30, -50),
            "elbow_l": (-10, 0, 0),
            "forearm_l": (-4, 0, 0),
            "wrist_l": (15, 0, -25),
        },
        10: {
            **base,
            "hips": (0, 12, 0),
            "torso": (8, 6, 0),
            "head": (-2, 18, 0),
            "upper_l": (-4, -34, -52),
            "elbow_l": (-28, 0, 0),
            "forearm_l": (-8, 0, 0),
            "wrist_l": (18, 0, -28),
            "upper_r": (-54, -8, 32),
            "elbow_r": (-30, 0, 0),
            "forearm_r": (-10, 0, 0),
            "wrist_r": (8, 0, 10),
        },
        12: {
            **base,
            "hips": (0, 6, 0),
            "torso": (7, 3, 0),
            "head": (-1, 12, 0),
            "upper_l": (-42, -10, -30),
            "elbow_l": (-38, 0, 0),
            "forearm_l": (-12, 0, 0),
            "wrist_l": (8, 0, -10),
            "upper_r": (-42, -2, 24),
            "elbow_r": (-36, 0, 0),
            "forearm_r": (-12, 0, 0),
            "wrist_r": (8, 0, 8),
        },
        16: base,
        20: base,
    }
    # The relaxed base pose is farther from the first strike than the old
    # tucked-arms pose, so build into the hit over two frames.
    poses[2] = blend_pose(base, poses[2], 0.55)
    for frame, left_frame, right_frame in (
        (1, 0, 2),
        (3, 2, 5),
        (4, 2, 5),
        (6, 5, 7),
        (8, 7, 10),
        (9, 7, 10),
        (11, 10, 12),
        (14, 12, 16),
        (18, 16, 20),
    ):
        poses[frame] = blend_pose(
            poses[left_frame],
            poses[right_frame],
            (frame - left_frame) / (right_frame - left_frame),
        )
    left_hit = poses[7]
    poses[6] = blend_pose(poses[5], left_hit, 0.25)
    poses[7] = blend_pose(poses[5], left_hit, 0.50)
    poses[8] = blend_pose(poses[5], left_hit, 0.75)
    poses[9] = left_hit
    left_follow = poses[10]
    poses[10] = blend_pose(left_hit, left_follow, 0.50)
    return_hit = poses[12]
    poses[11] = blend_pose(poses[10], return_hit, 0.33)
    poses[12] = blend_pose(poses[10], return_hit, 0.66)
    poses[13] = return_hit
    poses[14] = blend_pose(return_hit, poses[16], 0.33)
    poses[15] = blend_pose(return_hit, poses[16], 0.66)
    return poses


def super_poses():
    base = low_base()
    crouch = pose(
        root_up=-0.15,
        hips=(3, 0, 0),
        torso=(15, 0, 0),
        head=(8, 0, 0),
        upper_l=(-28, 22, -28),
        elbow_l=(-60, 0, 0),
        forearm_l=(-18, 0, 0),
        wrist_l=(12, 0, -8),
        upper_r=(-28, -22, 28),
        elbow_r=(-60, 0, 0),
        forearm_r=(-18, 0, 0),
        wrist_r=(12, 0, 8),
        leg_l=(0, -4, 0),
        thigh_l=(-36, 0, 0),
        knee_l=(60, 0, 0),
        shin_l=(-28, 0, 0),
        foot_l=(14, 0, 0),
        leg_r=(0, 4, 0),
        thigh_r=(-36, 0, 0),
        knee_r=(60, 0, 0),
        shin_r=(-28, 0, 0),
        foot_r=(14, 0, 0),
    )
    thrust = pose(
        root_up=0.04,
        hips=(4, 0, 0),
        torso=(20, 0, 0),
        head=(12, 0, 0),
        upper_l=(-74, 20, -22),
        elbow_l=(-30, 0, 0),
        forearm_l=(-8, 0, 0),
        wrist_l=(16, 0, -5),
        upper_r=(-74, -20, 22),
        elbow_r=(-30, 0, 0),
        forearm_r=(-8, 0, 0),
        wrist_r=(16, 0, 5),
        leg_l=(0, 0, 0),
        thigh_l=(-22, 0, 0),
        knee_l=(40, 0, 0),
        shin_l=(-20, 0, 0),
        foot_l=(10, 0, 0),
        leg_r=(0, 0, 0),
        thigh_r=(-22, 0, 0),
        knee_r=(40, 0, 0),
        shin_r=(-20, 0, 0),
        foot_r=(10, 0, 0),
    )
    poses = {
        0: base,
        5: crouch,
        10: thrust,
        15: thrust,
        20: {**base, "torso": (12, 0, 0), "head": (5, 0, 0)},
        25: base,
    }
    # Keep the release explosive without jumping from the thrust straight to
    # the relaxed hands in the middle of the clip.
    for frame, amount in ((16, 0.20), (17, 0.40), (18, 0.60), (19, 0.80)):
        poses[frame] = blend_pose(thrust, poses[20], amount)
    return poses


def aim_poses():
    ready = pose(
        hips=(0, 6, 0),
        torso=(10, 3, 0),
        head=(-1, 18, 0),
        upper_l=(-58, 14, -45),
        elbow_l=(-48, 0, 0),
        forearm_l=(-15, 0, 0),
        wrist_l=(12, 0, -18),
        upper_r=(-82, -8, 30),
        elbow_r=(-24, 0, 0),
        forearm_r=(-8, 0, 0),
        wrist_r=(18, 0, 12),
        leg_l=(0, -8, 0),
        thigh_l=(-24, 0, 0),
        knee_l=(48, 0, 0),
        shin_l=(-20, 0, 0),
        foot_l=(8, 0, 0),
        leg_r=(0, 8, 0),
        thigh_r=(-24, 0, 0),
        knee_r=(48, 0, 0),
        shin_r=(-20, 0, 0),
        foot_r=(8, 0, 0),
    )
    return {
        0: ready,
        30: {
            **ready,
            "hips": (0, -4, 0),
            "torso": (11, -2, 0),
            "head": (-1, -14, 0),
            "wrist_l": (14, 0, -21),
            "wrist_r": (20, 0, 14),
        },
        60: ready,
    }


def aim_super_poses():
    ready = pose(
        root_up=-0.12,
        hips=(3, 0, 0),
        torso=(16, 0, 0),
        head=(14, 0, 0),
        upper_l=(-62, 28, -58),
        elbow_l=(-42, 0, 0),
        forearm_l=(-14, 0, 0),
        wrist_l=(20, 0, -22),
        upper_r=(-62, -28, 58),
        elbow_r=(-42, 0, 0),
        forearm_r=(-14, 0, 0),
        wrist_r=(20, 0, 22),
        leg_l=(0, -5, 0),
        thigh_l=(-34, 0, 0),
        knee_l=(58, 0, 0),
        shin_l=(-26, 0, 0),
        foot_l=(12, 0, 0),
        leg_r=(0, 5, 0),
        thigh_r=(-34, 0, 0),
        knee_r=(58, 0, 0),
        shin_r=(-26, 0, 0),
        foot_r=(12, 0, 0),
    )
    return {
        0: ready,
        30: {
            **ready,
            "torso": (18, 0, 0),
            "head": (16, 0, 0),
            "wrist_l": (22, 0, -25),
            "wrist_r": (22, 0, 25),
        },
        60: ready,
    }


def hit_poses():
    base = low_base()
    poses = {
        0: base,
        2: {
            **base,
            "hips": (0, 0, -12),
            "torso": (6, 0, -8),
            "head": (4, -8, 0),
            "upper_l": (-22, 8, -58),
            "elbow_l": (-18, 0, 0),
            "forearm_l": (-8, 0, 0),
            "wrist_l": (12, 0, -20),
            "upper_r": (-22, -8, 58),
            "elbow_r": (-18, 0, 0),
            "forearm_r": (-8, 0, 0),
            "wrist_r": (12, 0, 20),
        },
        5: {
            **base,
            "hips": (0, 0, -16),
            "torso": (5, 0, -10),
            "head": (6, -12, 0),
            "upper_l": (-14, 10, -70),
            "elbow_l": (-10, 0, 0),
            "forearm_l": (-5, 0, 0),
            "wrist_l": (18, 0, -25),
            "upper_r": (-14, -10, 70),
            "elbow_r": (-10, 0, 0),
            "forearm_r": (-5, 0, 0),
            "wrist_r": (18, 0, 25),
        },
        8: {**base, "hips": (0, 0, -7), "torso": (7, 0, -4), "head": (2, -5, 0)},
        10: base,
    }
    # Apply the softened first impact before calculating frames 1, 3 and 4;
    # otherwise those in-betweens still point at the old, farther wrist.
    poses[2] = blend_pose(base, poses[2], 0.55)
    for frame, left_frame, right_frame in (
        (1, 0, 2),
        (3, 2, 5),
        (4, 2, 5),
        (6, 5, 8),
        (7, 5, 8),
        (9, 8, 10),
    ):
        poses[frame] = blend_pose(
            poses[left_frame],
            poses[right_frame],
            (frame - left_frame) / (right_frame - left_frame),
        )
    # The new base pose leaves the sleeves at the sides.  Ease the recoil
    # across the full return instead of making frames 6-8 pop between keys.
    return_pose = poses[8]
    poses[6] = blend_pose(poses[5], return_pose, 0.25)
    poses[7] = blend_pose(poses[5], return_pose, 0.50)
    poses[8] = blend_pose(poses[5], return_pose, 0.75)
    poses[9] = blend_pose(poses[8], poses[10], 0.50)
    return poses


def death_poses():
    return {
        0: low_base(),
        8: pose(
            root_up=-0.10,
            hips=(4, 0, 10),
            torso=(12, 0, 5),
            head=(8, -8, 0),
            upper_l=(-18, 24, -55),
            elbow_l=(-10, 0, 0),
            forearm_l=(-4, 0, 0),
            wrist_l=(18, 0, -30),
            upper_r=(-18, -24, 55),
            elbow_r=(-10, 0, 0),
            forearm_r=(-4, 0, 0),
            wrist_r=(18, 0, 30),
            leg_l=(0, -8, 0),
            thigh_l=(-42, 0, 0),
            knee_l=(68, 0, 0),
            shin_l=(-32, 0, 0),
            foot_l=(16, 0, 0),
            leg_r=(0, 8, 0),
            thigh_r=(-42, 0, 0),
            knee_r=(68, 0, 0),
            shin_r=(-32, 0, 0),
            foot_r=(16, 0, 0),
        ),
        15: pose(
            root_up=-0.28,
            hips=(8, 0, 22),
            torso=(14, 0, 7),
            head=(10, -12, 0),
            upper_l=(-5, 50, -70),
            elbow_l=(8, 0, 0),
            forearm_l=(6, 0, 0),
            wrist_l=(30, 0, -36),
            upper_r=(-5, -50, 70),
            elbow_r=(8, 0, 0),
            forearm_r=(6, 0, 0),
            wrist_r=(30, 0, 36),
            grip=(16, 16),
            leg_l=(0, -10, 0),
            thigh_l=(-64, 0, 0),
            knee_l=(84, 0, 0),
            shin_l=(-42, 0, 0),
            foot_l=(20, 0, 0),
            leg_r=(0, 10, 0),
            thigh_r=(-64, 0, 0),
            knee_r=(84, 0, 0),
            shin_r=(-42, 0, 0),
            foot_r=(20, 0, 0),
        ),
        22: pose(
            root_up=-0.34,
            hips=(10, 0, 28),
            torso=(10, 0, 8),
            head=(14, -18, 0),
            upper_l=(8, 68, -76),
            elbow_l=(20, 0, 0),
            forearm_l=(10, 0, 0),
            wrist_l=(38, 0, -42),
            upper_r=(8, -68, 76),
            elbow_r=(20, 0, 0),
            forearm_r=(10, 0, 0),
            wrist_r=(38, 0, 42),
            grip=(0, 0),
            leg_l=(0, -12, 0),
            thigh_l=(-70, 0, 0),
            knee_l=(90, 0, 0),
            shin_l=(-48, 0, 0),
            foot_l=(22, 0, 0),
            leg_r=(0, 12, 0),
            thigh_r=(-70, 0, 0),
            knee_r=(90, 0, 0),
            shin_r=(-48, 0, 0),
            foot_r=(22, 0, 0),
        ),
        35: pose(
            root_up=-0.34,
            hips=(10, 0, 28),
            torso=(10, 0, 8),
            head=(14, -18, 0),
            upper_l=(8, 68, -76),
            elbow_l=(20, 0, 0),
            forearm_l=(10, 0, 0),
            wrist_l=(38, 0, -42),
            upper_r=(8, -68, 76),
            elbow_r=(20, 0, 0),
            forearm_r=(10, 0, 0),
            wrist_r=(38, 0, 42),
            grip=(0, 0),
            leg_l=(0, -12, 0),
            thigh_l=(-70, 0, 0),
            knee_l=(90, 0, 0),
            shin_l=(-48, 0, 0),
            foot_l=(22, 0, 0),
            leg_r=(0, 12, 0),
            thigh_r=(-70, 0, 0),
            knee_r=(90, 0, 0),
            shin_r=(-48, 0, 0),
            foot_r=(22, 0, 0),
        ),
    }


def spawn_poses():
    base = low_base()
    return {
        0: pose(
            root_up=-0.30,
            hips=(4, 0, 0),
            torso=(18, 0, 0),
            head=(16, -8, 0),
            upper_l=(-18, 30, -30),
            elbow_l=(-64, 0, 0),
            forearm_l=(-16, 0, 0),
            wrist_l=(18, 0, -12),
            upper_r=(-18, -30, 30),
            elbow_r=(-64, 0, 0),
            forearm_r=(-16, 0, 0),
            wrist_r=(18, 0, 12),
            leg_l=(0, -6, 0),
            thigh_l=(-58, 0, 0),
            knee_l=(78, 0, 0),
            shin_l=(-40, 0, 0),
            foot_l=(18, 0, 0),
            leg_r=(0, 6, 0),
            thigh_r=(-58, 0, 0),
            knee_r=(78, 0, 0),
            shin_r=(-40, 0, 0),
            foot_r=(18, 0, 0),
        ),
        10: pose(
            root_up=-0.15,
            hips=(3, 0, 0),
            torso=(15, 0, 0),
            head=(10, 0, 0),
            upper_l=(-20, 24, -34),
            elbow_l=(-52, 0, 0),
            forearm_l=(-14, 0, 0),
            wrist_l=(14, 0, -10),
            upper_r=(-20, -24, 34),
            elbow_r=(-52, 0, 0),
            forearm_r=(-14, 0, 0),
            wrist_r=(14, 0, 10),
            leg_l=(0, -6, 0),
            thigh_l=(-40, 0, 0),
            knee_l=(58, 0, 0),
            shin_l=(-26, 0, 0),
            foot_l=(12, 0, 0),
            leg_r=(0, 6, 0),
            thigh_r=(-40, 0, 0),
            knee_r=(58, 0, 0),
            shin_r=(-26, 0, 0),
            foot_r=(12, 0, 0),
        ),
        18: pose(
            root_up=0.0,
            hips=(0, 0, 0),
            torso=(8, 0, 0),
            head=(2, 8, 0),
            upper_l=(-12, 18, -54),
            elbow_l=(-28, 0, 0),
            forearm_l=(-8, 0, 0),
            wrist_l=(12, 0, -18),
            upper_r=(-12, -18, 54),
            elbow_r=(-28, 0, 0),
            forearm_r=(-8, 0, 0),
            wrist_r=(12, 0, 18),
            leg_l=(0, -8, 0),
            thigh_l=(-20, 0, 0),
            knee_l=(44, 0, 0),
            shin_l=(-18, 0, 0),
            foot_l=(8, 0, 0),
            leg_r=(0, 8, 0),
            thigh_r=(-20, 0, 0),
            knee_r=(44, 0, 0),
            shin_r=(-18, 0, 0),
            foot_r=(8, 0, 0),
        ),
        28: base,
        40: base,
    }


def victory_poses():
    base = low_base()
    arms_out = pose(
        hips=(0, 0, 0),
        torso=(6, 0, 0),
        head=(-4, 12, 0),
        upper_l=(-12, 0, -82),
        elbow_l=(-24, 0, 0),
        forearm_l=(-8, 0, 0),
        wrist_l=(8, 0, -18),
        upper_r=(-12, 0, 82),
        elbow_r=(-24, 0, 0),
        forearm_r=(-8, 0, 0),
        wrist_r=(8, 0, 18),
        leg_l=(0, -7, 0),
        thigh_l=(-18, 0, 0),
        knee_l=(40, 0, 0),
        shin_l=(-18, 0, 0),
        foot_l=(8, 0, 0),
        leg_r=(0, 7, 0),
        thigh_r=(-18, 0, 0),
        knee_r=(40, 0, 0),
        shin_r=(-18, 0, 0),
        foot_r=(8, 0, 0),
    )
    finish = pose(
        root_up=0.10,
        hips=(0, 360, 0),
        torso=(4, 0, 0),
        head=(-8, 0, 0),
        upper_l=(-112, 18, -30),
        elbow_l=(-34, 0, 0),
        forearm_l=(-10, 0, 0),
        wrist_l=(16, 0, -22),
        upper_r=(-112, -18, 30),
        elbow_r=(-34, 0, 0),
        forearm_r=(-10, 0, 0),
        wrist_r=(16, 0, 22),
        leg_l=(0, -6, 0),
        thigh_l=(-14, 0, 0),
        knee_l=(34, 0, 0),
        shin_l=(-14, 0, 0),
        foot_l=(6, 0, 0),
        leg_r=(0, 6, 0),
        thigh_r=(-14, 0, 0),
        knee_r=(34, 0, 0),
        shin_r=(-14, 0, 0),
        foot_r=(6, 0, 0),
    )
    spin_hold = {**arms_out, "hips": (0, 360, 0)}
    finish_return = {**base, "hips": (0, 360, 0)}
    poses = {
        0: base,
        8: arms_out,
        12: {**arms_out, "hips": (0, 90, 0)},
        16: {**arms_out, "hips": (0, 180, 0)},
        20: {**arms_out, "hips": (0, 270, 0)},
        24: spin_hold,
        25: blend_pose(spin_hold, finish, 0.125),
        26: blend_pose(spin_hold, finish, 0.25),
        27: blend_pose(spin_hold, finish, 0.375),
        28: blend_pose(spin_hold, finish, 0.50),
        29: blend_pose(spin_hold, finish, 0.625),
        30: blend_pose(spin_hold, finish, 0.75),
        31: blend_pose(spin_hold, finish, 0.875),
        32: finish,
        36: {**finish, "root_up": 0.03, "head": (-3, 0, 0)},
        44: finish_return,
        50: finish_return,
    }
    # The old sparse 36->44 segment moved both wrists too far in a single
    # in-between frame after the relaxed base pose was corrected.
    for frame, amount in (
        (37, 0.125),
        (38, 0.25),
        (39, 0.375),
        (40, 0.50),
        (41, 0.625),
        (42, 0.75),
        (43, 0.875),
    ):
        poses[frame] = blend_pose(poses[36], finish_return, amount)
    return poses


def gadget_poses():
    base = low_base()
    compact = pose(
        root_up=-0.18,
        hips=(3, 0, 0),
        torso=(16, 0, 0),
        head=(10, 0, 0),
        upper_l=(-28, 20, -20),
        elbow_l=(-64, 0, 0),
        forearm_l=(-18, 0, 0),
        wrist_l=(20, 0, -8),
        upper_r=(-28, -20, 20),
        elbow_r=(-64, 0, 0),
        forearm_r=(-18, 0, 0),
        wrist_r=(20, 0, 8),
        leg_l=(0, -4, 0),
        thigh_l=(-42, 0, 0),
        knee_l=(64, 0, 0),
        shin_l=(-28, 0, 0),
        foot_l=(14, 0, 0),
        leg_r=(0, 4, 0),
        thigh_r=(-42, 0, 0),
        knee_r=(64, 0, 0),
        shin_r=(-28, 0, 0),
        foot_r=(14, 0, 0),
    )
    return {
        0: base,
        1: blend_pose(base, compact, 0.20),
        2: blend_pose(base, compact, 0.40),
        3: blend_pose(base, compact, 0.75),
        4: compact,
        7: compact,
        10: {**compact, "torso": (12, 0, 0), "head": (6, 0, 0)},
        12: compact,
    }


def aim_gadget_poses():
    ready = pose(
        root_up=-0.10,
        hips=(2, 4, 0),
        torso=(14, 2, 0),
        head=(8, 12, 0),
        upper_l=(-52, 24, -56),
        elbow_l=(-46, 0, 0),
        forearm_l=(-14, 0, 0),
        wrist_l=(20, 0, -24),
        upper_r=(-52, -24, 56),
        elbow_r=(-46, 0, 0),
        forearm_r=(-14, 0, 0),
        wrist_r=(20, 0, 24),
        leg_l=(0, -6, 0),
        thigh_l=(-30, 0, 0),
        knee_l=(52, 0, 0),
        shin_l=(-22, 0, 0),
        foot_l=(10, 0, 0),
        leg_r=(0, 6, 0),
        thigh_r=(-30, 0, 0),
        knee_r=(52, 0, 0),
        shin_r=(-22, 0, 0),
        foot_r=(10, 0, 0),
    )
    return {
        0: ready,
        20: {
            **ready,
            "hips": (2, -4, 0),
            "torso": (15, -2, 0),
            "head": (8, -12, 0),
            "wrist_l": (22, 0, -27),
            "wrist_r": (22, 0, 27),
        },
        40: ready,
        60: ready,
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


def action_curves(action):
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
        if action.users:
            action.user_clear()
        bpy.data.actions.remove(action)


def reset_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def apply_pose(armature, data):
    reset_pose(armature)
    root = armature.pose.bones[BONES["root"]]
    root.location.y = data["root_up"]
    root.rotation_euler = Euler(radians(data["hips"]), "XYZ")
    torso = data["torso"]
    for semantic, factor in (
        ("spine_lower", 0.20),
        ("spine_middle", 0.30),
        ("spine_upper", 0.30),
        ("chest", 0.20),
    ):
        armature.pose.bones[BONES[semantic]].rotation_euler = Euler(
            radians(tuple(value * factor for value in torso)), "XYZ"
        )
    for semantic in (
        "head",
        "upper_l",
        "elbow_l",
        "forearm_l",
        "wrist_l",
        "upper_r",
        "elbow_r",
        "forearm_r",
        "wrist_r",
        "leg_l",
        "thigh_l",
        "knee_l",
        "shin_l",
        "foot_l",
        "roll_l",
        "leg_r",
        "thigh_r",
        "knee_r",
        "shin_r",
        "foot_r",
        "roll_r",
    ):
        angles = data[semantic]
        if semantic in RIGHT_ARM_SEMANTICS:
            # This rig's right-side bind axes are not a visual mirror of the
            # left side. Negating only Z preserves the hand's side offset while
            # turning the forearm toward the camera-facing side of the torso.
            angles = (angles[0], angles[1], -angles[2])
        armature.pose.bones[BONES[semantic]].rotation_euler = Euler(
            radians(angles), "XYZ"
        )
    for side, amount in zip(("l", "r"), data["grip"]):
        for name in FINGER_BONES[side]:
            armature.pose.bones[name].rotation_euler.x = math.radians(float(amount))


def key_pose(armature, action, frame, data):
    apply_pose(armature, data)
    for bone in armature.pose.bones:
        bone.keyframe_insert("location", frame=frame)
        bone.keyframe_insert("rotation_euler", frame=frame)
        bone.keyframe_insert("scale", frame=frame)


def smooth_action(action):
    for curve in action_curves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def make_victory_spin_linear(action):
    for curve in action_curves(action):
        if (
            curve.data_path == 'pose.bones["hips_s"].rotation_euler'
            and curve.array_index == 1
        ):
            for point in curve.keyframe_points:
                if point.co[0] <= 24:
                    point.interpolation = "LINEAR"
            curve.update()


def ensure_attachments(armature):
    for mesh_name, marker_name, bone_name in ATTACHMENTS.values():
        mesh = bpy.data.objects.get(mesh_name)
        marker = bpy.data.objects.get(marker_name)
        if mesh is None or mesh.type != "MESH":
            raise RuntimeError(f"missing Kaze attachment mesh {mesh_name}")
        if (
            marker is None
            or marker.parent is None
            or marker.parent.parent != armature
            or marker.parent.parent_bone != bone_name
        ):
            raise RuntimeError(f"{marker_name} is not attached to {bone_name}")
        mesh.hide_viewport = False
        mesh.hide_render = False
        parent = mesh.parent
        if parent is None:
            raise RuntimeError(f"{mesh_name} must remain parented to its weapon socket")
        grip_world = marker.matrix_world.translation
        handle_world = mesh.matrix_world @ Vector(EMBEDDED_GRIP_LOCAL[mesh_name])
        delta_local = parent.matrix_world.inverted_safe().to_3x3() @ (
            grip_world - handle_world
        )
        mesh.location += delta_local
        grip_local = Vector(EMBEDDED_GRIP_LOCAL[mesh_name])
        rotation = EMBEDDED_FAN_OUTWARD_ROTATIONS[mesh_name]
        for vertex in mesh.data.vertices:
            vertex.co = grip_local + rotation @ (vertex.co - grip_local)
        mesh.data.update()


def ensure_source_textures():
    """Relink the source texture that is stored beside the unpacked model."""
    texture = (
        MASTER.parent / "source" / "nested" / "Texture" / "kaze_geisha_tex_highres.png"
    )
    for image in bpy.data.images:
        if image.size[0] > 0 and image.size[1] > 0:
            continue
        if image.name.startswith("kaze_geisha_tex_highres"):
            if not texture.exists():
                raise RuntimeError(f"missing Kaze source texture: {texture}")
            image.filepath = os.fspath(texture)
            image.reload()
            if image.size[0] <= 0 or image.size[1] <= 0:
                raise RuntimeError(f"could not load Kaze source texture: {texture}")


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = FRAME_ENDS[clip]
    ensure_source_textures()
    armature = bpy.data.objects.get("kaze-rig")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("expected kaze-rig")
    required = tuple(BONES.values()) + tuple(
        name for side in FINGER_BONES.values() for name in side
    )
    missing = [name for name in required if name not in armature.data.bones]
    if missing:
        raise RuntimeError(f"Kaze rig mapping changed; missing {missing}")
    ensure_attachments(armature)
    clear_actions()
    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    poses = POSE_BUILDERS[clip]()
    expected_end = FRAME_ENDS[clip]
    if min(poses) != 0 or max(poses) != expected_end:
        raise RuntimeError(f"{clip}: pose frames must cover 0..{expected_end}")
    for frame in sorted(poses):
        key_pose(armature, action, frame, poses[frame])
    smooth_action(action)
    if clip == "victory":
        make_victory_spin_linear(action)
    scene.frame_set(0)
    scene.name = f"kaze_{clip}"
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
    scene["root_bone"] = BONES["root"]
    scene["loc_up_channel"] = f'pose.bones["{BONES["root"]}"].location.y'
    scene["root_motion_contract"] = (
        "hips_s local X/Z locked; local Y is Blender world-up"
    )
    scene["torso_pitch_budget_degrees"] = 25.0
    scene["left_weapon_hand"] = BONES["wrist_l"]
    scene["right_weapon_hand"] = BONES["wrist_r"]
    scene["finger_grip_contract"] = (
        "all six available finger bones per hand are keyed; death may release at final pose"
    )
    scene["cycle_contract"] = (
        "frame 0 equals frame end" if clip in CYCLE_CLIPS else "one-shot"
    )
    scene["weapon_export_contract"] = (
        "embedded FanLeft/FanRight visible in focused scene; excluded from character GLB"
    )
    target = SCENES / f"{clip}.blend"
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=False
    )
    curves = action_curves(action)
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
        "root_bone": BONES["root"],
        "weapon_hands": [BONES["wrist_l"], BONES["wrist_r"]],
    }


def main():
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    requested = os.environ.get("KAZE_CLIP_FILTER")
    clips = [requested] if requested else list(ACTION_NAMES)
    unknown = [clip for clip in clips if clip not in ACTION_NAMES]
    if unknown:
        raise RuntimeError(f"unknown KAZE_CLIP_FILTER value(s): {unknown}")
    report = [author_clip(clip) for clip in clips]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(
            {
                "hero": HERO,
                "scenes": report,
                "root_bone": BONES["root"],
                "weapon_hands": [BONES["wrist_l"], BONES["wrist_r"]],
            },
            ensure_ascii=False,
            indent=2,
        ),
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
