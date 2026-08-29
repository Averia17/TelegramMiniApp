"""Validate Fairy Mina's down-arm idle base and rebased Action metadata."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REVISION = "fairy-mina-all-actions-arms-rebased-v1"
ARM_BONES = (
    "R_shoulder_s",
    "R_elbow_s",
    "R_wrist_s",
    "L_shoulder_s",
    "L_elbow_s",
    "L_wrist_s",
)
EXPECTED_ACTIONS = (
    "Aim",
    "AimGadget",
    "AimSuper",
    "Attack",
    "Gadget",
    "Spawn",
    "Victory",
    "death",
    "hit",
    "idle",
    "run",
    "super",
)


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    failures = []
    if scene.get("all_actions_arm_rebase_revision") != REVISION:
        failures.append("scene rebase metadata is missing")

    idle = bpy.data.actions.get("idle")
    if idle is None:
        failures.append("missing idle Action")
    else:
        armature.animation_data_create()
        armature.animation_data.action = idle
        scene.frame_set(int(round(idle.frame_range[0])))
        idle_rotations = {
            name: [
                round(float(value), 6)
                for value in armature.pose.bones[name].rotation_euler
            ]
            for name in ARM_BONES
        }
        if any(
            abs(value) > 1e-5 for values in idle_rotations.values() for value in values
        ):
            failures.append(f"idle arm rotations are not zero: {idle_rotations}")

    action_report = {}
    for action_name in EXPECTED_ACTIONS:
        action = bpy.data.actions.get(action_name)
        if action is None:
            failures.append(f"missing Action {action_name}")
            continue
        if action_name != "idle" and action.get("arm_rebase_revision") != REVISION:
            failures.append(f"Action {action_name} is missing rebase metadata")
        armature.animation_data.action = action
        frames = sorted(
            {
                int(round(action.frame_range[0])),
                int(round((action.frame_range[0] + action.frame_range[1]) / 2)),
                int(round(action.frame_range[1])),
            }
        )
        samples = {}
        for frame in frames:
            scene.frame_set(frame)
            samples[str(frame)] = {
                name: [
                    round(float(value), 3)
                    for value in armature.pose.bones[name].rotation_euler
                ]
                for name in ARM_BONES
            }
        action_report[action_name] = {
            "range": list(action.frame_range),
            "samples": samples,
        }

    output = ROOT / "output" / "blender" / "fairy-mina-arm-rebase-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(action_report, indent=2), encoding="utf-8")
    print(json.dumps({"failures": failures, "output": os.fspath(output)}))
    if failures:
        raise RuntimeError("; ".join(failures))


if __name__ == "__main__":
    main()
