"""Re-author canonical hero Actions with a compact, readable Brawl-style pass.

The script keeps every master mesh, rig, socket, prop and companion intact. It
resamples each existing Action at a small number of normalized key poses, adds
hero-specific anticipation/impact/hold/recovery accents, then writes the Action
back into the same master. The exporter remains packaging-only.
"""

from __future__ import annotations

import math
import os
import re
import sys
from pathlib import Path

import bpy
from mathutils import Euler

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import ALL_HEROES, actions_for, master_path

FPS = 30
STYLE_REVISION = "brawl-readable-v1"
RANGES = {
    "idle": (1, 60),
    "run": (1, 20),
    "attack": (1, 25),
    "super": (1, 40),
    "aim": (1, 15),
    "aim-super": (1, 15),
    "hit": (1, 12),
    "death": (1, 45),
    "spawn": (1, 30),
    "victory": (1, 90),
    "gadget": (1, 20),
    "stunned": (1, 30),
}
KEYS = {
    "idle": (1, 15, 30, 45, 60),
    "run": (1, 5, 10, 15, 20),
    "attack": (1, 5, 10, 13, 18, 25),
    "super": (1, 8, 18, 22, 28, 40),
    "aim": (1, 4, 8, 15),
    "aim-super": (1, 4, 8, 15),
    "hit": (1, 3, 6, 9, 12),
    "death": (1, 10, 22, 34, 45),
    "spawn": (1, 7, 15, 23, 30),
    "victory": (1, 18, 36, 54, 72, 90),
    "gadget": (1, 5, 10, 14, 20),
    "stunned": (1, 5, 10, 13, 16, 19, 22, 25, 30),
}
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
    "stunned": "Stunned",
}

# Values are intentionally restrained. The existing source pose is the base;
# these accents provide the readable hit while avoiding a rigid generic pose.
STYLE = {
    "needle": {"lean": 0.20, "spread": 0.34, "bend": 0.18, "squash": 0.06},
    "mandy": {"lean": 0.14, "spread": 0.30, "bend": 0.12, "squash": 0.05},
    "fairy-mina": {"lean": 0.17, "spread": 0.42, "bend": 0.10, "squash": 0.04},
    "brock-zeus": {"lean": 0.12, "spread": 0.28, "bend": 0.10, "squash": 0.04},
    "kaze": {"lean": 0.22, "spread": 0.38, "bend": 0.22, "squash": 0.06},
    "wukong-mico": {"lean": 0.24, "spread": 0.48, "bend": 0.25, "squash": 0.07},
    "persephone-lumi": {"lean": 0.10, "spread": 0.24, "bend": 0.12, "squash": 0.04},
    "katty": {"lean": 0.18, "spread": 0.40, "bend": 0.20, "squash": 0.06},
}


def find_armature():
    return next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )


def pick(names, *patterns):
    for pattern in patterns:
        regex = re.compile(pattern, re.IGNORECASE)
        for name in names:
            if regex.fullmatch(name):
                return name
    return None


def pick_all(names, *patterns):
    regexes = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    return [name for name in names if any(regex.fullmatch(name) for regex in regexes)]


def side_rig(names, side):
    # Most rigs use L_/R_ prefixes, while Needle uses Left*/Right* names.
    prefix = r"(?:L_|Left)" if side == "L" else r"(?:R_|Right)"
    return {
        "shoulder": pick(
            names,
            rf"{prefix}(?:_)?(?:Shoulder|shoulder|Clavicle|clavicle|Arm)(?:_\d+)?",
            rf"{prefix}(?:_)?clavicle_s",
        ),
        "elbow": pick(
            names, rf"{prefix}(?:_)?(?:Elbow|elbow|Forearm|forearm)(?:_\d+)?"
        ),
        "wrist": pick(names, rf"{prefix}(?:_)?(?:Hand|hand|Wrist|wrist)(?:_\d+)?"),
        "upper_arm": pick(
            names,
            rf"{prefix}(?:_)?(?:upper_shoulder_0_bend|upperarm|UpperArm)(?:_s)?(?:_\d+)?",
        ),
        "leg": pick(
            names,
            rf"{prefix}(?:_)?(?:Hip|hip|leg|Leg|upperLeg|upper_leg_0_bend)(?:_s)?(?:_\d+)?",
        ),
        "knee": pick(
            names,
            rf"{prefix}(?:_)?(?:Knee|knee|lowerLeg|LowerLeg|lower_leg_0_bend|lower_knee_0_bend)(?:_s)?(?:_\d+)?",
        ),
        "foot": pick(
            names, rf"{prefix}(?:_)?(?:Ankle|ankle|Foot|foot)(?:_s)?(?:_\d+)?"
        ),
    }


