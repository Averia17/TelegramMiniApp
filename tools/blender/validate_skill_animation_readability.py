"""Validate the second-pass readability anchors in focused skill scenes."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
EXPECTED = {
    ("mandy", "gadget"): {"guard_lock": 8},
    ("kaze", "gadget"): {"vanish": 7},
    ("fairy-mina", "gadget"): {"repel": 7},
    ("brock-zeus", "super"): {
        "strike_1": 18,
        "strike_2": 30,
        "strike_3": 42,
    },
}
REVISIONS = {("kaze", "gadget"): 3}


def main() -> None:
    failures = []
    for (hero, clip), expected_markers in EXPECTED.items():
        path = SOURCE / hero / "scenes" / f"{clip}.blend"
        bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
        scene = bpy.context.scene
        markers = {marker.name: marker.frame for marker in scene.timeline_markers}
        expected_revision = REVISIONS.get((hero, clip), 2)
        if scene.get("readability_revision") != expected_revision:
            failures.append(
                f"{hero}/{clip}: readability pass {expected_revision} is missing"
            )
        for name, frame in expected_markers.items():
            if markers.get(name) != frame:
                failures.append(
                    f"{hero}/{clip}: {name!r} expected at {frame}, got {markers.get(name)}"
                )
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: focused skills carry the second-pass readability anchors")


if __name__ == "__main__":
    main()
