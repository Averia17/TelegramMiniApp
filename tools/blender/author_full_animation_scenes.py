"""Materialize the ten authored runtime event scenes for every hero.

This is an authoring/packaging step, not a choreography generator. It copies
the real Actions already authored in each hero master into a focused Blender
scene, normalizes the scene metadata and preserves the existing keyframes.
The resulting scenes are the reviewable source for the runtime event pack.

Run with Blender:
  blender --background --python tools/blender/author_full_animation_scenes.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
MANIFEST = Path(__file__).with_name("hero_animation_scene_manifest.json")

ACTION_NAMES = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
}


def fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def action_by_canonical_name(name: str):
    matches = [
        action
        for action in bpy.data.actions
        if action.name.casefold().split(".")[0] == name.casefold()
    ]
    if not matches:
        raise RuntimeError(f"missing authored Action {name!r}")
    # Prefer an exact canonical name when the master contains duplicate imports.
    return next(
        (action for action in matches if action.name.casefold() == name.casefold()),
        matches[0],
    )


def remove_other_actions(keep) -> None:
    for action in list(bpy.data.actions):
        if action != keep and action.users == 0:
            bpy.data.actions.remove(action)


def canonicalize_scene(hero: str, clip: str, master: Path, target: Path) -> dict:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError(f"{hero}: master has no armature")

    action_name = ACTION_NAMES[clip]
    action = action_by_canonical_name(action_name)
    action.name = action_name
    armature.animation_data_create()
    armature.animation_data.action = action
    remove_other_actions(action)

    curves = fcurves(action)
    frames = [point.co[0] for curve in curves for point in curve.keyframe_points]
    if not frames:
        raise RuntimeError(f"{hero}/{clip}: authored Action has no keyframes")
    frame_start = int(min(frames))
    frame_end = int(max(frames))
    if frame_start < 1:
        # Needle's legacy source rig uses frame 0 as its bind-pose key. Keep
        # the authored spacing and move the complete Action onto the shared
        # frame-1 contract; no keys or poses are synthesized.
        offset = 1 - frame_start
        for curve in curves:
            for point in curve.keyframe_points:
                point.co[0] += offset
            curve.update()
        frame_start += offset
        frame_end += offset

    scene.name = f"{hero}_{clip}"
    scene.render.fps = int(manifest["fps"])
    scene.frame_start = frame_start
    scene.frame_end = frame_end
    scene.frame_set(frame_start)
    scene["hero_slug"] = hero
    scene["clip_name"] = action_name
    scene["clip_kind"] = "event"
    scene["frame_start"] = frame_start
    scene["frame_end"] = frame_end
    scene["authoring_status"] = "READY_FOR_REVIEW"
    scene["source_of_truth"] = f"{master.relative_to(ROOT)}::{action_name}"
    scene["export_contract"] = "action_name_matches_clip_name"
    scene["root_motion_contract"] = (
        "visual_event_motion_only; gameplay_root_stays_grounded"
    )

    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(target))
    return {
        "hero": hero,
        "clip": clip,
        "action": action_name,
        "frame_start": frame_start,
        "frame_end": frame_end,
        "fps": int(manifest["fps"]),
        "file": str(target.relative_to(ROOT)),
    }


def main() -> None:
    global manifest
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    report = []
    for hero in manifest["heroes"]:
        master = SOURCE / hero / f"{hero}.blend"
        for clip in manifest["event_clips"]:
            report.append(
                canonicalize_scene(
                    hero, clip, master, SOURCE / hero / "scenes" / f"{clip}.blend"
                )
            )
    report_path = ROOT / "artifacts" / "hero-animation-scene-pack.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {"scenes": len(report), "report": str(report_path)}, ensure_ascii=False
        )
    )


if __name__ == "__main__":
    main()
