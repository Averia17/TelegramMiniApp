"""Print a compact JSON audit of authored hero skill animation scenes.

Run with Blender so the report reflects the binary .blend sources rather than
the exported GLB files::

    blender --background --python tools/blender/inspect_skill_animation_scenes.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
HEROES = (
    "brock-zeus",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
)
CLIPS = {"attack": "Attack", "super": "super", "gadget": "Gadget"}


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def inspect_scene(hero: str, clip: str, action_name: str) -> dict:
    path, scene, armature, action = activate_action(hero, clip)
    if armature is None or action is None:
        return {"hero": hero, "clip": clip, "error": "missing armature or action"}

    keyed_bones = set()
    key_frames = set()
    curve_count = 0
    for curve in action_fcurves(action):
        curve_count += 1
        if curve.data_path.startswith('pose.bones["'):
            keyed_bones.add(curve.data_path.split('"')[1])
        key_frames.update(round(point.co[0], 3) for point in curve.keyframe_points)

    return {
        "hero": hero,
        "clip": clip,
        "path": path.relative_to(ROOT).as_posix(),
        "action": action.name,
        "scene_range": [scene.frame_start, scene.frame_end],
        "action_range": [round(value, 3) for value in action.frame_range],
        "fps": scene.render.fps,
        "curve_count": curve_count,
        "key_frames": sorted(key_frames),
        "keyed_bones": sorted(keyed_bones),
        "all_bones": sorted(bone.name for bone in armature.data.bones),
        "markers": {marker.name: marker.frame for marker in scene.timeline_markers},
        "semantic": scene.get("skill_semantic", ""),
    }


def main() -> None:
    report = [
        inspect_scene(hero, clip, action_name)
        for hero in HEROES
        for clip, action_name in CLIPS.items()
    ]
    output = ROOT / "output" / "blender" / "skill-animation-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"WROTE {output}")


if __name__ == "__main__":
    main()