def resolve_rig(armature):
    names = [bone.name for bone in armature.data.bones]
    return {
        "root": pick(names, r"Root", r"_rootJoint"),
        "pelvis": pick(names, r"Pelvis", r"hips(?:_s)?(?:_\d+)?"),
        "body": pick_all(
            names,
            r"Spine",
            r"spine_(?:lower|mid|middle|upper)(?:_s\d*|_s_\d+)?",
            r"spine_mid(?:_lower|_upper)?_s",
            r"Chest",
            r"chest_s(?:_\d+)?",
        ),
        "neck": pick(names, r"Neck", r"neck_s(?:_\d+)?"),
        "head": pick(names, r"Head", r"head_s(?:_\d+)?"),
        "left": side_rig(names, "L"),
        "right": side_rig(names, "R"),
        "wings": pick_all(names, r"[LR]_wing_(?:up|down)_s"),
        "tail": pick_all(names, r"Tail_\d+_s"),
        "flower": pick(names, r"Flower"),
        "fans": pick_all(names, r"[LR]_(?:weapon|side_[AB]_weapon)_s"),
        "cloud": pick_all(names, r"Cloud_\d+_s"),
        "bottle": pick(names, r"bottle_s"),
        "board": pick(names, r"skateboard_s"),
        "staff": pick_all(
            names, r"[LR]_weapon(?:_top)?_s", r"MIC_Handel_s", r"weapon_socket_[lr]"
        ),
    }


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", ()):
                curves.extend(bag.fcurves)
    return curves


def find_action(name):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def clone_pose(pose):
    return {
        name: {
            key: value.copy() if hasattr(value, "copy") else value
            for key, value in data.items()
        }
        for name, data in pose.items()
    }


def blend_pose_towards(pose, target, weight, skip_names=()):
    """Blend a sampled pose toward a stable reference without Euler jumps."""
    weight = max(0.0, min(1.0, weight))
    skipped = set(skip_names)
    for name, data in pose.items():
        if name in skipped or name not in target:
            continue
        reference = target[name]
        data["location"] = (
            data["location"] * (1.0 - weight) + reference["location"] * weight
        )
        data["scale"] = data["scale"] * (1.0 - weight) + reference["scale"] * weight
        if data["mode"] == "QUATERNION":
            data["rotation_quaternion"] = data["rotation_quaternion"].slerp(
                reference["rotation_quaternion"], weight
            )
        else:
            data["rotation_euler"] = Euler(
                tuple(
                    data["rotation_euler"][index] * (1.0 - weight)
                    + reference["rotation_euler"][index] * weight
                    for index in range(3)
                ),
                (
                    data["mode"]
                    if data["mode"] in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
                    else "XYZ"
                ),
            )


def capture_pose(armature):
    result = {}
    for bone in armature.pose.bones:
        data = {
            "mode": bone.rotation_mode,
            "location": bone.location.copy(),
            "scale": bone.scale.copy(),
        }
        if bone.rotation_mode == "QUATERNION":
            data["rotation_quaternion"] = bone.rotation_quaternion.copy()
        else:
            data["rotation_euler"] = bone.rotation_euler.copy()
        result[bone.name] = data
    return result


def apply_rotation(data, x=0.0, y=0.0, z=0.0):
    offsets = (x, y, z)
    if data["mode"] == "QUATERNION":
        data["rotation_quaternion"] = (
            data["rotation_quaternion"] @ Euler(offsets, "XYZ").to_quaternion()
        )
        return
    mode = (
        data["mode"]
        if data["mode"] in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
        else "XYZ"
    )
    data["rotation_euler"] = Euler(
        tuple(data["rotation_euler"][index] + offsets[index] for index in range(3)),
        mode,
    )


