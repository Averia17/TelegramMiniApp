"""Audit Blender source interpolation modes for the canonical animation clips."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
MANIFEST = json.loads(
    (Path(__file__).with_name("hero_animation_scene_manifest.json")).read_text(
        encoding="utf-8"
    )
)
ACTION_NAMES = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "gadget": "Gadget",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "aim-gadget": "AimGadget",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
}


def curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", ()):
                result.extend(bag.fcurves)
    return result


def action_for(name):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def scene_clips(hero):
    if hero == "katty":
        return tuple(dict.fromkeys(MANIFEST["event_clips"] + MANIFEST["ability_clips"]))
    return tuple(
        dict.fromkeys(
            MANIFEST["event_clips"]
            + MANIFEST["ability_clips"]
            + MANIFEST["hero_animation_extras"].get(hero, [])
        )
    )


def inspect(hero, clip):
    path = SOURCE / hero / f"{hero}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    action = action_for(ACTION_NAMES[clip])
    if action is None:
        return {"hero": hero, "clip": clip, "error": "missing action"}
    counts = {}
    bone_counts = {}
    for curve in curves(action):
        mode_counts = counts.setdefault(curve.data_path.split(".")[-1], {})
        for point in curve.keyframe_points:
            mode_counts[point.interpolation] = (
                mode_counts.get(point.interpolation, 0) + 1
            )
        if curve.data_path.startswith("pose.bones["):
            bone_mode_counts = bone_counts.setdefault(curve.data_path.split('"')[1], {})
            for point in curve.keyframe_points:
                bone_mode_counts[point.interpolation] = (
                    bone_mode_counts.get(point.interpolation, 0) + 1
                )
    return {
        "hero": hero,
        "clip": clip,
        "action": action.name,
        "curves": counts,
        "bones": bone_counts,
    }


def main():
    heroes = list(MANIFEST["heroes"])
    report = [inspect(hero, clip) for hero in heroes for clip in scene_clips(hero)]
    output = ROOT / "output" / "blender" / "keyframe-interpolation-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"scenes": len(report), "output": os.fspath(output)}))


if __name__ == "__main__":
    main()
