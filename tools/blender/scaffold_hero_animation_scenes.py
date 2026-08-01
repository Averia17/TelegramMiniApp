"""Create authoring .blend scenes for hero-specific ability clips.

Run with Blender's Python, for example:
  blender --background --python tools/blender/scaffold_hero_animation_scenes.py

The event scenes are the source of already-authored actions. This script copies
those actions into the ability scene; it never creates animation keys.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
MANIFEST = Path(__file__).with_name("hero_animation_scene_manifest.json")


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for hero in manifest["heroes"]:
        master = SOURCE / hero / f"{hero}.blend"
        for clip in manifest["ability_clips"]:
            target = SOURCE / hero / "scenes" / f"{clip}.blend"
            if target.exists():
                continue
            source_scene = SOURCE / hero / "animations" / f"{clip}.blend"
            if clip == "gadget":
                # Gadget choreography is not invented here. Artists must author
                # this scene before a gadget GLB is allowed into runtime.
                bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
            elif source_scene.exists():
                bpy.ops.wm.open_mainfile(filepath=os.fspath(source_scene))
            else:
                continue
            scene = bpy.context.scene
            scene.name = f"{hero}_{clip}"
            scene.render.fps = manifest["fps"]
            scene.frame_start = 1
            scene.frame_end = 45 if clip == "super" else 30
            scene["hero_slug"] = hero
            scene["clip_name"] = clip.capitalize()
            scene["clip_kind"] = "ability"
            scene["authoring_status"] = "TODO_AUTHOR_IN_THIS_SCENE"
            scene["export_contract"] = "action_name_matches_clip_name"
            scene["source_scene"] = (
                str(source_scene.relative_to(ROOT)) if source_scene.exists() else ""
            )
            scene["authoring_status"] = (
                "READY_FOR_REVIEW"
                if source_scene.exists()
                else "TODO_AUTHOR_IN_THIS_SCENE"
            )
            target.parent.mkdir(parents=True, exist_ok=True)
            bpy.ops.wm.save_as_mainfile(filepath=os.fspath(target))
            print(f"SCAFFOLDED {hero}/{clip}: {target}")


if __name__ == "__main__":
    main()
