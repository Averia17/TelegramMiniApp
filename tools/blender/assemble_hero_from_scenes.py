"""Assemble authored event/ability actions into one hero master and GLB.

Usage:
  blender --background --python tools/blender/assemble_hero_from_scenes.py -- --hero mandy
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
RUNTIME = ROOT / "frontend" / "public" / "assets" / "heroes"


def import_actions(path: Path, allowed: set[str]) -> list[str]:
    with bpy.data.libraries.load(os.fspath(path), link=False) as (data_from, data_to):
        names = [name for name in data_from.actions if name in allowed]
        data_to.actions = names
    imported = []
    for action in data_to.actions:
        if action is not None:
            imported.append(action.name)
    return imported


def assemble(hero: str) -> None:
    hero_dir = SOURCE / hero
    master = hero_dir / f"{hero}.blend"
    if not master.exists():
        raise FileNotFoundError(master)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError(f"{hero}: master has no armature")

    allowed = {"Attack", "Super", "Gadget"}
    imported = []
    for clip in ("attack", "super", "gadget"):
        scene_file = hero_dir / "scenes" / f"{clip}.blend"
        if not scene_file.exists():
            continue
        imported.extend(import_actions(scene_file, allowed))

    armature.animation_data_create()
    if bpy.data.actions.get("Idle"):
        armature.animation_data.action = bpy.data.actions["Idle"]
    bpy.context.scene["assembled_from_scenes"] = True
    bpy.context.scene["assembled_ability_actions"] = ",".join(sorted(set(imported)))

    output = RUNTIME / hero / f"{hero}.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(master))
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(output),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    print(f"ASSEMBLED {hero}: imported={sorted(set(imported))} output={output}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", required=True)
    args = parser.parse_args()
    assemble(args.hero)


if __name__ == "__main__":
    main()
