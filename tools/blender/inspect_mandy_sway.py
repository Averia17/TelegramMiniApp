"""Measure Mandy idle pose excursions and frame-to-frame sway."""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action

ROOT = Path(__file__).resolve().parents[2]


def main():
    _, scene, armature, action = activate_action("mandy", "idle")
    start, end = (int(value) for value in action.frame_range)
    initial = {}
    maxima = {}
    max_steps = {}
    max_step_frames = {}
    previous = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for bone in armature.pose.bones:
            rotation = bone.rotation_euler.to_quaternion()
            if bone.name not in initial:
                initial[bone.name] = rotation.copy()
            excursion = 2.0 * math.acos(min(1.0, abs(initial[bone.name].dot(rotation))))
            maxima[bone.name] = max(maxima.get(bone.name, 0.0), excursion)
            if bone.name in previous:
                step = 2.0 * math.acos(min(1.0, abs(previous[bone.name].dot(rotation))))
                if step > max_steps.get(bone.name, 0.0):
                    max_steps[bone.name] = step
                    max_step_frames[bone.name] = [frame - 1, frame]
            previous[bone.name] = rotation.copy()

    report = {
        "hero": "mandy",
        "clip": "idle",
        "frame_range": [start, end],
        "excursion_degrees": {
            name: round(math.degrees(value), 4)
            for name, value in sorted(
                maxima.items(), key=lambda item: item[1], reverse=True
            )
        },
        "max_step_degrees": {
            name: round(math.degrees(value), 4)
            for name, value in sorted(
                max_steps.items(), key=lambda item: item[1], reverse=True
            )
        },
        "max_step_frames": max_step_frames,
    }
    output = ROOT / "output" / "blender" / "mandy-sway-inspection.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "output": os.fspath(output),
                "top_excursion": list(report["excursion_degrees"].items())[:12],
            }
        )
    )


if __name__ == "__main__":
    main()