def smooth(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def profile(clip, t):
    if clip == "idle":
        return {
            "sway": math.sin(t * math.tau),
            "breath": math.sin(t * math.tau * 2.0),
            "squash": 0.0,
            "impact": 0.0,
            "windup": 0.0,
            "hold": 0.0,
            "recover": 0.0,
        }
    if clip == "run":
        return {
            "sway": math.sin(t * math.tau),
            "stride": math.sin(t * math.tau),
            "bounce": abs(math.sin(t * math.tau)),
            "lean": 1.0,
            "squash": 0.0,
            "impact": 0.0,
            "windup": 0.0,
            "hold": 0.0,
            "recover": 0.0,
        }
    if clip in {"attack", "super", "gadget"}:
        wind_end = {"attack": 0.24, "super": 0.32, "gadget": 0.28}[clip]
        release_end = {"attack": 0.45, "super": 0.54, "gadget": 0.50}[clip]
        hold_end = {"attack": 0.56, "super": 0.66, "gadget": 0.64}[clip]
        windup = smooth(t / wind_end) if t < wind_end else 1.0
        impact = (
            smooth((t - wind_end) / max(0.01, release_end - wind_end))
            if wind_end <= t < release_end
            else (1.0 if t >= release_end else 0.0)
        )
        hold = 1.0 if release_end <= t <= hold_end else 0.0
        recover = (
            smooth((t - hold_end) / max(0.01, 1.0 - hold_end)) if t > hold_end else 0.0
        )
        return {
            "sway": 0.0,
            "windup": windup,
            "impact": impact,
            "hold": hold,
            "recover": recover,
            "squash": max(0.0, windup - impact * 0.85),
        }
    if clip in {"aim", "aim-super"}:
        return {
            "hold": smooth(t / 0.20),
            "sway": 0.0,
            "windup": 0.0,
            "impact": 0.0,
            "recover": 0.0,
            "squash": 0.0,
        }
    if clip == "hit":
        recoil = smooth(t / 0.22) if t < 0.22 else smooth(1.0 - (t - 0.22) / 0.78)
        return {
            "recoil": recoil,
            "squash": recoil * 0.55,
            "sway": 0.0,
            "windup": 0.0,
            "impact": 0.0,
            "recover": 0.0,
        }
    if clip == "death":
        collapse = smooth(t / 0.78)
        return {
            "collapse": collapse,
            "squash": max(0.0, collapse - 0.65),
            "sway": 0.0,
            "windup": 0.0,
            "impact": 0.0,
            "recover": 0.0,
        }
    if clip == "spawn":
        rise = smooth(t / 0.62)
        settle = smooth((t - 0.70) / 0.30) if t > 0.70 else 0.0
        return {
            "rise": rise,
            "settle": settle,
            "squash": max(0.0, 1.0 - rise) * 0.9,
            "sway": 0.0,
            "windup": 0.0,
            "impact": 0.0,
            "recover": 0.0,
        }
    if clip == "victory":
        bounce = math.sin(t * math.tau * 2.0) * max(
            0.0, 1.0 - smooth((t - 0.70) / 0.30)
        )
        bow = smooth((t - 0.76) / 0.24) if t > 0.76 else 0.0
        return {
            "bounce": bounce,
            "bow": bow,
            "sway": 0.0,
            "squash": max(0.0, -bounce) * 0.4,
            "windup": 0.0,
            "impact": 0.0,
            "recover": 0.0,
        }
    return {
        "sway": 0.0,
        "squash": 0.0,
        "windup": 0.0,
        "impact": 0.0,
        "hold": 0.0,
        "recover": 0.0,
    }


def rotate_side(pose, side, x=0.0, y=0.0, z=0.0):
    for key in ("shoulder", "upper_arm", "elbow", "wrist"):
        name = side.get(key)
        if name:
            factor = {"shoulder": 1.0, "upper_arm": 0.55, "elbow": 0.40, "wrist": 0.18}[
                key
            ]
            apply_rotation(pose[name], x=x * factor, y=y * factor, z=z * factor)


def scale_body(pose, rig, squash, stretch=0.0):
    for name in rig["body"]:
        data = pose[name]
        data["scale"].x *= 1.0 + squash + stretch
        data["scale"].y *= 1.0 - squash + stretch * 0.45
        data["scale"].z *= 1.0 + squash + stretch


def secondary_motion(pose, rig, clip, t, amount):
    for index, name in enumerate(rig["wings"]):
        apply_rotation(
            pose[name],
            x=math.sin(t * math.tau * 2.0 + index) * 0.05
            + amount * (0.20 if clip in {"super", "gadget"} else 0.0),
        )
    for index, name in enumerate(rig["tail"]):
        apply_rotation(
            pose[name], z=math.sin(t * math.tau + index * 0.5) * 0.07 * max(0.4, amount)
        )
    if rig["flower"]:
        apply_rotation(
            pose[rig["flower"]],
            z=math.sin(t * math.tau * 2.0) * 0.10 * max(0.4, amount),
        )
    for index, name in enumerate(rig["fans"]):
        apply_rotation(
            pose[name],
            y=math.sin(t * math.tau * 2.0 + index) * 0.06 * max(0.35, amount),
        )
    for index, name in enumerate(rig["cloud"]):
        apply_rotation(
            pose[name], z=math.sin(t * math.tau + index) * 0.035 * max(0.5, amount)
        )
    if rig["bottle"]:
        apply_rotation(
            pose[rig["bottle"]],
            z=math.sin(t * math.tau * 2.0) * 0.08 * max(0.4, amount),
        )
    if rig["board"]:
        apply_rotation(
            pose[rig["board"]], y=math.sin(t * math.tau) * 0.06 * max(0.4, amount)
        )


def special_pose(pose, rig, hero, clip, values):
    style = STYLE[hero]
    left, right = rig["left"], rig["right"]
    t = values.get("_t", 0.0)
    attack = values.get("impact", 0.0)
    wind = values.get("windup", 0.0)
    if clip == "idle":
        sway = values.get("sway", 0.0)
        for name in rig["body"]:
            apply_rotation(
                pose[name], z=sway * 0.045, x=values.get("breath", 0.0) * 0.018
            )
        rotate_side(pose, left, z=-sway * 0.045)
        rotate_side(pose, right, z=-sway * 0.045)
        if rig["head"]:
            apply_rotation(pose[rig["head"]], z=-sway * 0.055)
        scale_body(pose, rig, 0.0, values.get("breath", 0.0) * 0.008)
        secondary_motion(pose, rig, clip, t, 0.65)
        return
    if clip == "run":
        stride = values.get("stride", 0.0)
        rotate_side(pose, left, x=-stride * 0.32, z=-stride * 0.10)
        rotate_side(pose, right, x=stride * 0.32, z=stride * 0.10)
        if left.get("leg"):
            apply_rotation(pose[left["leg"]], x=stride * 0.20)
        if right.get("leg"):
            apply_rotation(pose[right["leg"]], x=-stride * 0.20)
        if left.get("knee"):
            apply_rotation(pose[left["knee"]], x=max(0.0, stride) * style["bend"])
        if right.get("knee"):
            apply_rotation(pose[right["knee"]], x=max(0.0, -stride) * style["bend"])
        for name in rig["body"]:
            apply_rotation(pose[name], x=style["lean"] * 0.55, z=stride * 0.025)
        scale_body(pose, rig, 0.0, -values.get("bounce", 0.0) * 0.018)
        secondary_motion(pose, rig, clip, t, 0.75)
        return
    if clip == "attack":
        swing = attack - wind * 0.86
        if hero in {"kaze", "wukong-mico"}:
            rotate_side(pose, left, x=-swing * 0.75, z=-swing * style["spread"] * 0.60)
            rotate_side(pose, right, x=swing * 0.75, z=swing * style["spread"] * 0.60)
        else:
            rotate_side(pose, right, x=swing * 1.10, z=swing * style["spread"] * 0.70)
            rotate_side(pose, left, x=-swing * 0.25, z=-swing * style["spread"] * 0.22)
        for name in rig["body"]:
            apply_rotation(
                pose[name],
                x=(wind * style["lean"] * 0.55 - attack * style["lean"] * 0.8),
                z=swing * 0.18,
            )
        if hero == "kaze" and right.get("knee"):
            apply_rotation(pose[right["knee"]], x=-attack * 0.65)
        if hero == "needle" and rig["flower"]:
            apply_rotation(pose[rig["flower"]], x=-wind * 0.25 + attack * 0.40)
        if hero == "katty" and rig["bottle"]:
            apply_rotation(pose[rig["bottle"]], z=attack * 0.22)
        if hero == "mandy":
            for name in rig["staff"]:
                apply_rotation(pose[name], y=swing * 0.85, z=swing * 0.18)
        elif hero == "kaze":
            for name in rig["fans"]:
                apply_rotation(pose[name], y=attack * 0.18, z=swing * 0.40)
        elif hero == "wukong-mico":
            for name in rig["staff"]:
                apply_rotation(pose[name], y=-swing * 0.72, z=swing * 0.16)
            for index, name in enumerate(rig["tail"]):
                apply_rotation(pose[name], z=attack * (0.16 - index * 0.025))
        elif hero == "persephone-lumi":
            for name in rig["staff"]:
                apply_rotation(pose[name], y=-swing * 0.52, z=swing * 0.22)
        scale_body(
            pose,
            rig,
            values.get("squash", 0.0) * style["squash"],
            attack * style["squash"] * 0.90,
        )
        secondary_motion(pose, rig, clip, t, 1.0)
        return
    if clip == "super":
        if hero in {"needle", "fairy-mina", "wukong-mico"}:
            rotate_side(
                pose,
                left,
                x=-wind * 0.60 + attack * 0.90,
                z=-wind * 0.30 + attack * 0.20,
            )
            rotate_side(
                pose,
                right,
                x=-wind * 0.60 + attack * 0.90,
                z=wind * 0.30 - attack * 0.20,
            )
        else:
            rotate_side(pose, left, x=-wind * 0.35 + attack * 0.55, z=-wind * 0.22)
            rotate_side(pose, right, x=-wind * 0.60 + attack * 0.90, z=wind * 0.22)
        for name in rig["body"]:
            apply_rotation(
                pose[name],
                x=-wind * style["lean"] * 0.65 + attack * style["lean"] * 0.85,
            )
        if hero == "needle" and rig["flower"]:
            apply_rotation(pose[rig["flower"]], x=-wind * 0.35 + attack * 0.55)
        if hero == "brock-zeus":
            for name in rig["cloud"]:
                apply_rotation(
                    pose[name], x=-wind * 0.20 + attack * 0.28, z=attack * 0.12
                )
        if hero == "katty" and rig["board"]:
            apply_rotation(pose[rig["board"]], y=-wind * 0.12 + attack * 0.22)
        if hero == "fairy-mina":
            for index, name in enumerate(rig["wings"]):
                apply_rotation(
                    pose[name], z=(0.42 if index % 2 == 0 else -0.42) * attack
                )
        elif hero == "brock-zeus":
            for name in rig["cloud"]:
                pose[name]["scale"] *= 1.0 + attack * 0.18 - wind * 0.08
        elif hero == "kaze":
            for name in rig["fans"]:
                apply_rotation(
                    pose[name], z=(0.30 if name in rig["fans"][::2] else -0.30) * attack
                )
        elif hero == "wukong-mico":
            for name in rig["staff"]:
                apply_rotation(pose[name], y=-attack * 0.46)
            for index, name in enumerate(rig["tail"]):
                apply_rotation(pose[name], z=attack * (0.22 - index * 0.035))
        elif hero == "persephone-lumi":
            for name in rig["staff"]:
                apply_rotation(pose[name], x=-wind * 0.28 + attack * 0.40)
        scale_body(
            pose,
            rig,
            values.get("squash", 0.0) * style["squash"],
            attack * style["squash"],
        )
        secondary_motion(pose, rig, clip, t, 1.0)
        return
    if clip == "gadget":
        if hero in {"fairy-mina", "persephone-lumi", "needle"}:
            rotate_side(pose, left, x=attack * 0.75, z=-attack * style["spread"])
            rotate_side(pose, right, x=attack * 0.75, z=attack * style["spread"])
        elif hero == "mandy":
            rotate_side(pose, left, x=attack * 0.45, z=attack * 0.85)
            rotate_side(pose, right, x=attack * 0.45, z=-attack * 0.85)
        elif hero == "kaze":
            rotate_side(pose, left, x=-wind * 0.60 + attack * 0.90, z=-wind * 0.25)
            rotate_side(pose, right, x=-wind * 0.60 + attack * 0.90, z=wind * 0.25)
        else:
            rotate_side(
                pose,
                right,
                x=-wind * 0.60 + attack * 0.90,
                z=attack * style["spread"] * 0.65,
            )
            rotate_side(
                pose,
                left,
                x=-wind * 0.25 + attack * 0.30,
                z=-attack * style["spread"] * 0.30,
            )
        for name in rig["body"]:
            apply_rotation(
                pose[name],
                x=wind * style["lean"] * 0.55 - attack * style["lean"] * 0.45,
            )
        if hero == "wukong-mico":
            rotate_side(pose, left, x=attack * 0.35, z=attack * 0.45)
            rotate_side(pose, right, x=attack * 0.35, z=-attack * 0.45)
        if hero == "katty" and rig["board"]:
            apply_rotation(pose[rig["board"]], y=attack * 0.18)
        if hero == "needle" and rig["flower"]:
            apply_rotation(pose[rig["flower"]], z=attack * 0.35)
        elif hero == "brock-zeus":
            for name in rig["cloud"]:
                pose[name]["scale"] *= 1.0 + attack * 0.10
        scale_body(
            pose,
            rig,
            values.get("squash", 0.0) * style["squash"],
            attack * style["squash"] * 0.65,
        )
        secondary_motion(pose, rig, clip, t, 1.0)
        return
    if clip == "aim":
        hold = values.get("hold", 0.0)
        rotate_side(pose, right, x=hold * 0.72, z=hold * style["spread"] * 0.35)
        rotate_side(pose, left, x=hold * 0.18, z=-hold * style["spread"] * 0.20)
        for name in rig["body"]:
            apply_rotation(pose[name], x=hold * style["lean"] * 0.45)
        if rig["head"]:
            apply_rotation(pose[rig["head"]], x=-hold * 0.10)
        return
    if clip == "aim-super":
        hold = values.get("hold", 0.0)
        rotate_side(pose, left, x=-hold * 0.65, z=-hold * style["spread"] * 0.25)
        rotate_side(pose, right, x=-hold * 0.65, z=hold * style["spread"] * 0.25)
        for name in rig["body"]:
            apply_rotation(pose[name], x=-hold * style["lean"] * 0.45)
        if rig["head"]:
            apply_rotation(pose[rig["head"]], x=hold * 0.12)
        return
    if clip == "hit":
        recoil = values.get("recoil", 0.0)
        for name in rig["body"]:
            apply_rotation(pose[name], x=-recoil * style["lean"] * 1.5, z=recoil * 0.12)
        rotate_side(pose, left, x=-recoil * 0.25, z=-recoil * style["spread"] * 0.75)
        rotate_side(pose, right, x=-recoil * 0.25, z=recoil * style["spread"] * 0.75)
        scale_body(pose, rig, values.get("squash", 0.0) * style["squash"])
        secondary_motion(pose, rig, clip, t, 0.65)
        return
    if clip == "death":
        collapse = values.get("collapse", 0.0)
        for index, name in enumerate(rig["body"]):
            apply_rotation(
                pose[name], z=collapse * (0.50 + index * 0.12), x=collapse * 0.16
            )
        rotate_side(pose, left, x=collapse * 0.48, z=-collapse * 0.32)
        rotate_side(pose, right, x=collapse * 0.48, z=collapse * 0.32)
        for side in (left, right):
            if side.get("knee"):
                apply_rotation(pose[side["knee"]], x=collapse * style["bend"] * 2.0)
        if rig["head"]:
            apply_rotation(pose[rig["head"]], x=collapse * 0.28)
        scale_body(
            pose, rig, values.get("squash", 0.0) * style["squash"], -collapse * 0.03
        )
        secondary_motion(pose, rig, clip, t, max(0.35, 1.0 - collapse))
        return
    if clip == "spawn":
        rise = values.get("rise", 0.0)
        settle = values.get("settle", 0.0)
        for name in rig["body"]:
            apply_rotation(pose[name], x=(1.0 - rise) * 0.24 - settle * 0.10)
        rotate_side(pose, left, x=(1.0 - rise) * 0.55, z=-(1.0 - rise) * 0.25)
        rotate_side(pose, right, x=(1.0 - rise) * 0.55, z=(1.0 - rise) * 0.25)
        scale_body(pose, rig, values.get("squash", 0.0) * style["squash"], rise * 0.03)
        secondary_motion(pose, rig, clip, t, rise)
        return
    if clip == "victory":
        bounce = values.get("bounce", 0.0)
        bow = values.get("bow", 0.0)
        rotate_side(pose, left, x=-0.65 * (1.0 - bow), z=-0.42 * (1.0 - bow))
        rotate_side(pose, right, x=-0.65 * (1.0 - bow), z=0.42 * (1.0 - bow))
        for name in rig["body"]:
            apply_rotation(pose[name], x=bow * 0.35, z=bounce * 0.06)
        if rig["head"]:
            apply_rotation(pose[rig["head"]], x=bow * 0.22)
        scale_body(
            pose,
            rig,
            max(0.0, -bounce) * style["squash"],
            max(0.0, bounce) * style["squash"],
        )
        secondary_motion(pose, rig, clip, t, 1.0)


def key_pose(armature, pose, frame):
    for name, data in pose.items():
        bone = armature.pose.bones[name]
        bone.location = data["location"]
        bone.scale = data["scale"]
        if data["mode"] == "QUATERNION":
            bone.rotation_quaternion = data["rotation_quaternion"]
            bone.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=name
            )
        else:
            bone.rotation_euler = data["rotation_euler"]
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="location", frame=frame, group=name)
        bone.keyframe_insert(data_path="scale", frame=frame, group=name)


