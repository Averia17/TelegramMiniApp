"""Author the three gameplay skill clips from a stable, rig-aware baseline.

The first skill pass reused each hero's source Attack/Super action and added
large, generic Euler offsets.  That is unsafe across rigs: the same local axis
can bend a shoulder sideways on one character and forward on another, while
the source action can also contain root/prop tracks that fight the generated
pose.  This pass intentionally uses the hero's real idle pose as a neutral
baseline, writes every pose bone on every frame, and only adds restrained
gesture deltas to semantic body chains.  Bone-parented weapons therefore stay
with the wrist that owns them.
"""

from __future__ import annotations

import argparse
import importlib
import json
import math
import os
import re
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import author_frame_by_frame_animation_scenes as authoring
import hero_skill_spec as skill_spec

authoring = importlib.reload(authoring)
ROOT = authoring.ROOT
SOURCE = authoring.SOURCE
MANIFEST = authoring.MANIFEST

METHOD = "rig_aware_idle_baseline_explicit_frame_keys_v4_natural_idle_motion_brief"


def master_path(hero: str) -> Path:
    # Mandy has both a compatibility copy and the NLA master; the compatibility
    # copy is the same character scene expected by the rest of the pipeline.
    return SOURCE / hero / f"{hero}.blend"


def side_marker(name: str, side: str) -> bool:
    lower = name.casefold()
    marker = side.casefold()
    return (
        lower.startswith(marker + "_")
        or lower.startswith(marker + ".")
        or lower.endswith("_" + marker)
        or lower.endswith("." + marker)
        or f"_{marker}_" in lower
        or f".{marker}." in lower
    )


def choose(names: list[str], side: str | None, words: tuple[str, ...]) -> str | None:
    candidates = []
    for name in names:
        token = authoring.token(name)
        if side is not None and not side_marker(name, side):
            continue
        if not any(word in token for word in words):
            continue
        score = sum(token == word for word in words) * 20
        score += sum(token.startswith(word) for word in words) * 4
        score += len(name) / 1000.0
        candidates.append((score, name))
    return max(candidates)[1] if candidates else None


def rig_groups(armature):
    names = [bone.name for bone in armature.pose.bones]
    groups = {
        "root": authoring.pick(armature.pose.bones, "rootJoint", "root", "Root"),
        "hips": authoring.pick(armature.pose.bones, "hips", "pelvis", "Hips"),
        "spine_lower": authoring.pick(
            armature.pose.bones, "spinelower", "spinemid", "spine", "Spine"
        ),
        "spine_upper": authoring.pick(
            armature.pose.bones, "spineupper", "chest", "Chest"
        ),
        "neck": authoring.pick(armature.pose.bones, "neck"),
        "head": authoring.pick(armature.pose.bones, "head"),
    }
    for side in ("L", "R"):
        groups[f"{side}_shoulder"] = choose(names, side, ("shoulder", "clavicle"))
        groups[f"{side}_elbow"] = choose(names, side, ("elbow", "upperarm", "arm"))
        groups[f"{side}_wrist"] = choose(names, side, ("wrist", "hand", "forearm"))
        groups[f"{side}_upper_leg"] = choose(names, side, ("upperleg", "thigh"))
        groups[f"{side}_knee"] = choose(names, side, ("lowerleg", "knee", "shin"))
        groups[f"{side}_ankle"] = choose(names, side, ("ankle", "foot", "toe"))
    # Needle uses a compact legacy rig without L_/R_ markers. Its explicit
    # LeftArm/RightArm chain must still receive the same semantic skill pose.
    simple_chain = {
        "L": ("LeftArm", "LeftHand", "LeftLeg", "LeftFoot"),
        "R": ("RightArm", "RightHand", "RightLeg", "RightFoot"),
    }
    for side, chain in simple_chain.items():
        fallback = (
            f"{side}_shoulder",
            f"{side}_elbow",
            f"{side}_upper_leg",
            f"{side}_ankle",
        )
        for key, name in zip(fallback, chain):
            if groups[key] is None and name in names:
                groups[key] = name
        if groups[f"{side}_wrist"] is None and chain[1] in names:
            groups[f"{side}_wrist"] = chain[1]
        if groups[f"{side}_knee"] is None and chain[3] in names:
            groups[f"{side}_knee"] = chain[3]
    groups["fingers_by_side"] = {}
    for side in ("L", "R"):
        groups["fingers_by_side"][side] = {
            finger: [
                name
                for name in names
                if side_marker(name, side) and finger in authoring.token(name)
            ]
            for finger in ("index", "middle", "ring", "pinky", "thumb")
        }
    groups["wings"] = [name for name in names if "wing" in authoring.token(name)]
    groups["special"] = [
        name
        for name in names
        if any(
            token in authoring.token(name)
            for token in ("weapon", "blade", "staff", "mic", "cloud", "orb")
        )
    ]
    return groups


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def ease(value: float) -> float:
    # Cubic ease-in/out keeps adjacent explicit frame keys continuous without
    # introducing a sharp velocity change at a hold or release.
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def deg(value: float) -> float:
    return math.radians(value)


def add_pose(
    result: dict[str, tuple[float, float, float]], name: str | None, x=0.0, y=0.0, z=0.0
):
    if not name:
        return
    old = result.get(name, (0.0, 0.0, 0.0))
    result[name] = (old[0] + x, old[1] + y, old[2] + z)


