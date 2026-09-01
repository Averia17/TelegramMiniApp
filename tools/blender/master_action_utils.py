"""Shared helpers for authoring and auditing master-based hero Actions."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from hero_animation_contract import master_path

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
    "aim": "Aim",
    "aim-super": "AimSuper",
    "aim-gadget": "AimGadget",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
    "gadget": "Gadget",
    "stunned": "Stunned",
}


def find_action(name: str):
    matches = [
        action
        for action in bpy.data.actions
        if action.name.casefold().split(".")[0] == name.casefold()
    ]
    if len(matches) > 1:
        raise RuntimeError(
            f"duplicate Action {name!r}: {[item.name for item in matches]}"
        )
    return matches[0] if matches else None


def open_master(hero: str):
    path = master_path(hero)
    if not path.exists():
        raise RuntimeError(f"{hero}: missing master source {path}")
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError(f"{hero}: master has no armature")
    return path, bpy.context.scene, armature


def activate_action(hero: str, clip: str):
    path, scene, armature = open_master(hero)
    action_name = ACTION_NAMES[clip]
    action = find_action(action_name)
    if action is None:
        raise RuntimeError(f"{hero}/{clip}: missing Action {action_name!r}")
    armature.animation_data_create()
    armature.animation_data.action = action
    scene.frame_start = int(round(action.frame_range[0]))
    scene.frame_end = int(round(action.frame_range[1]))
    scene.frame_set(scene.frame_start)
    return path, scene, armature, action


def action_marker(action, name: str):
    value = action.get(f"marker_{name}")
    return int(value) if value is not None else None


def save_master(path: Path) -> None:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
