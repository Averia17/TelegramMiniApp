"""Audit local pose continuity for all canonical hero source scenes."""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action

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
FOCUS_TOKENS = (
    "arm",
    "hand",
    "elbow",
    "wrist",
    "shoulder",
    "leg",
    "foot",
    "ankle",
    "knee",
)


def clips_for(hero: str) -> tuple[str, ...]:
    clips = tuple(dict.fromkeys(MANIFEST["event_clips"] + MANIFEST["ability_clips"]))
    if hero != "katty":
        clips += tuple(MANIFEST["hero_animation_extras"].get(hero, []))
    return tuple(dict.fromkeys(clips))


def inspect(hero: str, clip: str) -> dict:
    path, scene, armature, action = activate_action(hero, clip)
    if armature is None or action is None:
        return {"hero": hero, "clip": clip, "failures": ["missing armature/action"]}
    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = (int(value) for value in action.frame_range)
    bones = [
        bone
        for bone in armature.pose.bones
        if any(token in bone.name.casefold() for token in FOCUS_TOKENS)
    ]
    maxima = {bone.name: 0.0 for bone in bones}
    jumps = {bone.name: 0.0 for bone in bones}
    jump_frames = {bone.name: None for bone in bones}
    previous = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for bone in bones:
            rotation = tuple(float(value) for value in bone.rotation_euler)
            quaternion = bone.rotation_euler.to_quaternion()
            if not all(math.isfinite(value) for value in rotation):
                maxima[bone.name] = float("inf")
                continue
            maxima[bone.name] = max(
                maxima[bone.name], math.sqrt(sum(value * value for value in rotation))
            )
            if bone.name in previous:
                jump = 2.0 * math.acos(
                    min(1.0, abs(previous[bone.name].dot(quaternion)))
                )
                if jump > jumps[bone.name]:
                    jumps[bone.name] = jump
                    jump_frames[bone.name] = [frame - 1, frame]
            previous[bone.name] = quaternion
    failures = [
        f"{bone}: frame jump {jumps[bone]:.3f}rad"
        for bone in jumps
        if jumps[bone] > 1.0
    ]
    return {
        "hero": hero,
        "clip": clip,
        "action": action.name,
        "frame_range": [start, end],
        "max_rotation_rad": {name: round(value, 5) for name, value in maxima.items()},
        "max_frame_jump_rad": {name: round(value, 5) for name, value in jumps.items()},
        "max_frame_jump_frames": jump_frames,
        "failures": failures,
    }


def main() -> None:
    heroes = tuple(MANIFEST["heroes"]) + (
        ("katty",) if "katty" not in MANIFEST["heroes"] else ()
    )
    report = [inspect(hero, clip) for hero in heroes for clip in clips_for(hero)]
    output = ROOT / "output" / "blender" / "pose-extremes-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    failures = [
        f"{item['hero']}/{item['clip']}: {failure}"
        for item in report
        for failure in item["failures"]
    ]
    print(
        json.dumps(
            {
                "scenes": len(report),
                "failures": len(failures),
                "output": os.fspath(output),
            },
            ensure_ascii=False,
        )
    )
    if failures:
        raise RuntimeError("\n".join(failures))


if __name__ == "__main__":
    main()
