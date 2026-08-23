"""Validate the loop-safe locomotion polish on every canonical hero."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

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


def validate_scene(
    path: Path, expected_pass: str, label: str, failures: list[str]
) -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = (
        armature.animation_data.action if armature and armature.animation_data else None
    )
    expected_revision = (
        2 if label.split("/", 1)[0] in IDLE_V2 and label.endswith("/idle") else 1
    )
    expected_pass = (
        "balanced-locomotion-follow-through-v2"
        if expected_revision == 2
        else expected_pass
    )
    if scene.get("natural_locomotion_revision") != expected_revision:
        failures.append(f"{label}: scene revision is stale")
    if scene.get("natural_locomotion_pass") != expected_pass:
        failures.append(f"{label}: scene pass metadata is missing")
    if not action or action.get("natural_locomotion_revision") != expected_revision:
        failures.append(f"{label}: action revision is stale")
    if not action or action.get("natural_locomotion_pass") != expected_pass:
        failures.append(f"{label}: action pass metadata is missing")


def main() -> None:
    failures: list[str] = []
    for hero in FOCUSED:
        for clip in ("idle", "run"):
            validate_scene(
                SOURCE / hero / "scenes" / f"{clip}.blend",
                "balanced-locomotion-follow-through-v1",
                f"{hero}/{clip}",
                failures,
            )
    for clip in ("idle", "run"):
        validate_scene(
            SOURCE / "fairy-mina" / "scenes" / f"{clip}.blend",
            "fairy-secondary-loop",
            f"fairy-mina/{clip}",
            failures,
        )

    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE / "katty" / "katty.blend"))
    armature = bpy.data.objects.get("Root")
    for clip in ("idle", "run"):
        action = next(
            (
                item
                for item in bpy.data.actions
                if item.name.casefold().split(".")[0] == clip
            ),
            None,
        )
        if not action or action.get("katty_natural_motion_revision") != 1:
            failures.append(f"katty/{clip}: action revision is stale")
        if (
            not action
            or action.get("katty_natural_motion_pass")
            != "legacy-end-effector-follow-through"
        ):
            failures.append(f"katty/{clip}: action pass metadata is missing")
    if (
        armature is None
        or bpy.data.objects.get("CHARACTER", {}).get("katty_orientation_revision") != 1
    ):
        failures.append("katty: orientation revision is stale")

    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: all canonical hero idle/run clips carry locomotion polish")


if __name__ == "__main__":
    main()