def smooth_action(action):
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"


def copy_properties(source, target):
    for key, value in source:
        # Blender 5.2 can crash when a nested ID-property dictionary from a
        # previous pass is assigned back while its owning Action is replaced.
        # Keep scalar semantic metadata; the new style metadata is written
        # below, and structured marker data is regenerated there.
        if not isinstance(value, (bool, int, float, str)):
            continue
        try:
            target[key] = value
        except (TypeError, ValueError):
            pass


def set_metadata(action, hero, clip, start, end, source):
    copy_properties(source, action)
    action["hero_slug"] = hero
    action["clip_name"] = clip
    action["clip_kind"] = "event"
    action["frame_start"] = start
    action["frame_end"] = end
    action["source_layout"] = "master-actions"
    action["fps"] = FPS
    action["loop"] = clip in {"idle", "run"}
    action["cyclic"] = clip in {"idle", "run"}
    action["brawl_style_revision"] = STYLE_REVISION
    action["brawl_pose_markers"] = {
        "anticipation": int(
            round(
                start
                + (end - start) * (0.20 if clip not in {"aim", "aim-super"} else 0.25)
            )
        ),
        "release": int(
            round(
                start
                + (end - start)
                * (0.45 if clip in {"attack", "super", "gadget"} else 0.55)
            )
        ),
        "hold": int(
            round(
                start
                + (end - start)
                * (0.52 if clip in {"attack", "super", "gadget"} else 0.65)
            )
        ),
        "follow_through": int(round(start + (end - start) * 0.75)),
    }
    action["authoring_action_name"] = (
        f"action_{hero.replace('-', '_')}_{clip.replace('-', '_')}"
    )


