"""Regression guard for authored idle pose amplitude on the canonical heroes."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from hero_animation_contract import master_path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"

# These are local Euler-angle excursion limits, measured from the first idle
# pose. They are intentionally conservative for the silhouette-critical parts
# that were reported as snapping or separating on the lobby screen.
LIMITS = {
    "mandy": {"head_s_035": 0.42, "L_wrist_s_047": 0.30, "R_wrist_s_064": 0.30},
    "needle": {"Head": 0.25, "LeftHand": 0.30, "RightHand": 0.30, "Flower": 0.55},
    "brock-zeus": {"Head": 0.22, "R_Wrist": 0.24, "L_Wrist": 0.24},
    "kaze": {"head_s": 0.26, "L_wrist_s": 0.24, "R_wrist_s": 0.24},
}


def inspect(hero: str, targets: dict[str, float]) -> list[str]:
    path = master_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    start, end = (int(value) for value in armature.animation_data.action.frame_range)
    initial: dict[str, tuple[float, float, float]] = {}
    maxima = {name: 0.0 for name in targets}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in targets:
            bone = armature.pose.bones[name]
            current = tuple(float(value) for value in bone.rotation_euler)
            if name not in initial:
                initial[name] = current
            delta = math.sqrt(
                sum((current[index] - initial[name][index]) ** 2 for index in range(3))
            )
            maxima[name] = max(maxima[name], delta)
    failures = []
    for name, limit in targets.items():
        measured = maxima[name]
        print(f"IDLE {hero}/{name}: excursion={measured:.5f} limit={limit:.5f}")
        if measured > limit:
            failures.append(f"{hero}/{name}: excursion {measured:.5f} > {limit:.5f}")
    return failures


def main() -> None:
    failures = [
        failure
        for hero, targets in LIMITS.items()
        for failure in inspect(hero, targets)
    ]
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: idle silhouette motion stays within the lobby smoothness limits")


if __name__ == "__main__":
    main()
