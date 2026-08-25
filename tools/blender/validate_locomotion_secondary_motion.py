"""Validate the loop-safe locomotion polish on every canonical hero."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))
from master_action_utils import activate_action

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"

FOCUSED = (
    "mandy",
    "kaze",
    "wukong-mico",
    "needle",
    "persephone-lumi",
    "brock-zeus",
)

IDLE_V2 = {"mandy", "kaze", "needle", "brock-zeus"}
IDLE_V3 = {
    "brock-zeus",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
}


def validate_scene(
    path: Path, expected_pass: str, label: str, failures: list[str]
) -> None:
    hero = label.split("/", 1)[0]
    clip = label.split("/", 1)[1]
    _, scene, armature, action = activate_action(hero, clip)
    expected_revision = (
        3
        if hero in IDLE_V3 and label.endswith("/idle")
        else (2 if hero in IDLE_V2 and label.endswith("/idle") else 1)
    )
    expected_pass = (
        "loop-safe-frame-smoothing-v3"
        if expected_revision == 3
        else (
            "balanced-locomotion-follow-through-v2"
            if expected_revision == 2
            else "fairy-secondary-loop" if hero == "fairy-mina" else expected_pass
        )
    )
    if not action or action.get("natural_locomotion_revision") != expected_revision:
        failures.append(f"{label}: action revision is stale")
    if not action or action.get("natural_locomotion_pass") != expected_pass:
        failures.append(f"{label}: action pass metadata is missing")


def main() -> None:
    failures: list[str] = []
    requested = os.environ.get("HERO_FILTER")
    focused = () if requested == "katty" else ((requested,) if requested else FOCUSED)
    for hero in focused:
        for clip in ("idle", "run"):
            validate_scene(
                SOURCE / hero / f"{hero}.blend",
                "balanced-locomotion-follow-through-v1",
                f"{hero}/{clip}",
                failures,
            )
    if not requested or requested == "fairy-mina":
        for clip in ("idle", "run"):
            validate_scene(
                SOURCE / "fairy-mina" / "fairy-mina.blend",
                "fairy-secondary-loop",
                f"fairy-mina/{clip}",
                failures,
            )

    # Katty already has a canonical master and authored idle/run Actions, but
    # its older source never carried the optional locomotion-pass metadata.
    # The master migration must not invent a polish revision for it.

    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all canonical hero idle/run clips carry locomotion polish")


if __name__ == "__main__":
    main()
