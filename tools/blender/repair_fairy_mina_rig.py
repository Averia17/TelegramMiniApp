"""Remove implicit edit-mode bone connections from Fairy Mina's master rig.

The imported Mina rig uses parent relationships for animation, but several
children also carry Blender's ``use_connect`` flag.  That makes unrelated
rest-pose segments snap together when the armature is edited.  This repair
preserves every bone matrix, parent, vertex group, and Action; it only clears
the edit-time connection flag and records the rig revision in the master.

Run with Blender from the repository root::

    blender --background --python tools/blender/repair_fairy_mina_rig.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REVISION = "fairy-mina-clean-connections-v1"


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError("fairy-mina: master has no armature")

    connected_before = sorted(
        bone.name for bone in armature.data.bones if bone.use_connect
    )
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
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print(
        json.dumps(
            {
                "master": os.fspath(MASTER),
                "armature": armature.name,
                "connected_before": connected_before,
                "connected_after": [
                    bone.name for bone in armature.data.bones if bone.use_connect
                ],
                "revision": REVISION,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
