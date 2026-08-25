"""Validate the second-pass readability anchors in focused skill scenes."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import action_marker, activate_action

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
    requested = os.environ.get("HERO_FILTER")
    expected = {
        key: value
        for key, value in EXPECTED.items()
        if not requested or key[0] == requested
    }
    for (hero, clip), expected_markers in expected.items():
        _, _, _, action = activate_action(hero, clip)
        markers = {name: action_marker(action, name) for name in expected_markers}
        expected_revision = REVISIONS.get((hero, clip), 2)
        if action.get("readability_revision") != expected_revision:
            failures.append(
                f"{hero}/{clip}: readability pass {expected_revision} is missing"
            )
        for name, frame in expected_markers.items():
            if action_marker(action, name) != frame:
                failures.append(
                    f"{hero}/{clip}: {name!r} expected at {frame}, got {markers.get(name)}"
                )
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: master Actions carry the second-pass readability anchors")


if __name__ == "__main__":
    main()
