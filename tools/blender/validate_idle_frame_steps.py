"""Regression guard for single-frame jumps in every hero idle loop."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
TARGETS = {
    "brock-zeus": {
        "Head": 2.0,
        "L_Elbow": 2.0,
        "R_Elbow": 2.0,
        "L_Wrist": 2.0,
        "R_Wrist": 2.0,
    },
    "fairy-mina": {"head_s": 1.5, "L_hair_side_3_s": 3.5, "L_wing_up_s": 2.5},
    "kaze": {"head_s": 2.0, "L_wrist_s": 2.0, "R_wrist_s": 2.0, "L_front_hair_s": 3.5},
    "mandy": {
        "head_s_035": 2.0,
        "L_wrist_s_047": 2.0,
        "R_wrist_s_064": 2.0,
        "hat_01_s_036": 3.5,
    },
    "needle": {"Head": 2.0, "Flower": 3.5, "LeftFoot": 2.0, "RightFoot": 2.0},
    "persephone-lumi": {"head_s": 1.0, "cape_1_s": 1.0, "R_front_hair_s": 1.0},
    "wukong-mico": {"head_s": 1.0, "Tail_03_s": 1.0},
    "katty": {
        "head_s": 2.0,
        "L_wrist_s": 2.0,
        "R_wrist_s": 2.0,
        "L_elbow_s": 2.0,
        "R_elbow_s": 2.0,
    },
}


def path_for(hero: str) -> Path:
    return SOURCE / hero / f"{hero}.blend"


def inspect(hero: str, limits: dict[str, float]) -> list[str]:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path_for(hero)))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    action = armature.animation_data.action
    start, end = (int(value) for value in action.frame_range)
    previous = {}
    maxima = {name: 0.0 for name in limits}
    frames = {name: start for name in limits}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in limits:
            bone = armature.pose.bones[name]
            rotation = bone.matrix_basis.to_quaternion()
            if name in previous:
                step = math.degrees(previous[name].rotation_difference(rotation).angle)
                if step > maxima[name]:
                    maxima[name] = step
                    frames[name] = frame
            previous[name] = rotation.copy()
    failures = []
    for name, limit in limits.items():
        print(
            f"IDLE {hero}/{name}: max_frame_step={maxima[name]:.3f}° at frame {frames[name]} limit={limit:.3f}°"
        )
        if maxima[name] > limit:
            failures.append(
                f"{hero}/{name}: {maxima[name]:.3f}° > {limit:.3f}° at frame {frames[name]}"
            )
    return failures


def main() -> None:
    failures = [
        failure for hero, limits in TARGETS.items() for failure in inspect(hero, limits)
    ]
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all canonical hero idle frame steps stay within smoothness limits")


if __name__ == "__main__":
    main()
