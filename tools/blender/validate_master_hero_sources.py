"""Validate canonical one-master-per-hero Blender sources."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import (
    ALL_HEROES,
    CLIP_ACTIONS,
    EXTRA_ACTIONS,
    KATTY_ACTIONS,
    SOURCE,
    actions_for,
    master_path,
)

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads(
    (Path(__file__).with_name("hero_animation_scene_manifest.json")).read_text(
        encoding="utf-8"
    )
)
REQUIRED_ACTIONS = tuple(CLIP_ACTIONS.values())
POSE_BONE = re.compile(r'pose\.bones\["([^"]+)"\]')


def find_armature():
    return next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
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


def action_matches(name: str, canonical: str) -> bool:
    return name.casefold() == canonical.casefold()


def exact_actions(canonical: str):
    return [
        action
        for action in bpy.data.actions
        if action.name.casefold().split(".")[0] == canonical.casefold()
    ]


def validate_action(
    action, hero: str, clip: str, armature, failures: list[str]
) -> None:
    if action.get("hero_slug") != hero:
        failures.append(f"{clip}: hero_slug metadata is {action.get('hero_slug')!r}")
    if action.get("clip_name") != clip:
        failures.append(f"{clip}: clip_name metadata is {action.get('clip_name')!r}")
    if action.get("source_layout") != "master-actions":
        failures.append(f"{clip}: source_layout metadata is missing")
    start, end = action.frame_range
    if not end >= start:
        failures.append(f"{clip}: invalid frame range {tuple(action.frame_range)}")
    if action.get("frame_start") != int(round(start)):
        failures.append(f"{clip}: frame_start metadata does not match Action")
    if action.get("frame_end") != int(round(end)):
        failures.append(f"{clip}: frame_end metadata does not match Action")
    bones = {bone.name for bone in armature.data.bones}
    keyed_bones = set()
    for curve in action_fcurves(action):
        match = POSE_BONE.search(curve.data_path)
        if match:
            keyed_bones.add(match.group(1))
    missing = sorted(keyed_bones - bones)
    if missing:
        failures.append(f"{clip}: keyed bones missing from armature: {missing[:8]}")


def validate_hero(hero: str) -> dict:
    master = master_path(hero)
    failures: list[str] = []
    if not master.exists():
        return {"hero": hero, "path": master.as_posix(), "failures": ["missing master"]}
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    armature = find_armature()
    if armature is None:
        failures.append("missing armature")
    else:
        if bpy.context.scene.get("hero_slug") != hero:
            failures.append("scene hero_slug metadata is missing or wrong")
        for clip, action_name in actions_for(hero).items():
            matches = exact_actions(action_name)
            if len(matches) != 1:
                failures.append(
                    f"{clip}: expected exactly one Action {action_name!r}, found "
                    f"{[action.name for action in matches]}"
                )
                continue
            validate_action(matches[0], hero, clip, armature, failures)

    if hero == "brock-zeus":
        cloud = bpy.data.objects.get("Cloud")
        if cloud is None or cloud.type != "MESH":
            failures.append("missing Cloud mesh")
        cloud_names = ["Cloud_root_idle"] + [
            f"Cloud_{action_name}" for action_name in actions_for(hero).values()
        ]
        for action_name in cloud_names:
            if len(exact_actions(action_name)) != 1:
                failures.append(f"missing or duplicate Cloud Action {action_name}")

    return {
        "hero": hero,
        "path": master.relative_to(ROOT).as_posix(),
        "action_count": len(bpy.data.actions),
        "armature": armature.name if armature else None,
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", choices=ALL_HEROES)
    blender_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(blender_args)
    heroes = (args.hero,) if args.hero else ALL_HEROES
    reports = [validate_hero(hero) for hero in heroes]
    output = ROOT / "output" / "blender" / "master-hero-source-validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    failures = [
        f"{report['hero']}: {failure}"
        for report in reports
        for failure in report["failures"]
    ]
    print(
        json.dumps(
            {
                "heroes": len(reports),
                "failures": len(failures),
                "output": os.fspath(output),
            }
        )
    )
    if failures:
        raise RuntimeError("\n".join(failures))


if __name__ == "__main__":
    main()
