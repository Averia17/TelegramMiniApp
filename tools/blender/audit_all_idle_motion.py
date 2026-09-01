"""Audit every hero idle action for loop seams and extreme local motion."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(
    os.environ.get("AUDIT_ROOT", os.fspath(Path(__file__).resolve().parents[2]))
)
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
HEROES = (
    "brock-zeus",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
    "katty",
)


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def scene_path(hero: str) -> Path:
    return SOURCE / hero / f"{hero}.blend"


def distance(a, b) -> float:
    return math.sqrt(
        sum((float(a[index]) - float(b[index])) ** 2 for index in range(3))
    )


def audit(hero: str) -> dict:
    path = scene_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = (
        armature.animation_data.action if armature and armature.animation_data else None
    )
    if action is None:
        action = next(
            (
                item
                for item in bpy.data.actions
                if item.name.casefold().split(".")[0] == "idle"
            ),
            None,
        )
    if armature is None or action is None:
        return {
            "hero": hero,
            "path": path.relative_to(ROOT).as_posix(),
            "error": "missing armature/action",
        }

    start, end = (int(value) for value in action.frame_range)
    names = [bone.name for bone in armature.pose.bones]
    initial = {}
    max_rotation = {name: 0.0 for name in names}
    max_translation = {name: 0.0 for name in names}
    endpoint_rotation = {name: 0.0 for name in names}
    endpoint_translation = {name: 0.0 for name in names}
    previous = {}
    max_step = {name: 0.0 for name in names}
    max_step_frame = {name: start for name in names}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in names:
            bone = armature.pose.bones[name]
            rotation = bone.rotation_euler.to_quaternion()
            translation = bone.location.copy()
            if name not in initial:
                initial[name] = (rotation.copy(), translation.copy())
            base_rotation, base_translation = initial[name]
            rotation_delta = base_rotation.rotation_difference(rotation).angle
            translation_delta = (translation - base_translation).length
            if name in previous:
                step = previous[name].rotation_difference(rotation).angle
                if step > max_step[name]:
                    max_step[name] = step
                    max_step_frame[name] = frame
            previous[name] = rotation.copy()
            max_rotation[name] = max(max_rotation[name], rotation_delta)
            max_translation[name] = max(max_translation[name], translation_delta)
            if frame == end:
                endpoint_rotation[name] = rotation_delta
                endpoint_translation[name] = translation_delta

    curves = action_curves(action)
    non_bone_tracks = sorted(
        {
            curve.data_path
            for curve in curves
            if not curve.data_path.startswith("pose.bones[")
        }
    )
    top_rotation = sorted(max_rotation.items(), key=lambda item: item[1], reverse=True)[
        :12
    ]
    top_translation = sorted(
        max_translation.items(), key=lambda item: item[1], reverse=True
    )[:8]
    top_steps = sorted(max_step.items(), key=lambda item: item[1], reverse=True)[:12]
    seams = sorted(
        ((name, endpoint_rotation[name], endpoint_translation[name]) for name in names),
        key=lambda item: max(item[1], item[2]),
        reverse=True,
    )[:8]
    return {
        "hero": hero,
        "path": path.relative_to(ROOT).as_posix(),
        "action": action.name,
        "range": [start, end],
        "top_rotation_degrees": [
            [name, round(math.degrees(value), 3)] for name, value in top_rotation
        ],
        "top_translation": [[name, round(value, 5)] for name, value in top_translation],
        "top_frame_steps_degrees": [
            [name, round(math.degrees(value), 3), max_step_frame[name]]
            for name, value in top_steps
        ],
        "loop_seam": [
            [name, round(math.degrees(rotation), 5), round(translation, 5)]
            for name, rotation, translation in seams
        ],
        "non_bone_tracks": non_bone_tracks,
        "metadata": {
            key: scene.get(key)
            for key in (
                "hero_slug",
                "clip_name",
                "natural_locomotion_revision",
                "natural_locomotion_pass",
            )
        },
    }


def main() -> None:
    requested = os.environ.get("HERO_FILTER")
    if requested and requested not in HEROES:
        raise ValueError(f"HERO_FILTER={requested!r} is not a canonical hero")
    heroes = (requested,) if requested else HEROES
    reports = [audit(hero) for hero in heroes]
    output = ROOT / "output" / "blender" / "all-hero-idle-motion-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {"heroes": len(reports), "output": os.fspath(output)}, ensure_ascii=False
        )
    )
    for report in reports:
        print(
            f"\nIDLE {report['hero']} range={report.get('range')} action={report.get('action')}"
        )
        print("  rotation:", report.get("top_rotation_degrees"))
        print("  translation:", report.get("top_translation"))
        print("  frame steps:", report.get("top_frame_steps_degrees"))
        print("  seam:", report.get("loop_seam"))
        print("  non-bone:", report.get("non_bone_tracks"))


if __name__ == "__main__":
    main()