PRIMARY_HANDS = {
    "needle": "R",
    "mandy": "L",
    "fairy-mina": "R",
    "brock-zeus": "R",
    "kaze": "BOTH",
    "wukong-mico": "L",
    "persephone-lumi": "BOTH",
}


def _add(pose, name, x=0.0, y=0.0, z=0.0):
    if not name:
        return
    old = pose.get(name, (0.0, 0.0, 0.0))
    pose[name] = (old[0] + x, old[1] + y, old[2] + z)


def _arms(pose, groups, frame, arms):
    for side, controls in arms.items():
        sign = -1.0 if side == "L" else 1.0
        shoulder = skill_spec.sample(frame, controls.get("shoulder", []))
        elbow = skill_spec.sample(frame, controls.get("elbow", []))
        wrist = skill_spec.sample(frame, controls.get("wrist", []))
        _add(
            pose,
            groups.get(f"{side}_shoulder"),
            x=math.radians(shoulder),
            z=math.radians(sign * controls.get("shoulder_z", 0.0)),
        )
        _add(
            pose,
            groups.get(f"{side}_elbow"),
            x=math.radians(elbow),
            z=math.radians(sign * controls.get("elbow_z", 0.0)),
        )
        _add(
            pose,
            groups.get(f"{side}_wrist"),
            x=math.radians(wrist),
            z=math.radians(sign * controls.get("wrist_z", 0.0)),
        )


def _legs(pose, groups, frame, legs):
    for side, controls in legs.items():
        sign = -1.0 if side == "L" else 1.0
        _add(
            pose,
            groups.get(f"{side}_upper_leg"),
            x=math.radians(skill_spec.sample(frame, controls.get("thigh", []))),
            z=math.radians(sign * controls.get("thigh_z", 0.0)),
        )
        _add(
            pose,
            groups.get(f"{side}_knee"),
            x=math.radians(skill_spec.sample(frame, controls.get("knee", []))),
        )
        _add(
            pose,
            groups.get(f"{side}_ankle"),
            x=math.radians(skill_spec.sample(frame, controls.get("ankle", []))),
        )


def _wings(pose, groups, frame: int, wings, amount: float):
    for index, name in enumerate(wings or []):
        wave = math.sin(frame * 0.42 + index * 0.8)
        _add(
            pose,
            name,
            x=math.radians(amount * wave),
            z=math.radians((amount * 0.35) * wave),
        )


def idle_pose(hero: str, frame: int, end: int, groups: dict) -> dict:
    """Small, readable idle loops authored from a neutral pose.

    The old idle pass layered generic deltas over the imported idle Actions.
    Those Actions use different local axes and could accumulate large twists on
    some rigs.  Idle is deliberately baseline-driven now: only semantic body
    chains receive bounded breathing, balance, and gaze offsets.
    """
    t = (frame - 1) / max(1.0, float(end - 1))
    breath = math.sin(t * math.tau)
    sway = math.sin(t * math.tau)
    gaze = math.sin(t * math.tau * 0.5)
    pose: dict[str, tuple[float, float, float]] = {}

    # Shared mass language: feet stay planted, torso breathes, and the head
    # never turns more than a few degrees from the authored neutral pose.
    add_pose(pose, groups.get("hips"), 0, deg(1.2 * sway), 0)
    add_pose(pose, groups.get("spine_lower"), deg(1.2 * sway), 0, 0)
    add_pose(pose, groups.get("spine_upper"), deg(-1.4 * breath), 0, 0)

    if hero == "mandy":
        # Staff hand and belt hand remain readable and quiet; the prop follows
        # its authored grip instead of being independently waved.
        add_pose(pose, groups.get("head"), 0, deg(2.0 * gaze), 0)
    elif hero == "fairy-mina":
        add_pose(pose, groups.get("head"), 0, 0, deg(4.0 * gaze))
        for index, name in enumerate(groups.get("wings", [])):
            add_pose(pose, name, deg(3.0 * math.sin(t * math.tau + index * 0.8)), 0, 0)
    elif hero == "brock-zeus":
        add_pose(pose, groups.get("head"), 0, deg(4.0 * gaze), 0)
        add_pose(pose, groups.get("R_shoulder"), deg(1.5 * breath), 0, 0)
    elif hero == "kaze":
        add_pose(pose, groups.get("spine_upper"), 0, deg(1.4 * sway), 0)
        add_pose(pose, groups.get("head"), 0, deg(3.0 * gaze), 0)
    elif hero == "wukong-mico":
        # A primate-like crouch is expressed through the torso, not a root
        # rotation. The free hand makes one restrained scratch gesture.
        add_pose(pose, groups.get("spine_lower"), deg(-1.8 * sway), 0, 0)
        add_pose(pose, groups.get("head"), 0, deg(4.0 * gaze), 0)
        scratch = max(0.0, math.sin(t * math.tau - math.pi / 2.0))
        add_pose(pose, groups.get("R_shoulder"), deg(3.0 * scratch), 0, 0)
        add_pose(pose, groups.get("R_elbow"), deg(-2.5 * scratch), 0, 0)
        add_pose(pose, groups.get("R_wrist"), deg(1.5 * scratch), 0, 0)
    elif hero == "persephone-lumi":
        add_pose(pose, groups.get("head"), 0, 0, deg(4.0 * gaze))
        reach = max(0.0, math.sin(t * math.tau - math.pi / 2.0))
        add_pose(pose, groups.get("R_shoulder"), deg(-4.0 * reach), 0, 0)
        add_pose(pose, groups.get("R_elbow"), deg(2.0 * reach), 0, 0)
    else:
        add_pose(pose, groups.get("head"), 0, deg(3.0 * gaze), 0)

    return pose


