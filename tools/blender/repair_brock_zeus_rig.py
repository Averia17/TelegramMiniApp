"""Remove the duplicate Brock Zeus right-arm repair from every scene."""

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


def repair_clip(clip: str) -> None:
    path = SOURCE / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    repair = scene.objects.get(REPAIR_NAME)
    if repair is not None:
        bpy.data.objects.remove(repair, do_unlink=True)

    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError(f"{clip}: missing armature")

    scene["brock_rig_revision"] = REVISION
    scene["brock_rig_pass"] = PASS_NAME
    action = armature.animation_data.action if armature.animation_data else None
    if action is not None:
        action["brock_rig_revision"] = REVISION
        action["brock_rig_pass"] = PASS_NAME
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"REPAIRED brock-zeus/{clip}: {PASS_NAME}")


def main() -> None:
    for clip in CLIPS:
        repair_clip(clip)


if __name__ == "__main__":
    main()
