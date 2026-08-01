"""Export per-hero authored ability scenes as standalone GLBs.

Only scenes containing a real authored action are exported. Gadget scenes stay
out of runtime until an artist has authored one; no generic fallback is used.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes"


def rename_single_glb_animation(path: Path, name: str) -> None:
    """Rename Blender's ACTIVE_ACTIONS placeholder without re-exporting data."""
    source = path.read_bytes()
    chunks = []
    offset = 12
    while offset < len(source):
        chunk_length, chunk_type = struct.unpack_from("<II", source, offset)
        start = offset + 8
        chunks.append((chunk_type, source[start : start + chunk_length]))
        offset = start + chunk_length
    rebuilt = bytearray(source[:12])
    for chunk_type, payload in chunks:
        if chunk_type == 0x4E4F534A:
            document = json.loads(payload.rstrip(b" \t\r\n").decode("utf-8"))
            animations = document.get("animations", [])
            if len(animations) != 1:
                raise RuntimeError(
                    f"{path}: expected one active animation, got {len(animations)}"
                )
            animations[0]["name"] = name
            payload = json.dumps(
                document, ensure_ascii=False, separators=(",", ":")
            ).encode("utf-8")
            payload += b" " * ((4 - len(payload) % 4) % 4)
        rebuilt.extend(struct.pack("<II", len(payload), chunk_type))
        rebuilt.extend(payload)
    struct.pack_into("<I", rebuilt, 8, len(rebuilt))
    path.write_bytes(rebuilt)


def export_scene(hero: str, clip: str) -> bool:
    scene_file = SOURCE / hero / "scenes" / f"{clip}.blend"
    if not scene_file.exists():
        return False
    bpy.ops.wm.open_mainfile(filepath=os.fspath(scene_file))
    scene = bpy.context.scene
    if scene.get("authoring_status") not in {
        "READY_FOR_REVIEW",
        "AUTHORED_FRAME_BY_FRAME",
    }:
        return False
    action_name = {"attack": "Attack", "super": "super", "gadget": "Gadget"}[clip]
    armature = next((o for o in scene.objects if o.type == "ARMATURE"), None)
    if armature is None or bpy.data.actions.get(action_name) is None:
        return False
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions[action_name]
    scene.frame_start = int(scene.get("frame_start", 1))
    scene.frame_end = int(scene.get("frame_end", 45))
    output = OUTPUT / hero / "abilities" / f"{clip}.glb"
    output.parent.mkdir(parents=True, exist_ok=True)
    # Blender's Windows exporter can reject an existing file while a browser
    # or an asset inspector still has it open.  Export to a fresh sibling and
    # only replace the published asset after the GLB has been fully written.
    temporary = output.with_name(f".{clip}.authored.tmp.glb")
    if temporary.exists():
        temporary.unlink()
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(temporary),
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        # Standalone skill assets must contain exactly the active authored
        # action. Exporting every Action also exported stale source duplicates
        # such as `super.001`; three.js then selected the first (old) clip.
        export_animation_mode="ACTIVE_ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    rename_single_glb_animation(temporary, action_name)
    try:
        os.replace(temporary, output)
    except OSError:
        # A locked published file should not leave a half-exported result.
        # Copying the complete temporary file is safe when replace is denied.
        shutil.copyfile(temporary, output)
        temporary.unlink()
    print(f"EXPORTED {hero}/{clip}: {output}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", default="*")
    parser.add_argument("--clips", nargs="+", default=["attack", "super", "gadget"])
    forwarded = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(forwarded)
    heroes = (
        [args.hero]
        if args.hero != "*"
        else sorted(
            p.name for p in SOURCE.iterdir() if p.is_dir() and p.name != "__pycache__"
        )
    )
    for hero in heroes:
        for clip in args.clips:
            if not export_scene(hero, clip):
                print(f"SKIPPED {hero}/{clip}: no authored scene/action")


if __name__ == "__main__":
    main()