def brief_clip_pose(hero: str, clip: str, frame: int, end: int, groups: dict) -> dict:
    """Deterministic choreography for the non-skill clips in the motion brief."""
    t = (frame - 1) / max(1.0, float(end - 1))
    phase = math.sin(t * math.tau)
    pose: dict[str, tuple[float, float, float]] = {}
    hips = groups.get("hips")
    spine = groups.get("spine_lower")
    chest = groups.get("spine_upper")
    head = groups.get("head")

    if clip == "run":
        stride = phase
        # All run cycles keep the root grounded.  Differences are expressed as
        # character-specific weight, arm language, and secondary motion.
        run_body = {
            "needle": (-6.0, 2.5, 2.5),
            "mandy": (-2.5, 1.0, 1.5),
            "fairy-mina": (-3.0, 1.5, 1.0),
            "brock-zeus": (-8.0, 2.0, 3.0),
            "kaze": (-12.0, 3.5, 3.5),
            "wukong-mico": (-14.0, 4.0, 4.0),
            "persephone-lumi": (-4.0, 1.5, 1.5),
        }[hero]
        add_pose(pose, spine, deg(run_body[0]), deg(run_body[1] * stride), 0)
        add_pose(pose, chest, deg(run_body[2] * stride), deg(-1.5 * stride), 0)
        add_pose(pose, hips, deg(2.0 * stride), deg(2.5 * stride), 0)
        _legs(
            pose,
            groups,
            frame,
            {
                "L": {
                    "thigh": [(1, -18), (end, 18)],
                    "knee": [(1, 12), (end, 24)],
                    "ankle": [(1, -5), (end, 5)],
                },
                "R": {
                    "thigh": [(1, 18), (end, -18)],
                    "knee": [(1, 24), (end, 12)],
                    "ankle": [(1, 5), (end, -5)],
                },
            },
        )
        if hero == "mandy":
            # Both hands stabilize the staff across the torso.
            _arms(
                pose,
                groups,
                frame,
                {
                    "L": {
                        "shoulder": [(1, -10), (end, 10)],
                        "elbow": [(1, 8), (end, -8)],
                        "wrist": [(1, 0), (end, 0)],
                        "shoulder_z": -4,
                    },
                    "R": {
                        "shoulder": [(1, 10), (end, -10)],
                        "elbow": [(1, -8), (end, 8)],
                        "wrist": [(1, 0), (end, 0)],
                        "shoulder_z": 4,
                    },
                },
            )
        elif hero == "fairy-mina":
            _arms(
                pose,
                groups,
                frame,
                {
                    "R": {
                        "shoulder": [(1, -8), (end, 8)],
                        "elbow": [(1, 10), (end, -4)],
                        "wrist": [(1, 4), (end, -4)],
                    },
                    "L": {
                        "shoulder": [(1, 8), (end, -8)],
                        "elbow": [(1, -4), (end, 10)],
                        "wrist": [(1, -3), (end, 3)],
                    },
                },
            )
            _wings(pose, groups, frame, groups.get("wings", []), 10.0)
        elif hero == "brock-zeus":
            _arms(
                pose,
                groups,
                frame,
                {
                    "R": {
                        "shoulder": [(1, 12), (end, -12)],
                        "elbow": [(1, -8), (end, 8)],
                        "wrist": [(1, 0), (end, 0)],
                        "shoulder_z": 3,
                    },
                    "L": {
                        "shoulder": [(1, -8), (end, 8)],
                        "elbow": [(1, 8), (end, -8)],
                        "wrist": [(1, 0), (end, 0)],
                    },
                },
            )
        elif hero == "kaze":
            _arms(
                pose,
                groups,
                frame,
                {
                    "L": {
                        "shoulder": [(1, -16), (end, 16)],
                        "elbow": [(1, 12), (end, -8)],
                        "wrist": [(1, -4), (end, 4)],
                        "shoulder_z": -8,
                    },
                    "R": {
                        "shoulder": [(1, -16), (end, 16)],
                        "elbow": [(1, 12), (end, -8)],
                        "wrist": [(1, -4), (end, 4)],
                        "shoulder_z": 8,
                    },
                },
            )
        elif hero == "wukong-mico":
            _arms(
                pose,
                groups,
                frame,
                {
                    "L": {
                        "shoulder": [(1, -18), (end, 12)],
                        "elbow": [(1, 16), (end, -8)],
                        "wrist": [(1, 3), (end, -3)],
                    },
                    "R": {
                        "shoulder": [(1, 12), (end, -18)],
                        "elbow": [(1, -8), (end, 16)],
                        "wrist": [(1, -3), (end, 3)],
                    },
                },
            )
        else:
            _arms(
                pose,
                groups,
                frame,
                {
                    "L": {
                        "shoulder": [(1, -12), (end, 12)],
                        "elbow": [(1, 6), (end, -6)],
                        "wrist": [(1, 0), (end, 0)],
                    },
                    "R": {
                        "shoulder": [(1, 12), (end, -12)],
                        "elbow": [(1, -6), (end, 6)],
                        "wrist": [(1, 0), (end, 0)],
                    },
                },
            )
        return pose

    if clip in {"aim", "aim-super"}:
        super_aim = clip == "aim-super"
        add_pose(pose, spine, deg(-4.0 if not super_aim else -7.0), 0, 0)
        add_pose(pose, head, 0, deg(3.0 if not super_aim else 5.0), 0)
        if hero == "needle":
            arms = {
                "R": {
                    "shoulder": [(1, -14), (end, -14)],
                    "elbow": [(1, 18), (end, 18)],
                    "wrist": [(1, 4), (end, 4)],
                },
                "L": {
                    "shoulder": [(1, 8), (end, 8)],
                    "elbow": [(1, 8), (end, 8)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        elif hero == "mandy":
            arms = {
                "L": {
                    "shoulder": [
                        (1, -16 if not super_aim else -28),
                        (end, -16 if not super_aim else -28),
                    ],
                    "elbow": [(1, 12), (end, 12)],
                    "wrist": [(1, -4), (end, -4)],
                },
                "R": {
                    "shoulder": [
                        (1, 10 if not super_aim else -18),
                        (end, 10 if not super_aim else -18),
                    ],
                    "elbow": [(1, 8), (end, 8)],
                    "wrist": [(1, 2), (end, 2)],
                },
            }
        elif hero == "fairy-mina":
            arms = {
                "R": {
                    "shoulder": [
                        (1, -20 if not super_aim else -34),
                        (end, -20 if not super_aim else -34),
                    ],
                    "elbow": [(1, 18), (end, 18)],
                    "wrist": [(1, -4), (end, -4)],
                },
                "L": {
                    "shoulder": [(1, 10), (end, 10)],
                    "elbow": [(1, -8), (end, -8)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
            _wings(pose, groups, frame, groups.get("wings", []), 8.0)
        elif hero == "brock-zeus":
            arms = {
                "R": {
                    "shoulder": [
                        (1, -24 if not super_aim else -38),
                        (end, -24 if not super_aim else -38),
                    ],
                    "elbow": [(1, 12), (end, 12)],
                    "wrist": [(1, -3), (end, -3)],
                    "shoulder_z": 5,
                },
                "L": {
                    "shoulder": [(1, -10), (end, -10)],
                    "elbow": [(1, 14), (end, 14)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        elif hero == "kaze":
            arms = {
                "L": {
                    "shoulder": [
                        (1, -22 if not super_aim else -34),
                        (end, -22 if not super_aim else -34),
                    ],
                    "elbow": [(1, 22), (end, 22)],
                    "wrist": [(1, 0), (end, 0)],
                    "shoulder_z": -10,
                },
                "R": {
                    "shoulder": [
                        (1, -22 if not super_aim else -8),
                        (end, -22 if not super_aim else -8),
                    ],
                    "elbow": [(1, 22), (end, 22)],
                    "wrist": [(1, 0), (end, 0)],
                    "shoulder_z": 10,
                },
            }
        elif hero == "wukong-mico":
            arms = {
                "L": {
                    "shoulder": [
                        (1, -18 if not super_aim else -30),
                        (end, -18 if not super_aim else -30),
                    ],
                    "elbow": [(1, 10), (end, 10)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "R": {
                    "shoulder": [
                        (1, -12 if not super_aim else -26),
                        (end, -12 if not super_aim else -26),
                    ],
                    "elbow": [(1, 10), (end, 10)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        else:
            arms = {
                "R": {
                    "shoulder": [
                        (1, -22 if not super_aim else -30),
                        (end, -22 if not super_aim else -30),
                    ],
                    "elbow": [(1, 16), (end, 16)],
                    "wrist": [(1, -3), (end, -3)],
                },
                "L": {
                    "shoulder": [(1, -10), (end, -10)],
                    "elbow": [(1, 12), (end, 12)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        _arms(pose, groups, frame, arms)
        return pose

    if clip == "hit":
        recoil = 1.0 - skill_spec.sample(
            frame, [(1, 0), (max(2, int(end * 0.35)), 1), (end, 0)]
        )
        add_pose(pose, hips, deg(-7.0 * recoil), 0, 0)
        add_pose(pose, spine, deg(9.0 * recoil), 0, 0)
        add_pose(pose, chest, deg(6.0 * recoil), 0, 0)
        add_pose(pose, head, deg(4.0 * recoil), 0, 0)
        _arms(
            pose,
            groups,
            frame,
            {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.35)), -18), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.35)), 8), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                    "shoulder_z": -5,
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.35)), -18), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.35)), 8), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                    "shoulder_z": 5,
                },
            },
        )
        return pose

    if clip == "death":
        fall = skill_spec.sample(
            frame,
            [
                (1, 0),
                (max(2, int(end * 0.3)), 0.25),
                (max(3, int(end * 0.72)), 1),
                (end, 1),
            ],
        )
        fall_body = {
            "needle": (24, -10, 18, 26),
            "mandy": (22, 5, 24, 28),
            "fairy-mina": (20, -8, 22, 26),
            "brock-zeus": (-24, 8, -18, -24),
            "kaze": (26, -12, 20, 24),
            "wukong-mico": (28, -8, 22, 24),
            "persephone-lumi": (22, -8, 24, 28),
        }[hero]
        add_pose(pose, hips, deg(fall_body[0] * fall), deg(fall_body[1] * fall), 0)
        add_pose(pose, spine, deg(fall_body[2] * fall), 0, 0)
        add_pose(pose, chest, deg(fall_body[3] * fall), 0, 0)
        add_pose(pose, head, deg(10.0 * fall), 0, 0)
        _legs(
            pose,
            groups,
            frame,
            {
                "L": {
                    "thigh": [(1, 0), (end, -18)],
                    "knee": [(1, 0), (end, 18)],
                    "ankle": [(1, 0), (end, -6)],
                },
                "R": {
                    "thigh": [(1, 0), (end, 14)],
                    "knee": [(1, 0), (end, 24)],
                    "ankle": [(1, 0), (end, 6)],
                },
            },
        )
        if hero == "wukong-mico":
            _arms(
                pose,
                groups,
                frame,
                {
                    "L": {
                        "shoulder": [(1, 0), (end, 26)],
                        "elbow": [(1, 0), (end, 24)],
                        "wrist": [(1, 0), (end, 4)],
                    },
                    "R": {
                        "shoulder": [(1, 0), (end, 22)],
                        "elbow": [(1, 0), (end, 20)],
                        "wrist": [(1, 0), (end, -4)],
                    },
                },
            )
        return pose

    if clip == "spawn":
        entry = 1.0 - skill_spec.sample(
            frame, [(1, 0), (max(2, int(end * 0.55)), 1), (end, 1)]
        )
        add_pose(pose, hips, deg(8.0 * entry), 0, 0)
        add_pose(pose, spine, deg(14.0 * entry), 0, 0)
        add_pose(pose, chest, deg(-8.0 * entry), 0, 0)
        add_pose(pose, head, deg(-10.0 * entry), 0, 0)
        _legs(
            pose,
            groups,
            frame,
            {
                "L": {
                    "thigh": [(1, -10 * entry), (end, 0)],
                    "knee": [(1, 16 * entry), (end, 0)],
                    "ankle": [(1, -5 * entry), (end, 0)],
                },
                "R": {
                    "thigh": [(1, 8 * entry), (end, 0)],
                    "knee": [(1, 20 * entry), (end, 0)],
                    "ankle": [(1, 5 * entry), (end, 0)],
                },
            },
        )
        return pose

    if clip == "victory":
        celebrate = skill_spec.sample(
            frame,
            [
                (1, 0),
                (max(2, int(end * 0.22)), 1),
                (max(3, int(end * 0.72)), 1),
                (end, 0),
            ],
        )
        add_pose(pose, chest, deg(-6.0 * celebrate), 0, 0)
        add_pose(pose, head, deg(-5.0 * celebrate), 0, 0)
        if hero == "needle":
            arms = {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -18), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -8), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -32), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -14), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        elif hero == "mandy":
            arms = {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -28), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -14), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -24), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -12), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        elif hero == "brock-zeus":
            arms = {
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -30), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -12), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), 8), (end, 0)],
                    "elbow": [(1, 0), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        elif hero == "kaze":
            flash = 0.65 + 0.35 * math.sin(t * math.tau * 3.0)
            arms = {
                "L": {
                    "shoulder": [
                        (1, 0),
                        (max(2, int(end * 0.22)), -28 * flash),
                        (end, 0),
                    ],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -12), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                    "shoulder_z": -8,
                },
                "R": {
                    "shoulder": [
                        (1, 0),
                        (max(2, int(end * 0.22)), -28 * flash),
                        (end, 0),
                    ],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -12), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                    "shoulder_z": 8,
                },
            }
        elif hero == "wukong-mico":
            arms = {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -24), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), 18), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.38)), -24), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.38)), 18), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        elif hero == "persephone-lumi":
            arms = {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -22), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -8), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -26), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -12), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        else:
            arms = {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -16), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -8), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.22)), -16), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.22)), -8), (end, 0)],
                    "wrist": [(1, 0), (end, 0)],
                },
            }
        _arms(pose, groups, frame, arms)
        if hero == "fairy-mina":
            _wings(pose, groups, frame, groups.get("wings", []), 12.0)
        return pose

    return pose


