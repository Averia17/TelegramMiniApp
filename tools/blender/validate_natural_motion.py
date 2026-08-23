"""Validate the delayed secondary-motion pass on every canonical skill scene."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
SPEC_PATH = Path(__file__).with_name("hero_skill_animation_semantics.json")
REVISION = 2


def main():
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    requested = os.environ.get("HERO_FILTER")
    heroes = spec["heroes"]
    if requested:
        heroes = {requested: heroes[requested]}
    failures = []
    for hero, clips in heroes.items():
        for clip in clips:
            path = SOURCE / hero / "scenes" / f"{clip}.blend"
            bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
            scene = bpy.context.scene
            armature = next(
                (obj for obj in scene.objects if obj.type == "ARMATURE"), None
            )
            action = (
                armature.animation_data.action
                if armature and armature.animation_data
                else None
            )
            if scene.get("natural_motion_revision") != REVISION:
                failures.append(f"{hero}/{clip}: scene revision is stale")
            if not action or action.get("natural_motion_revision") != REVISION:
                failures.append(f"{hero}/{clip}: action revision is stale")
            if scene.get("natural_motion_pass") != "delayed-secondary-overlap-v2":
                failures.append(f"{hero}/{clip}: pass metadata is missing")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all canonical skill scenes carry delayed secondary overlap")


if __name__ == "__main__":
    main()
