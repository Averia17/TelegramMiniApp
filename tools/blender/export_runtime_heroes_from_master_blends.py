"""Export runtime hero GLBs from one canonical master .blend per hero.

This module is export-only. It never creates keys and never saves a source
master; all authoring happens in the master file or the migration/authoring
scripts.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import ALL_HEROES, SOURCE, actions_for, master_path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_heroes"
BLENDER_EXPORT_FAST = os.environ.get("BLENDER_EXPORT_FAST") == "1"
EXPORT_WINDOW = getattr(bpy.context, "window", None)


def resolve_master_path(hero: str) -> Path:
    """Resolve the configured master, retaining the canonical filename fallback."""
    configured = master_path(hero)
    if configured.exists():
        return configured
    return SOURCE / hero / f"{hero}.blend"


def export_gltf(**kwargs):
    """Run glTF export with an explicit Blender context."""
    window = getattr(bpy.context, "window", None) or EXPORT_WINDOW
    if window is None:
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


def atomic_export(path: Path, *, use_selection: bool, **options) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f"{path.stem}.tmp{path.suffix}")
    export_gltf(
        filepath=os.fspath(temp),
        export_format="GLB",
        export_animations=True,
        export_force_sampling=not BLENDER_EXPORT_FAST,
        export_yup=True,
        export_extras=True,
        use_selection=use_selection,
        **options,
    )
    try:
        temp.replace(path)
        print(f"EXPORTED {path}")
    except PermissionError:
        print(f"EXPORTED {temp} (finalize after Blender exits)")


def find_armature():
    return next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )


def require_body_actions(hero: str) -> None:
    available = {action.name.casefold() for action in bpy.data.actions}
    missing = [
        action_name
        for action_name in actions_for(hero).values()
        if action_name.casefold() not in available
    ]
    if missing:
        raise RuntimeError(f"{hero}: master is missing Actions {missing}")
    if find_armature() is None:
        raise RuntimeError(f"{hero}: master has no armature")


def is_cloud_object(obj) -> bool:
    current = obj
    while current:
        if "cloud" in current.name.casefold():
            return True
        current = current.parent
    return False


def select_body_for_brock() -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        if obj.type in {"CAMERA", "LIGHT"} or is_cloud_object(obj):
            continue
        obj.select_set(True)
    armature = find_armature()
    if armature is None:
        raise RuntimeError("brock-zeus: no armature while selecting body")
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature


def append_nla_track(obj, action, frame_offset: int = 0) -> None:
    obj.animation_data_create()
    track = obj.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, frame_offset, action)
    strip.action_frame_start = action.frame_range[0]
    strip.action_frame_end = action.frame_range[1]
    strip.frame_start = frame_offset
    strip.frame_end = frame_offset + max(
        1, int(round(action.frame_range[1] - action.frame_range[0]))
    )


def configure_cloud_nla() -> tuple[object, object]:
    cloud = bpy.data.objects.get("Cloud")
    if cloud is None or cloud.type != "MESH":
        raise RuntimeError("brock-zeus: master has no Cloud mesh")
    cloud_root = (
        cloud.parent
        if cloud.parent and "cloud" in cloud.parent.name.casefold()
        else None
    )
    if cloud_root is None:
        cloud_root = bpy.data.objects.get("Cloud_Root")
    if cloud_root is None:
        raise RuntimeError("brock-zeus: master has no Cloud_Root")

    cloud.animation_data_clear()
    cloud_root.animation_data_clear()
    cloud_actions = sorted(
        (action for action in bpy.data.actions if action.name.startswith("Cloud_")),
        key=lambda action: action.name.casefold(),
    )
    root_action = next(
        (action for action in cloud_actions if action.name == "Cloud_root_idle"), None
    )
    if root_action is None:
        raise RuntimeError("brock-zeus: master has no Cloud_root_idle Action")
    append_nla_track(cloud_root, root_action)
    for action in cloud_actions:
        if action == root_action:
            continue
        append_nla_track(cloud, action)

    bpy.ops.object.select_all(action="DESELECT")
    cloud_root.select_set(True)
    cloud.select_set(True)
    bpy.context.view_layer.objects.active = cloud_root
    return cloud_root, cloud


def export_brock(hero_dir: Path) -> None:
    master = resolve_master_path("brock-zeus")
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    require_body_actions("brock-zeus")
    select_body_for_brock()
    atomic_export(
        OUTPUT / "brock-zeus-rebuild-v11_base.glb",
        use_selection=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
    )

    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    configure_cloud_nla()
    atomic_export(
        OUTPUT / "brock-zeus-rebuild-v11_cloud.glb",
        use_selection=True,
        export_animation_mode="NLA_TRACKS",
        export_skins=False,
    )


def export_hero(hero: str) -> None:
    hero_dir = SOURCE / hero
    master = resolve_master_path(hero)
    if not master.exists():
        raise RuntimeError(f"{hero}: missing master source {master}")
    if hero == "brock-zeus":
        export_brock(hero_dir)
        return
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    require_body_actions(hero)
    armature = find_armature()
    armature.animation_data_create()
    idle = next(
        action for action in bpy.data.actions if action.name.casefold() == "idle"
    )
    armature.animation_data.action = idle
    atomic_export(
        OUTPUT / f"{hero}_base.glb",
        use_selection=False,
        export_animation_mode="ACTIONS",
        export_skins=True,
    )


def main() -> None:
    requested = os.environ.get("HERO_FILTER")
    heroes = (requested,) if requested else ALL_HEROES
    if requested and requested not in ALL_HEROES:
        raise RuntimeError(f"HERO_FILTER={requested!r} is not a canonical hero")
    for hero in heroes:
        export_hero(hero)


if __name__ == "__main__":
    main()