def skill_pose(hero: str, clip: str, frame: int, end: int, groups: dict) -> dict:
    """Return small, semantic local rotations for one explicit frame."""
    if clip == "idle":
        return idle_pose(hero, frame, end, groups)
    if clip in {"run", "aim", "aim-super", "hit", "death", "spawn", "victory"}:
        return brief_clip_pose(hero, clip, frame, end, groups)
    if hero in skill_spec.FRAME_ENDS and clip in skill_spec.FRAME_ENDS[hero]:
        return skill_spec.profile_pose(hero, clip, frame, groups)
    t = (frame - 1) / max(1.0, float(end - 1))
    pose: dict[str, tuple[float, float, float]] = {}
    primary = PRIMARY_HANDS.get(hero, "R")
    hands = (
        ("L", "R") if primary == "BOTH" else (primary, "L" if primary == "R" else "R")
    )

    if clip == "run":
        # The legacy run actions are not retarget-safe: several of them carry
        # a root/hip rotation that turns the character on its side in the
        # focused scene. Build a restrained loop from the known idle pose so
        # the feet, hands, and held props remain attached to the same rig.
        stride = math.sin(t * math.tau)
        _add(
            pose,
            groups.get("hips"),
            x=math.radians(2.0 * stride),
            y=math.radians(2.5 * stride),
        )
        _add(
            pose,
            groups.get("spine_lower"),
            x=math.radians(-7.0),
            y=math.radians(2.0 * stride),
        )
        _add(
            pose,
            groups.get("spine_upper"),
            x=math.radians(-3.0 * stride),
            y=math.radians(-2.0 * stride),
        )
        _add(
            pose,
            groups.get("head"),
            x=math.radians(1.5 * stride),
            y=math.radians(-2.0 * stride),
        )
        _arms(
            pose,
            groups,
            frame,
            {
                "L": {
                    "shoulder": [(1, -22), (end, 22)],
                    "elbow": [(1, 12), (end, -12)],
                    "wrist": [(1, 5), (end, -5)],
                    "shoulder_z": 3,
                    "elbow_z": 2,
                },
                "R": {
                    "shoulder": [(1, 22), (end, -22)],
                    "elbow": [(1, -12), (end, 12)],
                    "wrist": [(1, -5), (end, 5)],
                    "shoulder_z": 3,
                    "elbow_z": 2,
                },
            },
        )
        _legs(
            pose,
            groups,
            frame,
            {
                "L": {
                    "thigh": [(1, -20), (end, 20)],
                    "knee": [(1, 12), (end, 24)],
                    "ankle": [(1, -6), (end, 6)],
                },
                "R": {
                    "thigh": [(1, 20), (end, -20)],
                    "knee": [(1, 24), (end, 12)],
                    "ankle": [(1, 6), (end, -6)],
                },
            },
        )

    elif clip == "attack":
        anticipation = ease(t / 0.28)
        strike = ease((t - 0.28) / 0.18)
        recover = ease((t - 0.46) / 0.42)
        wind = anticipation * (1.0 - strike)
        hit = strike * (1.0 - recover)
        settle = 1.0 - recover
        add_pose(pose, groups["hips"], deg(1.8 * wind - 1.0 * hit), deg(-1.5 * wind), 0)
        add_pose(
            pose,
            groups["spine_lower"],
            deg(-3.0 * wind + 2.0 * hit),
            deg(-2.5 * wind),
            0,
        )
        add_pose(
            pose,
            groups["spine_upper"],
            deg(-2.0 * wind + 1.5 * hit),
            deg(-2.0 * wind),
            0,
        )
        add_pose(pose, groups["head"], deg(1.5 * wind - 1.0 * hit), deg(-2.0 * wind), 0)
        for side in hands:
            strength = 1.0 if primary == "BOTH" or side == primary else 0.48
            sign = -1.0 if side == "L" else 1.0
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(strength * (-8.0 * wind + 12.0 * hit)),
                deg(sign * strength * 2.5 * wind),
                deg(sign * strength * 2.0 * hit),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(strength * (7.0 * wind - 13.0 * hit)),
                0,
                deg(sign * strength * 2.0 * hit),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(strength * (-3.0 * wind + 8.0 * hit)),
                deg(sign * strength * 1.5 * hit),
                0,
            )
        # Keep the recovery visibly connected to the held prop rather than
        # snapping the wrist back in a single frame.
        if settle > 0:
            for side in hands:
                if primary == "BOTH" or side == primary:
                    add_pose(pose, groups[f"{side}_wrist"], deg(-2.0 * settle), 0, 0)

    elif clip == "super":
        charge = ease(t / 0.30)
        reach = ease((t - 0.28) / 0.22)
        recover = ease((t - 0.56) / 0.44)
        low = charge * (1.0 - reach)
        contact = reach * (1.0 - recover)
        lift = (1.0 - recover) * ease((t - 0.40) / 0.34)
        add_pose(
            pose, groups["hips"], deg(2.5 * low - 1.0 * lift), deg(-1.5 * contact), 0
        )
        add_pose(
            pose,
            groups["spine_lower"],
            deg(-4.0 * low + 3.0 * lift),
            deg(-2.0 * contact),
            0,
        )
        add_pose(
            pose,
            groups["spine_upper"],
            deg(-2.5 * low + 2.0 * lift),
            deg(-2.5 * contact),
            0,
        )
        add_pose(
            pose, groups["head"], deg(2.0 * low - 1.5 * lift), deg(-2.0 * contact), 0
        )
        for side in hands:
            strength = 1.0 if primary == "BOTH" or side == primary else 0.72
            sign = -1.0 if side == "L" else 1.0
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(strength * (7.0 * low - 15.0 * contact - 5.0 * lift)),
                deg(sign * strength * 3.0 * contact),
                deg(sign * strength * 2.0 * contact),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(strength * (-5.0 * low + 12.0 * contact)),
                0,
                deg(sign * strength * 2.0 * contact),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(strength * (-2.0 * low + 9.0 * contact + 2.0 * lift)),
                deg(sign * strength * 1.5 * contact),
                0,
            )

    elif clip == "gadget":
        charge = ease(t / 0.25)
        release = ease((t - 0.34) / 0.20)
        settle = ease((t - 0.60) / 0.40)
        pulse = charge * (1.0 - release) + release * (1.0 - settle)
        add_pose(pose, groups["hips"], deg(1.8 * pulse), deg(-1.0 * pulse), 0)
        add_pose(pose, groups["spine_lower"], deg(-3.0 * pulse), deg(2.0 * pulse), 0)
        add_pose(pose, groups["spine_upper"], deg(-2.0 * pulse), deg(2.5 * pulse), 0)
        add_pose(pose, groups["head"], deg(-1.5 * pulse), deg(-2.0 * pulse), 0)
        for side in hands:
            strength = 1.0 if primary == "BOTH" or side == primary else 0.48
            sign = -1.0 if side == "L" else 1.0
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(strength * (-7.0 * pulse)),
                deg(sign * strength * 2.0 * pulse),
                deg(sign * strength * 1.5 * pulse),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(strength * 6.0 * pulse),
                0,
                deg(sign * strength * 1.5 * pulse),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(strength * (-3.0 * pulse)),
                deg(sign * strength * 1.0 * pulse),
                0,
            )

    elif clip in {"aim", "aim-super"}:
        add_pose(pose, groups.get("spine_upper"), deg(-4.0), 0, 0)
        add_pose(pose, groups.get("head"), 0, deg(4.0), 0)
        _arms(
            pose,
            groups,
            frame,
            {
                "L": {
                    "shoulder": [(1, -8), (end, -8)],
                    "elbow": [(1, 10), (end, 10)],
                    "wrist": [(1, -4), (end, -4)],
                },
                "R": {
                    "shoulder": [(1, 6), (end, 6)],
                    "elbow": [(1, 8), (end, 8)],
                    "wrist": [(1, 2), (end, 2)],
                },
            },
        )

    elif clip == "hit":
        recoil = 1.0 - skill_spec.sample(
            frame, [(1, 0), (max(2, int(end * 0.35)), 1), (end, 0)]
        )
        add_pose(pose, groups.get("hips"), deg(-8.0 * recoil), 0, 0)
        add_pose(pose, groups.get("spine_lower"), deg(10.0 * recoil), 0, 0)
        add_pose(pose, groups.get("spine_upper"), deg(6.0 * recoil), 0, 0)
        add_pose(pose, groups.get("head"), deg(4.0 * recoil), 0, 0)

    elif clip == "victory":
        celebrate = skill_spec.sample(
            frame,
            [
                (1, 0),
                (max(2, int(end * 0.25)), 1),
                (max(3, int(end * 0.7)), 1),
                (end, 0),
            ],
        )
        add_pose(pose, groups.get("spine_upper"), deg(-8.0 * celebrate), 0, 0)
        add_pose(pose, groups.get("head"), deg(-6.0 * celebrate), 0, 0)
        _arms(
            pose,
            groups,
            frame,
            {
                "L": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.25)), -22), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.25)), -8), (end, 0)],
                },
                "R": {
                    "shoulder": [(1, 0), (max(2, int(end * 0.25)), -18), (end, 0)],
                    "elbow": [(1, 0), (max(2, int(end * 0.25)), -6), (end, 0)],
                },
            },
        )

    elif clip == "death":
        fall = skill_spec.sample(
            frame, [(1, 0), (max(2, int(end * 0.65)), 1), (end, 1)]
        )
        add_pose(pose, groups.get("hips"), deg(35.0 * fall), deg(-12.0 * fall), 0)
        add_pose(pose, groups.get("spine_lower"), deg(28.0 * fall), 0, 0)
        add_pose(pose, groups.get("spine_upper"), deg(38.0 * fall), 0, 0)
        add_pose(pose, groups.get("head"), deg(18.0 * fall), 0, 0)
        _legs(
            pose,
            groups,
            frame,
            {
                "L": {"thigh": [(1, 0), (end, -24)], "knee": [(1, 0), (end, 20)]},
                "R": {"thigh": [(1, 0), (end, 16)], "knee": [(1, 0), (end, 28)]},
            },
        )

    elif clip == "spawn":
        rise = skill_spec.sample(frame, [(1, 0), (max(2, int(end * 0.7)), 1), (end, 1)])
        add_pose(pose, groups.get("spine_lower"), deg(12.0 * (1.0 - rise)), 0, 0)
        add_pose(pose, groups.get("spine_upper"), deg(-8.0 * (1.0 - rise)), 0, 0)
        add_pose(pose, groups.get("head"), deg(-12.0 * (1.0 - rise)), 0, 0)

    return pose


