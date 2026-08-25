"""Print source object, rig, and Action inventories from canonical masters."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"


def main() -> None:
    for hero_dir in sorted(path for path in SOURCE.iterdir() if path.is_dir()):
        path = hero_dir / f"{hero_dir.name}.blend"
        if not path.exists():
            print("MISSING_MASTER", hero_dir.name, path)
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
            hero_dir.name,
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
