"""Validate the authored death-animation polish contract in source scenes."""

from __future__ import annotations

import os
from pathlib import Path

import bpy


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
REQUIRED_MARKERS = {
    "death_anticipation",
    "death_pop",
    "death_follow_through",
}


def active_action():
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    return armature.animation_data.action


def main():
    failures = []
    styles = set()
    for hero in HEROES:
        path = SOURCE / hero / "scenes" / "death.blend"
        bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
        scene = bpy.context.scene
        action = active_action()
        marker_names = {marker.name for marker in scene.timeline_markers}
        missing = REQUIRED_MARKERS - marker_names
        if missing:
            failures.append(f"{hero}: missing markers {sorted(missing)}")
        if scene.get("death_polish_revision") != 1 or action.get("death_polish_revision") != 1:
            failures.append(f"{hero}: death polish revision is stale")
        style = action.get("death_style")
        if not style:
            failures.append(f"{hero}: missing death style")
        styles.add(style)
    katty_path = SOURCE / "katty" / "katty.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(katty_path))
    katty_death = bpy.data.actions.get("death")
    if not katty_death or katty_death.get("death_polish_revision") != 1:
        failures.append("katty: death polish revision is stale")
    else:
        styles.add(katty_death.get("death_style"))
    if len(styles) != len(HEROES) + 1:
        failures.append(f"death styles must be unique, got {sorted(styles)}")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all eight heroes have unique polished death performances")


if __name__ == "__main__":
    main()