def capture_rotations(armature):
    result = {}
    for bone in armature.pose.bones:
        if bone.rotation_mode == "QUATERNION":
            rotation = bone.rotation_quaternion.copy()
        elif bone.rotation_mode == "AXIS_ANGLE":
            rotation = Quaternion(
                (
                    bone.rotation_axis_angle[1],
                    bone.rotation_axis_angle[2],
                    bone.rotation_axis_angle[3],
                ),
                bone.rotation_axis_angle[0],
            )
        else:
            rotation = bone.rotation_euler.to_quaternion()
        result[bone.name] = rotation
    return result


def set_rotation(bone, rotation: Quaternion):
    # One uniform rotation channel type avoids Euler-order differences between
    # the eight rigs and exports cleanly as glTF quaternion tracks.
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = rotation
    bone.location = (0.0, 0.0, 0.0)
    bone.scale = (1.0, 1.0, 1.0)


def apply_pose(armature, baseline, pose):
    for bone in armature.pose.bones:
        set_rotation(bone, baseline[bone.name])
    for name, delta in pose.items():
        bone = armature.pose.bones.get(name)
        if bone is not None:
            set_rotation(bone, baseline[name] @ Euler(delta, "XYZ").to_quaternion())


def key_rotations(armature, frame: int):
    for bone in armature.pose.bones:
        bone.keyframe_insert(
            data_path="rotation_quaternion", frame=frame, group=bone.name
        )


