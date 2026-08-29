"""Write a machine-readable structure audit for every canonical hero rig."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import ALL_HEROES, actions_for, master_path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "blender" / "hero-rig-structure-audit.json"


def inspect_hero(hero: str) -> dict:
    master = master_path(hero)
    if not master.exists():
        return {"hero": hero, "master": os.fspath(master), "error": "missing master"}

    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        return {"hero": hero, "master": os.fspath(master), "error": "missing armature"}

    weighted = set()
    meshes = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        groups = sorted(group.name for group in obj.vertex_groups)
        weighted.update(groups)
        meshes.append(
            {
                "name": obj.name,
                "parent": obj.parent.name if obj.parent else None,
                "armature_modifiers": [
                    modifier.object.name
                    for modifier in obj.modifiers
                    if modifier.type == "ARMATURE" and modifier.object
                ],
                "vertex_groups": groups,
            }
        )

    bones = list(armature.data.bones)
    return {
        "hero": hero,
        "master": os.fspath(master),
        "armature": armature.name,
        "rig_revision": armature.data.get("rig_revision"),
        "bone_count": len(bones),
        "connected_bones": sorted(bone.name for bone in bones if bone.use_connect),
        "root_bones": sorted(bone.name for bone in bones if bone.parent is None),
        "unweighted_bones": sorted(
            bone.name for bone in bones if bone.name not in weighted
        ),
        "parent_map": [
            {"bone": bone.name, "parent": bone.parent.name if bone.parent else None}
            for bone in bones
        ],
        "socket_parents": {
            obj.name: obj.parent.name if obj.parent else None
            for obj in bpy.context.scene.objects
            if obj.name.startswith("Socket.")
        },
        "meshes": meshes,
        "actions": sorted(
            action.name
            for action in bpy.data.actions
            if action.name in actions_for(hero).values()
        ),
    }


def main() -> None:
    report = [inspect_hero(hero) for hero in ALL_HEROES]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"WROTE {OUTPUT}")


if __name__ == "__main__":
    main()
