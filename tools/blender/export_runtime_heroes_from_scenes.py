"""Export one canonical runtime GLB from the focused hero scenes.

This is intentionally export-only: it never saves or modifies source .blend
files and never creates animation keys.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

EXPORT_WINDOW = getattr(bpy.context, "window", None)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_heroes"
HEROES = (
    "brock-zeus",
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
BROCK_EXTRA_ACTIONS = {
    "aim-gadget": "AimGadget",
}
KAZE_EXTRA_ACTIONS = {
    "aim-gadget": "AimGadget",
}
FAIRY_MINA_EXTRA_ACTIONS = {
    "aim-gadget": "AimGadget",
}


def select_character_objects(armature, excluded_names=()):
    """Select the character only, leaving detached props out of the base GLB."""
    excluded = set(excluded_names) | {"Cloud", "Cloud_Locator"}
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.name in excluded:
            continue
        obj.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature


def export_gltf(**kwargs):
    """Run the exporter with an explicit context for Blender 5.2/MCP."""
    window = getattr(bpy.context, "window", None) or EXPORT_WINDOW
    if window is None:
        # Blender's background context has no cursor/window, but the 5.2 glTF
        # add-on still tries to update it during export.
        from io_scene_gltf2.blender.exp import export as gltf_export

        gltf_export.__notify_start = lambda *args, **inner_kwargs: None
        gltf_export.__notify_end = lambda *args, **inner_kwargs: None
    active = bpy.context.view_layer.objects.active
    selected = [obj for obj in bpy.context.scene.objects if obj.select_get()]
    override = {
        "active_object": active,
        "selected_objects": selected,
        "selected_editable_objects": selected,
    }
    if window is not None:
        override["window"] = window
    with bpy.context.temp_override(**override):
        return bpy.ops.export_scene.gltf(**kwargs)


def export_brock_cloud(hero_dir: Path, scene_actions: dict[str, str]) -> None:
    """Publish the companion mesh with all authored cloud Actions."""
    idle_scene = hero_dir / "scenes" / "idle.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(idle_scene))
    cloud = bpy.data.objects.get("Cloud")
    if cloud is None or cloud.type != "MESH":
        raise RuntimeError("brock-zeus: idle scene has no Cloud mesh")
    idle_action = cloud.animation_data.action if cloud.animation_data else None
    if idle_action is None or idle_action.name.casefold() != "cloud_idle":
        raise RuntimeError("brock-zeus: idle scene has no Cloud_idle Action")
    for clip, canonical_name in scene_actions.items():
        if clip == "idle":
            continue
        action_from_scene(
            hero_dir / "scenes" / f"{clip}.blend", f"Cloud_{canonical_name}"
        )
    cloud.animation_data_create()
    cloud.animation_data.action = None
    for track in list(cloud.animation_data.nla_tracks):
        cloud.animation_data.nla_tracks.remove(track)
    cloud_actions = [
        action for action in bpy.data.actions if action.name.startswith("Cloud_")
    ]
    for action in cloud_actions:
        track = cloud.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, 0, action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]
        strip.frame_start = 0
        strip.frame_end = max(1, action.frame_range[1] - action.frame_range[0])
    cloud.parent = None
    cloud.matrix_parent_inverse.identity()
    cloud.location = (0.0, 0.0, 0.0)
    cloud.rotation_euler = (0.0, 0.0, 0.0)
    cloud["attachment_role"] = "companion-cloud"
    bpy.ops.object.select_all(action="DESELECT")
    cloud.select_set(True)
    bpy.context.view_layer.objects.active = cloud
    output = OUTPUT / "brock-zeus_cloud.glb"
    # Blender's Windows exporter can reject a leading-dot temporary filename
    # even though the same path is valid to Python's filesystem APIs.
    temp = OUTPUT / "brock-zeus_cloud.tmp.glb"
    export_gltf(
        filepath=os.fspath(temp),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=(
            True if os.environ.get("BLENDER_EXPORT_FAST") != "1" else False
        ),
        export_skins=False,
        export_yup=True,
        export_extras=True,
        use_selection=True,
    )
    try:
        temp.replace(output)
        print(f"EXPORTED brock-zeus cloud: {output}")
    except PermissionError:
        print(f"EXPORTED brock-zeus cloud: {temp} (finalize after Blender exits)")


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
    imported.use_fake_user = True


def export(hero: str) -> None:
    hero_dir = SOURCE / hero
    scene_actions = dict(SCENE_ACTIONS)
    if hero == "needle":
        scene_actions.update(NEEDLE_EXTRA_ACTIONS)
    elif hero == "mandy":
        scene_actions.update(MANDY_EXTRA_ACTIONS)
    elif hero == "brock-zeus":
        scene_actions.update(BROCK_EXTRA_ACTIONS)
    elif hero == "kaze":
        scene_actions.update(KAZE_EXTRA_ACTIONS)
    elif hero == "fairy-mina":
        scene_actions.update(FAIRY_MINA_EXTRA_ACTIONS)
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
    if hero == "brock-zeus":
        select_character_objects(armature)
    # Persistent weapons are authored under the hero rig and belong in the
    # canonical base GLB. Only Brock's companion cloud remains a separate
    # runtime asset.
    elif hero == "kaze":
        select_character_objects(armature)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    out = OUTPUT / f"{hero}_base.glb"
    temp_out = OUTPUT / f"{hero}_base.tmp.glb"
    export_gltf(
        filepath=os.fspath(temp_out),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=(
            True if os.environ.get("BLENDER_EXPORT_FAST") != "1" else False
        ),
        export_skins=True,
        export_yup=True,
        export_extras=True,
        use_selection=hero in {"brock-zeus", "kaze"},
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
    requested_hero = os.environ.get("HERO_FILTER")
    if requested_hero:
        if requested_hero not in HEROES:
            raise RuntimeError(
                f"HERO_FILTER={requested_hero!r} is not in the runtime hero list"
            )
        if requested_hero == "brock-zeus":
            export_brock_cloud(
                SOURCE / requested_hero, SCENE_ACTIONS | BROCK_EXTRA_ACTIONS
            )
        export(requested_hero)
        return
    manifest = json.loads(
        (Path(__file__).with_name("hero_animation_scene_manifest.json")).read_text(
            encoding="utf-8"
        )
    )
    if tuple(manifest["heroes"]) != HEROES:
        raise RuntimeError("manifest hero order does not match exporter hero order")
    for hero in HEROES:
        if hero == "brock-zeus":
            export_brock_cloud(SOURCE / hero, SCENE_ACTIONS | BROCK_EXTRA_ACTIONS)
        export(hero)


if __name__ == "__main__":
    main()
