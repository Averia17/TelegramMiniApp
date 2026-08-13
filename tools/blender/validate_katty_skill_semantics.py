"""Validate Katty's generated master .blend skill-action semantics."""

from __future__ import annotations

import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "katty" / "katty.blend"
EXPECTED = {
    "Attack": (5, 7, 22),
    "super": (10, 18, 30),
    "Gadget": (5, 9, 18),
}


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE))
    failures = []
    for action_name, frames in EXPECTED.items():
        action = bpy.data.actions.get(action_name)
        if action is None:
            failures.append(f"missing action {action_name}")
            continue
        actual = (
            action.get("anticipation_frame"),
            action.get("release_frame"),
            action.get("follow_through_frame"),
        )
        if actual != frames:
            failures.append(f"{action_name}: expected phases {frames}, got {actual}")
        if not action.get("skill_semantic"):
            failures.append(f"{action_name}: missing semantic description")
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: Katty master actions carry authored semantic phases")


if __name__ == "__main__":
    main()
