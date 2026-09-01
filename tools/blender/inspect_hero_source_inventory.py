"""Print source object, rig, and Action inventories from canonical masters."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import ALL_HEROES, master_path


def main() -> None:
    for hero in ALL_HEROES:
        hero_dir = SOURCE / hero
        path = master_path(hero)
        if not path.exists():
            print("MISSING_MASTER", hero, path)
            continue
        bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
        armature = next(
            (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"),
            None,
        )
        actions = [
            (
                action.name,
                [round(value, 2) for value in action.frame_range],
                len(action.fcurves) if hasattr(action, "fcurves") else -1,
            )
            for action in bpy.data.actions
        ]
        print(
            "INVENTORY",
            hero,
            path.name,
            "objects",
            len(bpy.context.scene.objects),
            "meshes",
            sum(obj.type == "MESH" for obj in bpy.context.scene.objects),
            "armature",
            armature.name if armature else None,
            "bones",
            len(armature.data.bones) if armature else 0,
            "actions",
            actions,
        )


if __name__ == "__main__":
    main()
