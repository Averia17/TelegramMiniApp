"""Add a readable, hero-specific accent pass to canonical death scenes.

The pass is additive: existing authored poses remain the source of truth.  It
adds a short anticipation/pop/follow-through arc, semantic timeline markers,
and metadata used by validation.  Re-running the script is idempotent.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
REVISION = 1

# Rotations are degrees in local bone space. Each profile deliberately accents
# a different part of the existing performance rather than replacing it.
PROFILES = {
    "brock-zeus": {
        "style": "lightning-overload",
        "bones": {
            "Hips": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.12, (0, 0, -0.08), (-6, 0, 0)),
                (0.27, (0, 0, 0.34), (10, -10, 16)),
                (0.48, (0, 0, 0.08), (4, 8, -10)),
                (0.68, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "Chest": [
                (0, None, (0, 0, 0)),
                (0.18, None, (-12, 0, -10)),
                (0.32, None, (20, 0, 18)),
                (0.62, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "L_Shoulder": [
                (0, None, (0, 0, 0)),
                (0.28, None, (-22, 0, -38)),
                (0.62, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "R_Shoulder": [
                (0, None, (0, 0, 0)),
                (0.28, None, (22, 0, 38)),
                (0.62, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
    "fairy-mina": {
        "style": "broken-fairy-spiral",
        "bones": {
            "hips_s": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.16, (0, 0, -0.05), (-5, 0, -8)),
                (0.34, (0, 0, 0.30), (4, 18, 32)),
                (0.58, (0, 0, 0.06), (0, -10, -14)),
                (0.74, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "L_wing_up_s": [
                (0, None, (0, 0, 0)),
                (0.30, None, (-32, 6, -24)),
                (0.58, None, (12, 0, 8)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "R_wing_up_s": [
                (0, None, (0, 0, 0)),
                (0.30, None, (32, -6, 24)),
                (0.58, None, (-12, 0, -8)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "head_s": [
                (0, None, (0, 0, 0)),
                (0.34, None, (-14, 0, -18)),
                (0.62, None, (10, 0, 8)),
                (0.78, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
    "kaze": {
        "style": "fan-spiral-collapse",
        "bones": {
            "hips_s": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.12, (0, 0, -0.06), (-8, 0, 0)),
                (0.30, (0, 0, 0.24), (3, 24, -34)),
                (0.52, (0, 0, 0.04), (8, -16, 16)),
                (0.70, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "L_weapon_s": [
                (0, None, (0, 0, 0)),
                (0.28, None, (-18, 34, -42)),
                (0.58, None, (8, -12, 16)),
                (0.74, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "R_Right_s": [
                (0, None, (0, 0, 0)),
                (0.28, None, (18, -34, 42)),
                (0.58, None, (-8, 12, -16)),
                (0.74, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "back_hair_s": [
                (0, None, (0, 0, 0)),
                (0.38, None, (-20, 0, 18)),
                (0.70, None, (5, 0, -5)),
                (0.82, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
    "mandy": {
        "style": "royal-recoil",
        "bones": {
            "hips_s_02": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.14, (0, 0, -0.05), (-8, 0, 0)),
                (0.31, (0, 0, 0.28), (-18, 8, 16)),
                (0.52, (0, 0, 0.04), (14, -5, -8)),
                (0.72, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "R_gunbone_01_s_075": [
                (0, None, (0, 0, 0)),
                (0.30, None, (-30, 18, 28)),
                (0.60, None, (10, -6, -8)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "hat_01_s_036": [
                (0, None, (0, 0, 0)),
                (0.34, None, (18, 0, -16)),
                (0.62, None, (-8, 0, 6)),
                (0.80, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "head_s_035": [
                (0, None, (0, 0, 0)),
                (0.30, None, (-16, 0, 10)),
                (0.58, None, (12, 0, -8)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
    "needle": {
        "style": "spore-pop",
        "bones": {
            "Hips": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.12, (0, 0, -0.10), (-10, 0, 0)),
                (0.27, (0, 0, 0.42), (8, -12, 20)),
                (0.46, (0, 0, 0.08), (10, 10, -14)),
                (0.66, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "Spine": [
                (0, None, (0, 0, 0)),
                (0.24, None, (-18, 0, -14)),
                (0.46, None, (24, 0, 16)),
                (0.68, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "Flower": [
                (0, None, (0, 0, 0)),
                (0.30, None, (28, -20, 34)),
                (0.58, None, (-18, 10, -16)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "Head": [
                (0, None, (0, 0, 0)),
                (0.27, None, (-20, 0, 12)),
                (0.50, None, (14, 0, -10)),
                (0.70, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
    "persephone-lumi": {
        "style": "underworld-release",
        "bones": {
            "hips_s": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.14, (0, 0, -0.06), (-7, 0, 0)),
                (0.32, (0, 0, 0.26), (-2, -15, 20)),
                (0.55, (0, 0, 0.04), (10, 9, -10)),
                (0.73, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "hades_arm_s": [
                (0, None, (0, 0, 0)),
                (0.30, None, (-38, 20, -30)),
                (0.58, None, (14, -8, 12)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "L_weapon_s": [
                (0, None, (0, 0, 0)),
                (0.32, None, (18, -24, 28)),
                (0.60, None, (-8, 10, -10)),
                (0.78, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "cape_0_s": [
                (0, None, (0, 0, 0)),
                (0.40, None, (-24, 0, 14)),
                (0.68, None, (8, 0, -5)),
                (0.84, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
    "wukong-mico": {
        "style": "cloud-pop-tail-whip",
        "bones": {
            "hips_s": [
                (0, (0, 0, 0), (0, 0, 0)),
                (0.10, (0, 0, -0.08), (-10, 0, 0)),
                (0.26, (0, 0, 0.38), (4, 20, -24)),
                (0.48, (0, 0, 0.08), (12, -12, 16)),
                (0.68, (0, 0, 0), (0, 0, 0)),
                (1, (0, 0, 0), (0, 0, 0)),
            ],
            "Tail_01_s": [
                (0, None, (0, 0, 0)),
                (0.28, None, (32, -24, 38)),
                (0.52, None, (-20, 16, -24)),
                (0.74, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "MIC_Handel_s": [
                (0, None, (0, 0, 0)),
                (0.30, None, (-28, 30, -38)),
                (0.58, None, (14, -12, 16)),
                (0.76, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
            "head_s": [
                (0, None, (0, 0, 0)),
                (0.27, None, (-18, 0, -14)),
                (0.52, None, (12, 0, 8)),
                (0.72, None, (0, 0, 0)),
                (1, None, (0, 0, 0)),
            ],
        },
    },
}


def lerp(a, b, amount):
    return a + (b - a) * amount


def sample_profile(keys, phase):
    for index in range(len(keys) - 1):
        start, end = keys[index], keys[index + 1]
        if phase <= end[0]:
            span = max(1e-6, end[0] - start[0])
            amount = (phase - start[0]) / span
            amount = amount * amount * (3 - 2 * amount)
            start_loc = Vector(start[1] or (0, 0, 0))
            end_loc = Vector(end[1] or (0, 0, 0))
            location = start_loc.lerp(end_loc, amount)
            rotation = tuple(
                math.radians(lerp(a, b, amount)) for a, b in zip(start[2], end[2])
            )
            return location, rotation
    return Vector((0, 0, 0)), (0, 0, 0)


def key_transform(bone, frame):
    bone.keyframe_insert("location", frame=frame, group=bone.name)
    if bone.rotation_mode == "QUATERNION":
        bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
    elif bone.rotation_mode == "AXIS_ANGLE":
        bone.keyframe_insert("rotation_axis_angle", frame=frame, group=bone.name)
    else:
        bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)


def polish(hero, profile):
    path = SOURCE / hero / "scenes" / "death.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    action = armature.animation_data.action
    if action.get("death_polish_revision") == REVISION:
        print(f"SKIP {hero}: already polished")
        return
    start, end = (int(round(value)) for value in action.frame_range)
    original = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        original[frame] = {
            name: armature.pose.bones[name].matrix_basis.copy()
            for name in profile["bones"]
            if name in armature.pose.bones
        }
    missing = sorted(set(profile["bones"]) - set(original[start]))
    if missing:
        raise RuntimeError(f"{hero}: missing accent bones {missing}")
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        phase = (frame - start) / max(1, end - start)
        for name, keys in profile["bones"].items():
            bone = armature.pose.bones[name]
            location, rotation = sample_profile(keys, phase)
            delta = Matrix.Translation(location)
            delta @= Matrix.Rotation(rotation[2], 4, "Z")
            delta @= Matrix.Rotation(rotation[1], 4, "Y")
            delta @= Matrix.Rotation(rotation[0], 4, "X")
            bone.matrix_basis = original[frame][name] @ delta
            key_transform(bone, frame)
    for marker in list(scene.timeline_markers):
        if marker.name.startswith("death_"):
            scene.timeline_markers.remove(marker)
    scene.timeline_markers.new(
        "death_anticipation", frame=start + round((end - start) * 0.12)
    )
    scene.timeline_markers.new("death_pop", frame=start + round((end - start) * 0.30))
    scene.timeline_markers.new(
        "death_follow_through", frame=start + round((end - start) * 0.68)
    )
    action["death_polish_revision"] = REVISION
    action["death_style"] = profile["style"]
    scene["death_polish_revision"] = REVISION
    scene["death_style"] = profile["style"]
    scene.frame_start = start
    scene.frame_end = end
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"POLISHED {hero}: {profile['style']} ({start}-{end})")


def main():
    requested = os.environ.get("HERO_FILTER")
    profiles = {requested: PROFILES[requested]} if requested else PROFILES
    for hero, profile in profiles.items():
        polish(hero, profile)


if __name__ == "__main__":
    main()
