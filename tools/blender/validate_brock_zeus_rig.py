"""Regression checks for the Brock Zeus duplicate-arm removal."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
CLIPS = ("idle", "run", "attack", "super", "gadget")
REPAIR_NAME = "BrockZeus_RightArm_Repair"
REVISION = 2
PASS_NAME = "duplicate-right-arm-removed-v2"


def validate_clip(clip: str) -> list[str]:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE / f"{clip}.blend"))
    scene = bpy.context.scene
    repair = scene.objects.get(REPAIR_NAME)
    failures = []
    if repair is not None:
        failures.append(f"{clip}: duplicate repair mesh {REPAIR_NAME} is still present")
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = (
        armature.animation_data.action if armature and armature.animation_data else None
    )
    if scene.get("brock_rig_revision") != REVISION:
        failures.append(f"{clip}: scene rig revision is stale")
    if scene.get("brock_rig_pass") != PASS_NAME:
        failures.append(f"{clip}: scene rig pass is stale")
    if not action or action.get("brock_rig_revision") != REVISION:
        failures.append(f"{clip}: action rig revision is stale")
    if not action or action.get("brock_rig_pass") != PASS_NAME:
        failures.append(f"{clip}: action rig pass is stale")
    return failures


def main() -> None:
    failures = [failure for clip in CLIPS for failure in validate_clip(clip)]
    if failures:
        raise RuntimeError("\n".join(failures))
    print("PASS: Brock Zeus has no duplicate right-arm repair in any canonical scene")


if __name__ == "__main__":
    main()
