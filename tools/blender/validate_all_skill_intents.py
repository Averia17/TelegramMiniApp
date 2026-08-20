"""RED/GREEN validator for one readable intent beat in every skill scene."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
SPEC = Path(__file__).with_name("hero_skill_animation_semantics.json")
INTENTS = {
    "mandy": {"attack": "strike", "super": "wave_release", "gadget": "stance_lock"},
    "kaze": {"attack": "slash_2", "super": "dash_impact", "gadget": "vanish"},
    "wukong-mico": {
        "attack": "staff_impact",
        "super": "vortex_open",
        "gadget": "armor_lock",
    },
    "needle": {"attack": "spore_release", "super": "root_plant", "gadget": "heal_tick"},
    "fairy-mina": {"attack": "star_fan", "super": "cocoon_follow", "gadget": "repel"},
    "persephone-lumi": {
        "attack": "orb_cast",
        "super": "root_rise",
        "gadget": "garden_burst",
    },
    "brock-zeus": {
        "attack": "thunder_fire",
        "super": "strike_3",
        "gadget": "cable_prime",
    },
}
EXPECTED_REVISIONS = {("kaze", "gadget"): 3}
INTENT_FRAMES = {("brock-zeus", "super"): 42}


def main() -> None:
    failures = []
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    for hero, clips in INTENTS.items():
        for clip, intent in clips.items():
            path = SOURCE / hero / "scenes" / f"{clip}.blend"
            bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
            scene = bpy.context.scene
            markers = {marker.name: marker.frame for marker in scene.timeline_markers}
            expected_revision = EXPECTED_REVISIONS.get((hero, clip), 2)
            if scene.get("readability_revision") != expected_revision:
                failures.append(
                    f"{hero}/{clip}: readability revision is not {expected_revision}"
                )
            if intent not in markers:
                failures.append(f"{hero}/{clip}: missing intent marker {intent!r}")
            contract = spec["heroes"][hero][clip]
            expected_frame = INTENT_FRAMES.get((hero, clip), contract["release"])
            if markers.get(intent) != expected_frame:
                failures.append(f"{hero}/{clip}: intent marker is not on release frame")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all focused hero skills carry a semantic intent beat")


if __name__ == "__main__":
    main()
