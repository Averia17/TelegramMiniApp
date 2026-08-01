"""Export one authoritative glTF animation clip from every focused scene.

Blender 5.2 can evaluate a focused Action correctly but can collapse imported
Actions when several are assembled into one master file. This exporter keeps
the focused-scene evaluation path and leaves clip assembly to the pure-Python
GLB merger.
"""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "artifacts" / "runtime-direct-clips"
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
CLIPS = (
    "idle",
    "run",
    "attack",
    "super",
    "aim",
    "aim-super",
    "hit",
    "death",
    "spawn",
    "victory",
    "gadget",
)


def export_clip(hero: str, clip: str) -> None:
    source = SOURCE / hero / "scenes" / f"{clip}.blend"
    if not source.exists():
        raise RuntimeError(f"Missing focused scene: {source}")
    destination_dir = OUTPUT / hero
    destination_dir.mkdir(parents=True, exist_ok=True)
    destination = destination_dir / f"{clip}.glb"
    temporary = destination_dir / f".{clip}.tmp.glb"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(source))
    bpy.context.scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(temporary),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIVE_ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    temporary.replace(destination)
    print(f"DIRECT_EXPORTED {hero}/{clip}")


def main() -> None:
    requested = os.environ.get("HERO_FILTER")
    heroes = [hero for hero in HEROES if not requested or hero == requested]
    if requested and not heroes:
        raise RuntimeError(f"Unknown HERO_FILTER={requested!r}")
    requested_clip = os.environ.get("CLIP_FILTER")
    clips = [clip for clip in CLIPS if not requested_clip or clip == requested_clip]
    if requested_clip and not clips:
        raise RuntimeError(f"Unknown CLIP_FILTER={requested_clip!r}")
    for hero in heroes:
        for clip in clips:
            export_clip(hero, clip)


if __name__ == "__main__":
    main()
