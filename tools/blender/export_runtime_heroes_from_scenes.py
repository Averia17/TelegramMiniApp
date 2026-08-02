"""Export one canonical runtime GLB from the focused hero scenes.

This is intentionally export-only: it never saves or modifies source .blend
files and never creates animation keys.
"""

from __future__ import annotations

import json
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
SCENE_ACTIONS = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
    "gadget": "Gadget",
}
NEEDLE_EXTRA_ACTIONS = {
    "aim-gadget": "AimGadget",
}
MANDY_EXTRA_ACTIONS = {
    "aim-gadget": "AimGadget",
}


def action_from_scene(path: Path, canonical_name: str) -> None:
    with bpy.data.libraries.load(os.fspath(path), link=False) as (source, target):
        candidate = next(
            (
                name
                for name in source.actions
                if name.casefold() == canonical_name.casefold()
                or name.casefold().split(".")[0] == canonical_name.casefold()
            ),
            None,
        )
        target.actions = [candidate] if candidate else []
    imported = next((action for action in target.actions if action is not None), None)
    if imported is None:
        raise RuntimeError(f"{path}: no authored Action matching {canonical_name!r}")
    for action in list(bpy.data.actions):
        if action != imported and action.name.casefold() == canonical_name.casefold():
            bpy.data.actions.remove(action)
    imported.name = canonical_name


def export(hero: str) -> None:
    hero_dir = SOURCE / hero
    scene_actions = dict(SCENE_ACTIONS)
    if hero == "needle":
        scene_actions.update(NEEDLE_EXTRA_ACTIONS)
    elif hero == "mandy":
        scene_actions.update(MANDY_EXTRA_ACTIONS)
    focused_scenes = {
        clip: hero_dir / "scenes" / f"{clip}.blend" for clip in scene_actions
    }
    missing = [path for path in focused_scenes.values() if not path.exists()]
    if missing:
        raise RuntimeError(f"{hero}: missing focused scene(s): {missing}")

    # The idle focused scene is the complete geometry/rig source. All other
    # runtime Actions are imported from their matching focused scenes; the
    # legacy master sources are never consulted.
    bpy.ops.wm.open_mainfile(filepath=os.fspath(focused_scenes["idle"]))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError(f"{hero}: no armature in focused idle scene")

    # Keep the active idle Action from the base scene, but discard every other
    # incidental Action before importing the remaining scene-owned Actions.
    idle_action = armature.animation_data.action if armature.animation_data else None
    if idle_action is None or idle_action.name.casefold() != "idle":
        raise RuntimeError(f"{hero}: focused idle scene has no canonical idle Action")
    for action in list(bpy.data.actions):
        if action != idle_action:
            bpy.data.actions.remove(action)

    for clip, canonical_name in scene_actions.items():
        if clip == "idle":
            continue
        action_from_scene(focused_scenes[clip], canonical_name)

    armature.animation_data_create()
    armature.animation_data.action = idle_action
    OUTPUT.mkdir(parents=True, exist_ok=True)
    out = OUTPUT / f"{hero}_base.glb"
    temp_out = OUTPUT / f".{hero}_base.tmp.glb"
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(temp_out),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    try:
        temp_out.replace(out)
        print(f"EXPORTED {hero}: {out}")
    except PermissionError:
        # A running dev server/antivirus can hold the previous canonical file
        # open on Windows. Leave the verified temp beside it; the caller can
        # finalize the atomic swap after Blender exits.
        print(f"EXPORTED {hero}: {temp_out} (finalize after Blender exits)")


def main() -> None:
    manifest = json.loads(
        (Path(__file__).with_name("hero_animation_scene_manifest.json")).read_text(
            encoding="utf-8"
        )
    )
    if tuple(manifest["heroes"]) != HEROES:
        raise RuntimeError("manifest hero order does not match exporter hero order")
    requested_hero = os.environ.get("HERO_FILTER")
    heroes = [hero for hero in HEROES if not requested_hero or hero == requested_hero]
    if requested_hero and not heroes:
        raise RuntimeError(
            f"HERO_FILTER={requested_hero!r} is not in the runtime hero list"
        )
    for hero in heroes:
        export(hero)


if __name__ == "__main__":
    main()