def remove_existing_action(name: str):
    for action in list(bpy.data.actions):
        if action.name.casefold().split(".")[0] != name.casefold():
            continue
        if action.users == 0:
            bpy.data.actions.remove(action)
        else:
            # The master may keep a source action referenced by an NLA strip.
            # Keep that strip valid, but free the canonical runtime name for
            # the newly-authored action.
            action.name = f"__SOURCE__{name}__{len(bpy.data.actions)}"


def finalize_action_name(action, canonical_name: str, hero: str, clip: str):
    """Remove canonical-name collisions before the focused scene is saved."""
    for existing in list(bpy.data.actions):
        if existing == action:
            continue
        if existing.name.casefold().split(".")[0] != canonical_name.casefold():
            continue
        if existing.users == 0:
            bpy.data.actions.remove(existing)
        else:
            existing.name = f"__SOURCE__{hero}_{clip}_{len(bpy.data.actions)}"
    action.name = canonical_name
    return action


def author_scene(hero: str, clip: str, target: Path):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master_path(hero)))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    armature.animation_data_create()
    idle_path = SOURCE / hero / "animations" / "idle.blend"
    idle_action = authoring.import_source_action(idle_path, "Idle")
    armature.animation_data.action = idle_action
    idle_start, _idle_end = (
        authoring.action_frame_range(idle_action) if idle_action else (1, 1)
    )
    scene.frame_set(int(idle_start))
    baseline = capture_rotations(armature)
    action_name = {
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
    }[clip]
    remove_existing_action(action_name)
    action = bpy.data.actions.new(f"__AUTHORED__{hero}_{clip}")
    armature.animation_data.action = action
    end = (
        authoring.HERO_FRAMES[hero][clip]
        if clip in authoring.HERO_FRAMES[hero]
        else skill_spec.FRAME_ENDS[hero][clip]
    )
    groups = rig_groups(armature)
    for frame in range(1, end + 1):
        scene.frame_set(frame)
        apply_pose(armature, baseline, skill_pose(hero, clip, frame, end, groups))
        key_rotations(armature, frame)
    authoring.smooth_action(action)
    action = finalize_action_name(action, action_name, hero, clip)
    armature.animation_data.action = action
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = end
    scene.frame_set(1)
    scene.name = f"{hero}_{clip}_authored"
    scene["hero_slug"] = hero
    scene["clip_name"] = action_name
    scene["clip_kind"] = "locomotion" if clip in {"idle", "run"} else "event"
    scene["frame_start"] = 1
    scene["frame_end"] = end
    scene["fps"] = 30
    scene["authoring_status"] = "AUTHORED_FRAME_BY_FRAME"
    scene["authoring_method"] = METHOD
    scene["source_of_truth"] = (
        f"{idle_path.relative_to(ROOT)}::Idle baseline + semantic skill pose"
    )
    root_motion_meters = (
        {"needle": {"gadget": 8.0}, "kaze": {"super": 12.0}}
        .get(hero, {})
        .get(clip, 0.0)
    )
    skill_event_frames = json.dumps(
        skill_spec.EVENT_FRAMES.get(hero, {}).get(clip, {}),
        ensure_ascii=False,
        sort_keys=True,
    )
    scene["root_motion_contract"] = (
        "gameplay_root_stays_grounded; root_motion_meters_in_event_metadata"
    )
    scene["root_motion_meters"] = root_motion_meters
    scene["skill_event_frames"] = skill_event_frames
    target.parent.mkdir(parents=True, exist_ok=True)
    for backup in (Path(f"{target}1"), Path(f"{target}@")):
        if backup.exists():
            backup.unlink()
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=True
    )
    return {
        "hero": hero,
        "clip": clip,
        "frame_end": end,
        "action": action_name,
        "file": str(target.relative_to(ROOT)),
        "method": METHOD,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", default="*")
    parser.add_argument(
        "--clips",
        nargs="+",
        default=[
            "idle",
            "run",
            "attack",
            "super",
            "aim",
            "aim-super",
            "hit",
            "death",
            "spawn",
            "victory",
        ],
    )
    forwarded = (
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    )
    args = parser.parse_args(forwarded)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    heroes = manifest["heroes"] if args.hero == "*" else [args.hero]
    report = []
    for hero in heroes:
        for clip in args.clips:
            report.append(
                author_scene(hero, clip, SOURCE / hero / "scenes" / f"{clip}.blend")
            )
    out = ROOT / "artifacts" / "hero-skill-animation-scene-pack-v2.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {"scenes": len(report), "output": os.fspath(out), "method": METHOD},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
