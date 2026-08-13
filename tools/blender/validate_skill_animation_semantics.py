"""Validate semantic phase metadata in every canonical skill .blend scene."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = Path(__file__).with_name("hero_skill_animation_semantics.json")
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"


def main() -> None:
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    required = set(spec["required_markers"])
    failures = []
    requested = os.environ.get("HERO_FILTER")
    heroes = spec["heroes"]
    if requested:
        heroes = {requested: heroes[requested]}
    for hero, clips in heroes.items():
        for clip, contract in clips.items():
            path = SOURCE / hero / "scenes" / f"{clip}.blend"
            bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
            scene = bpy.context.scene
            markers = {marker.name: marker.frame for marker in scene.timeline_markers}
            missing = required - markers.keys()
            if missing:
                failures.append(f"{hero}/{clip}: missing markers {sorted(missing)}")
                continue
            expected_frames = contract["frames"]
            if markers["anticipation"] != expected_frames[1]:
                failures.append(f"{hero}/{clip}: anticipation is on the wrong frame")
            if markers["release"] != contract["release"]:
                failures.append(f"{hero}/{clip}: release is on the wrong frame")
            if markers["follow_through"] != expected_frames[-2]:
                failures.append(f"{hero}/{clip}: follow-through is on the wrong frame")
            if scene.get("skill_semantic") != contract["semantic"]:
                failures.append(f"{hero}/{clip}: semantic metadata is stale")
            if scene.get("semantic_revision") != spec["schema"]:
                failures.append(f"{hero}/{clip}: semantic revision is stale")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all canonical skill scenes carry authored semantic phases")


if __name__ == "__main__":
    main()
