"""Validate the focused semantic revision-3 refinements."""

from __future__ import annotations

import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
EXPECTED = {
    ("needle", "gadget"): ("moisture_core", 6),
    ("wukong-mico", "gadget"): ("armor_brace", 20),
    ("persephone-lumi", "gadget"): ("garden_snap", 13),
    ("brock-zeus", "gadget"): ("cable_charge", 10),
    ("fairy-mina", "super"): ("cocoon_offer", 25),
}


def main() -> None:
    failures = []
    for (hero, clip), (marker_name, frame) in EXPECTED.items():
        path = SOURCE / hero / "scenes" / f"{clip}.blend"
        bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
        scene = bpy.context.scene
        markers = {marker.name: marker.frame for marker in scene.timeline_markers}
        if scene.get("readability_revision") != 3:
            failures.append(f"{hero}/{clip}: expected readability revision 3")
        if markers.get(marker_name) != frame:
            failures.append(f"{hero}/{clip}: expected {marker_name} at frame {frame}")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: revision-3 semantic refinements are authored")


if __name__ == "__main__":
    main()
