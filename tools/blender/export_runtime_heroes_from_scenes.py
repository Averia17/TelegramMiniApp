"""Re-export runtime hero GLBs from existing Blender masters and authored scenes.

This is intentionally export-only: it never saves or modifies source .blend
files and never creates animation keys.
"""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_heroes"
HEROES = (
    "brock-zeus",
    "damian",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
)


def actions_from_scene(path: Path, names: set[str]) -> None:
    with bpy.data.libraries.load(os.fspath(path), link=False) as (source, target):
        target.actions = [name for name in source.actions if name in names]


def export(hero: str) -> None:
    hero_dir = SOURCE / hero
    bpy.ops.wm.open_mainfile(filepath=os.fspath(hero_dir / f"{hero}.blend"))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError(f"{hero}: no armature in master")
    for clip in (
        "idle",
        "run",
        "aim",
        "aim-super",
        "attack",
        "super",
        "spawn",
        "victory",
        "defeat",
    ):
        source = hero_dir / "animations" / f"{clip}.blend"
        if source.exists():
            actions_from_scene(source, {clip.capitalize()})
    for clip in ("attack", "super"):
        source = hero_dir / "scenes" / f"{clip}.blend"
        if source.exists():
            actions_from_scene(source, {clip.capitalize()})
    armature.animation_data_create()
    if bpy.data.actions.get("Idle"):
        armature.animation_data.action = bpy.data.actions["Idle"]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    out = OUTPUT / f"{hero}_base.glb"
    temp_out = OUTPUT / f"{hero}_base_rebuilt.glb"
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(temp_out),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    print(f"EXPORTED {hero}: {temp_out} (source runtime GLB was not overwritten)")


def main() -> None:
    for hero in HEROES:
        export(hero)


if __name__ == "__main__":
    main()
