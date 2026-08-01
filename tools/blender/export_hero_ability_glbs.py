"""Export per-hero authored ability scenes as standalone GLBs.

Only scenes containing a real authored action are exported. Gadget scenes stay
out of runtime until an artist has authored one; no generic fallback is used.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes"


def export_scene(hero: str, clip: str) -> bool:
    scene_file = SOURCE / hero / "scenes" / f"{clip}.blend"
    if not scene_file.exists():
        return False
    bpy.ops.wm.open_mainfile(filepath=os.fspath(scene_file))
    scene = bpy.context.scene
    if scene.get("authoring_status") != "READY_FOR_REVIEW":
        return False
    action_name = clip.capitalize()
    armature = next((o for o in scene.objects if o.type == "ARMATURE"), None)
    if armature is None or bpy.data.actions.get(action_name) is None:
        return False
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions[action_name]
    scene.frame_start = int(scene.get("frame_start", 1))
    scene.frame_end = int(scene.get("frame_end", 45))
    output = OUTPUT / hero / "abilities" / f"{clip}.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(output),
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    print(f"EXPORTED {hero}/{clip}: {output}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", default="*")
    parser.add_argument("--clips", nargs="+", default=["attack", "super", "gadget"])
    args, _unknown = parser.parse_known_args()
    heroes = (
        [args.hero]
        if args.hero != "*"
        else sorted(p.name for p in SOURCE.iterdir() if p.is_dir())
    )
    for hero in heroes:
        for clip in args.clips:
            if not export_scene(hero, clip):
                print(f"SKIPPED {hero}/{clip}: no authored scene/action")


if __name__ == "__main__":
    main()
