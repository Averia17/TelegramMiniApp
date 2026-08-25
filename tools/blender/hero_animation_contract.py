"""Canonical source/runtime contract shared by master-only Blender tools."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
MANIFEST_PATH = Path(__file__).with_name("hero_animation_scene_manifest.json")
MANIFEST = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

CLIP_ACTIONS = {
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
    "gadget": "Gadget",
}
EXTRA_ACTIONS = {
    hero: {clip: "AimGadget" for clip in clips}
    for hero, clips in MANIFEST["hero_animation_extras"].items()
}
ALL_HEROES = tuple(MANIFEST["heroes"])
KATTY_ACTIONS = dict(CLIP_ACTIONS)


def actions_for(hero: str) -> dict[str, str]:
    actions = dict(CLIP_ACTIONS)
    actions.update(EXTRA_ACTIONS.get(hero, {}))
    if hero == "katty":
        return KATTY_ACTIONS.copy()
    return actions


def master_path(hero: str) -> Path:
    relative_path = MANIFEST.get("master_files", {}).get(hero, f"{hero}.blend")
    return SOURCE / hero / relative_path
