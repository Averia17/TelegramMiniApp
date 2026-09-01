"""Audit every canonical hero master and emit a machine-readable report."""

from __future__ import annotations

import json
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
MANIFEST = json.loads(
    (Path(__file__).with_name("hero_animation_scene_manifest.json")).read_text(
        encoding="utf-8"
    )
)
CLIP_ACTIONS = {
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
    "stunned": "Stunned",
}
HEROES = tuple(MANIFEST["heroes"])
if "katty" not in HEROES:
    HEROES = HEROES + ("katty",)
BASE_CLIPS = tuple(dict.fromkeys(MANIFEST["event_clips"] + MANIFEST["ability_clips"]))


def hero_clips(hero: str) -> tuple[str, ...]:
    if hero == "katty":
        return BASE_CLIPS
    return tuple(
        dict.fromkeys(
            BASE_CLIPS + tuple(MANIFEST["hero_animation_extras"].get(hero, []))
        )
    )


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def find_action(action_name: str):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == action_name.casefold()
        ),
        None,
    )


def audit_scene(hero: str, clip: str, path: Path, required_metadata: set[str]) -> dict:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(CLIP_ACTIONS[clip])
    failures = []
    if armature is None:
        failures.append("missing armature")
    if action is None:
        failures.append(f"missing action {CLIP_ACTIONS[clip]}")

    metadata = {
        key: (
            action.get(key)
            if key
            in {"hero_slug", "clip_name", "clip_kind", "frame_start", "frame_end"}
            else scene.get(key)
        )
        for key in required_metadata
    }
    for key in required_metadata:
        if metadata[key] is None:
            failures.append(f"missing scene metadata {key}")

    curves = action_fcurves(action) if action else []
    keyed_bones = sorted(
        {
            curve.data_path.split(chr(34))[1]
            for curve in curves
            if curve.data_path.startswith("pose.bones[")
        }
    )
    bone_names = {bone.name for bone in armature.pose.bones} if armature else set()
    missing_bones = sorted(set(keyed_bones) - bone_names)
    if missing_bones:
        failures.append(f"missing keyed bones: {', '.join(missing_bones[:8])}")

    max_position = 0.0
    max_root_position = 0.0
    root_position_paths = []
    for curve in curves:
        if not curve.data_path.endswith(".location"):
            continue
        max_curve = max(
            (abs(point.co[1]) for point in curve.keyframe_points), default=0.0
        )
        max_position = max(max_position, max_curve)
        if any(
            token in curve.data_path.casefold()
            for token in ('"root', '"hips', '"pelvis')
        ):
            max_root_position = max(max_root_position, max_curve)
            root_position_paths.append(curve.data_path)
    if max_position > 20.0:
        failures.append(f"position track exceeds 20 units ({max_position:.2f})")
    if max_root_position > 3.0:
        failures.append(
            f"root/hips translation exceeds 3 units ({max_root_position:.2f})"
        )

    return {
        "hero": hero,
        "clip": clip,
        "path": path.relative_to(ROOT).as_posix(),
        "action": action.name if action else None,
        "scene_range": [scene.frame_start, scene.frame_end],
        "action_range": (
            [round(value, 3) for value in action.frame_range] if action else None
        ),
        "fps": scene.render.fps,
        "curve_count": len(curves),
        "keyed_bone_count": len(keyed_bones),
        "keyed_bones": keyed_bones,
        "metadata": metadata,
        "max_position": round(max_position, 4),
        "max_root_position": round(max_root_position, 4),
        "root_position_paths": sorted(set(root_position_paths)),
        "failures": failures,
    }


def main() -> None:
    reports = []
    for hero in HEROES:
        hero_root = SOURCE / hero
        clips = hero_clips(hero)
        master = master_path(hero)
        paths = {clip: master for clip in clips}
        expected = set(clips)
        for clip in sorted(expected - set(paths)):
            reports.append(
                {
                    "hero": hero,
                    "clip": clip,
                    "path": None,
                    "failures": ["missing .blend scene"],
                }
            )
        for clip in sorted(expected & set(paths)):
            reports.append(audit_scene(hero, clip, paths[clip], set()))

    output = ROOT / "output" / "blender" / "all-hero-animation-scene-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    failures = [
        f"{item['hero']}/{item['clip']}: {failure}"
        for item in reports
        for failure in item.get("failures", [])
    ]
    print(
        json.dumps(
            {
                "scenes": len(reports),
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