def ensure_nla_inventory(armature, hero):
    armature.animation_data_create()
    mapping = actions_for(hero)
    order = ["spawn", "idle"] + [
        clip for clip in mapping if clip not in {"spawn", "idle"}
    ]
    for track in list(armature.animation_data.nla_tracks):
        if track.name in mapping:
            armature.animation_data.nla_tracks.remove(track)
    for clip in order:
        action = find_action(mapping[clip])
        if action is None:
            continue
        track = armature.animation_data.nla_tracks.new()
        track.name = clip
        track.mute = True
        strip = track.strips.new(clip, int(round(action.frame_range[0])), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]
        strip.frame_start = action.frame_range[0]
        strip.frame_end = action.frame_range[1]
        strip.mute = True


def author_clip(
    scene, armature, hero, clip, source_action, source_range, rig, neutral_pose
):
    start, end = RANGES[clip]
    keys = KEYS[clip]
    old_start, old_end = source_range
    source_span = max(1.0, old_end - old_start)
    samples = {}
    armature.animation_data.action = source_action
    for frame in keys:
        t = (frame - start) / max(1.0, end - start)
        source_frame = old_start + t * source_span
        scene.frame_set(int(round(source_frame)))
        bpy.context.view_layer.update()
        samples[frame] = capture_pose(armature)

    old_props = list(source_action.items())
    armature.animation_data.action = None
    bpy.data.actions.remove(source_action)
    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    set_metadata(action, hero, clip, start, end, old_props)
    armature.animation_data.action = action
    processed = {}
    for frame in keys:
        pose = clone_pose(samples[frame])
        t = (frame - start) / max(1.0, end - start)
        values = profile(clip, t)
        values["_t"] = t
        special_pose(pose, rig, hero, clip, values)
        # Skill overlays should enter from a stable idle pose and visibly
        # recover to it instead of inheriting an arbitrary source-action end.
        if clip in {"attack", "super", "gadget", "hit"}:
            if frame == start:
                blend_pose_towards(pose, neutral_pose, 1.0)
            elif t > 0.58:
                blend_pose_towards(pose, neutral_pose, smooth((t - 0.58) / 0.42))
        elif clip in {"aim", "aim-super"} and frame == start:
            blend_pose_towards(pose, neutral_pose, 1.0)
        processed[frame] = pose

    # Looping locomotion must not snap at the seam.  Keep root motion intact
    # for run, but make every articulated bone arrive at the same pose.
    if clip in {"idle", "run"} and keys:
        first = processed[keys[0]]
        last = processed[keys[-1]]
        skip = () if clip == "idle" else ((rig.get("root"),) if rig.get("root") else ())
        blend_pose_towards(last, first, 1.0, skip_names=skip)

    for frame in keys:
        key_pose(armature, processed[frame], frame)
    smooth_action(action)
    scene.frame_start = start
    scene.frame_end = end
    scene.render.fps = FPS
    return action


