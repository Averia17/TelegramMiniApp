"""Clear implicit edit-mode bone connections from canonical hero masters.

Parent relationships, rest transforms, vertex groups, and Actions are left
unchanged.  Only Blender's ``EditBone.use_connect`` flag is removed so a
child cannot snap to its parent's tail while the source rig is being edited.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import ALL_HEROES, master_path

REVISION = "hero-rig-clean-connections-v1"


def repair_hero(hero: str) -> dict:
    master = master_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError(f"{hero}: master has no armature")

    connected_before = sorted(
        bone.name for bone in armature.data.bones if bone.use_connect
    )
    if not connected_before:
        return {"hero": hero, "changed": False, "connected_before": []}

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in armature.data.edit_bones:
        bone.use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")

    armature.data["rig_revision"] = REVISION
    armature.data["rig_connection_policy"] = "explicit-disconnected-rest-pose"
    bpy.context.scene["rig_revision"] = REVISION
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(master), check_existing=False)
    return {
        "hero": hero,
        "changed": True,
        "connected_before": connected_before,
        "connected_after": [
            bone.name for bone in armature.data.bones if bone.use_connect
        ],
        "revision": REVISION,
    }


def main() -> None:
    report = [repair_hero(hero) for hero in ALL_HEROES]
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
