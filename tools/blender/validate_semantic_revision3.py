"""Validate the focused semantic revision-3 refinements."""

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
    ("needle", "gadget"): ("moisture_core", 6),
    ("wukong-mico", "gadget"): ("armor_brace", 20),
    ("persephone-lumi", "gadget"): ("garden_snap", 13),
    ("brock-zeus", "gadget"): ("cable_charge", 10),
    ("fairy-mina", "super"): ("cocoon_offer", 25),
}


def main() -> None:
    failures = []
    requested = os.environ.get("HERO_FILTER")
    expected = {
        key: value
        for key, value in EXPECTED.items()
        if not requested or key[0] == requested
    }
    for (hero, clip), (marker_name, frame) in expected.items():
        _, _, _, action = activate_action(hero, clip)
        if action.get("readability_revision") != 3:
            failures.append(f"{hero}/{clip}: expected readability revision 3")
        if action_marker(action, marker_name) != frame:
            failures.append(f"{hero}/{clip}: expected {marker_name} at frame {frame}")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: revision-3 semantic refinements are authored")


if __name__ == "__main__":
    main()