def author_hero(hero):
    path = master_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = find_armature()
    if armature is None:
        raise RuntimeError(f"{hero}: master has no armature")
    armature.animation_data_create()
    rig = resolve_rig(armature)
    originals = {}
    for clip in RANGES:
        if clip == "stunned":
            continue
        action = find_action(ACTION_NAMES[clip])
        if action is None:
            raise RuntimeError(f"{hero}/{clip}: missing Action {ACTION_NAMES[clip]!r}")
        originals[clip] = (action, tuple(action.frame_range))
    idle_action, idle_range = originals["idle"]
    armature.animation_data.action = idle_action
    scene.frame_set(int(round(idle_range[0])))
    bpy.context.view_layer.update()
    neutral_pose = capture_pose(armature)
    for clip, (action, source_range) in originals.items():
        author_clip(
            scene, armature, hero, clip, action, source_range, rig, neutral_pose
        )
        print(f"AUTHORED {hero}/{clip} range={RANGES[clip]}")
    ensure_nla_inventory(armature, hero)
    armature.animation_data.action = find_action("idle")
    scene["brawl_style_revision"] = STYLE_REVISION
    scene["brawl_clip_ranges"] = {clip: list(value) for clip, value in RANGES.items()}
    scene["nla_inventory_policy"] = (
        "muted master clip tracks; ACTIONS export remains canonical"
    )
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)


def main():
    requested = os.environ.get("HERO_FILTER")
    heroes = (requested,) if requested else ALL_HEROES
    if requested and requested not in ALL_HEROES:
        raise RuntimeError(f"HERO_FILTER={requested!r} is not a canonical hero")
    for hero in heroes:
        author_hero(hero)


if __name__ == "__main__":
    main()
