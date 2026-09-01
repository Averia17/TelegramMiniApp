"""Measure continuity risks in the canonical hero Actions.

This is a diagnostic companion to the authoring script.  It does not modify
Blender files: it reports loop seam distance, event recovery distance, and the
largest sampled pose delta so refinement can be driven by evidence.
"""

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

from hero_animation_contract import ALL_HEROES, actions_for, master_path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "blender" / "brawl-animation-quality-baseline.json"

# These are continuity gates, not artistic amplitude limits.  The latter must
# stay character-specific: a stylized super may be much larger than an idle.
SEAM_TOLERANCE = 1e-4
RECOVERY_TOLERANCE = 0.02


def find_armature():
    return next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )


def find_action(canonical):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == canonical.casefold()
        ),
        None,
    )


def pose_signature(armature):
    signature = {}
    for bone in armature.pose.bones:
        rotation = (
            tuple(round(value, 6) for value in bone.rotation_quaternion)
            if bone.rotation_mode == "QUATERNION"
            else tuple(round(value, 6) for value in bone.rotation_euler)
        )
        signature[bone.name] = (
            tuple(round(value, 6) for value in bone.location),
            rotation,
            tuple(round(value, 6) for value in bone.scale),
        )
    return signature


def pose_distance(left, right, include_root=False):
    total = 0.0
    count = 0
    for name, left_values in left.items():
        if not include_root and name.casefold() in {"root", "_rootjoint"}:
            continue
        right_values = right.get(name)
        if right_values is None:
            continue
        for left_channel, right_channel in zip(left_values, right_values):
            total += (
                sum((a - b) ** 2 for a, b in zip(left_channel, right_channel)) ** 0.5
            )
        count += 1
    return total / max(1, count)


def sample_action(scene, armature, action, frame):
    armature.animation_data_create()
    armature.animation_data.action = action
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    return pose_signature(armature)


def action_name(clip):
    return actions_for("needle").get(clip, clip)


def audit_hero(hero):
    path = master_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = find_armature()
    if armature is None:
        return {"hero": hero, "error": "missing armature"}

    actions = actions_for(hero)
    found = {}
    for clip, canonical in actions.items():
        action = find_action(canonical)
        if action is None:
            continue
        start, end = (int(round(value)) for value in action.frame_range)
        found[clip] = {
            "range": [start, end],
            "keyframes": (
                sum(len(curve.keyframe_points) for curve in action.fcurves)
                if hasattr(action, "fcurves")
                else None
            ),
        }

    idle = find_action(actions["idle"])
    idle_start = (
        sample_action(scene, armature, idle, int(round(idle.frame_range[0])))
        if idle
        else None
    )
    quality = {"hero": hero, "path": path.as_posix(), "clips": found}
    if idle:
        idle_end = sample_action(scene, armature, idle, int(round(idle.frame_range[1])))
        quality["idle_seam_distance"] = pose_distance(idle_start, idle_end)
        quality["idle_seam_distance_with_root"] = pose_distance(
            idle_start, idle_end, include_root=True
        )

    run = find_action(actions["run"])
    if run:
        run_start = sample_action(scene, armature, run, int(round(run.frame_range[0])))
        run_end = sample_action(scene, armature, run, int(round(run.frame_range[1])))
        quality["run_seam_distance"] = pose_distance(run_start, run_end)
        quality["run_seam_distance_with_root"] = pose_distance(
            run_start, run_end, include_root=True
        )

    for clip in ("attack", "super", "gadget", "aim", "aim-super"):
        action = find_action(actions.get(clip, ""))
        if not action or idle_start is None:
            continue
        start, end = (int(round(value)) for value in action.frame_range)
        first = sample_action(scene, armature, action, start)
        last = sample_action(scene, armature, action, end)
        quality[f"{clip}_start_distance"] = pose_distance(idle_start, first)
        quality[f"{clip}_end_distance"] = pose_distance(idle_start, last)
        sample_frames = [start + (end - start) * index / 8.0 for index in range(9)]
        previous = sample_action(scene, armature, action, round(sample_frames[0]))
        deltas = []
        for frame in sample_frames[1:]:
            current = sample_action(scene, armature, action, round(frame))
            deltas.append(pose_distance(previous, current))
            previous = current
        quality[f"{clip}_max_sample_delta"] = max(deltas, default=0.0)
    return quality


def quality_failures(report):
    failures = []
    for quality in report:
        hero = quality.get("hero", "unknown")
        if quality.get("error"):
            failures.append(f"{hero}: {quality['error']}")
            continue
        for clip in ("idle", "run"):
            value = quality.get(f"{clip}_seam_distance_with_root")
            if value is not None and value > SEAM_TOLERANCE:
                failures.append(f"{hero}: {clip} loop seam {value:.6f}")
        for clip in ("attack", "super", "gadget"):
            value = quality.get(f"{clip}_end_distance")
            if value is not None and value > RECOVERY_TOLERANCE:
                failures.append(f"{hero}: {clip} recovery {value:.6f}")
        value = quality.get("aim_start_distance")
        if value is not None and value > RECOVERY_TOLERANCE:
            failures.append(f"{hero}: aim start transition {value:.6f}")
    return failures


def main():
    requested = os.environ.get("HERO_FILTER")
    heroes = (requested,) if requested else ALL_HEROES
    report = [audit_hero(hero) for hero in heroes]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    failures = quality_failures(report)
    print(
        json.dumps(
            {
                "heroes": len(report),
                "output": OUTPUT.as_posix(),
                "failures": failures,
            },
            ensure_ascii=False,
        )
    )
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
