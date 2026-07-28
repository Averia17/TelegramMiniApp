"""Export one authored Blender Action per .blend/.glb event asset.

Usage:
  blender <hero>.blend --background --python export_event_animations.py -- Attack Spawn
"""

import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from strip_event_glb import strip_event_glb


def command_line_events():
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    return arguments or ["Attack", "Spawn"]


def find_action(name):
    expected = name.casefold()
    return next(
        (action for action in bpy.data.actions if action.name.casefold() == expected),
        None,
    )


def scene_roots():
    return [obj for obj in bpy.context.scene.objects if obj.parent is None]


def select_scene():
    bpy.ops.object.select_all(action="DESELECT")
    roots = scene_roots()
    for root in roots:
        root.select_set(True)
        for child in root.children_recursive:
            child.select_set(True)
    if roots:
        bpy.context.view_layer.objects.active = roots[0]


def keep_only_action(event_name):
    action = find_action(event_name)
    if action is None:
        available = ", ".join(sorted(item.name for item in bpy.data.actions))
        raise RuntimeError(f"Missing Action {event_name!r}; available: {available}")

    for obj in bpy.context.scene.objects:
        if obj.type != "ARMATURE":
            continue
        obj.animation_data_create()
        obj.animation_data.action = action

    for other in list(bpy.data.actions):
        if other != action:
            bpy.data.actions.remove(other, do_unlink=True)

    action.name = event_name
    action.use_fake_user = True
    bpy.context.scene.frame_start = max(0, int(action.frame_range[0]))
    bpy.context.scene.frame_end = max(
        bpy.context.scene.frame_start + 1, int(action.frame_range[1])
    )
    return action


def export_event(source_blend, event_name):
    bpy.ops.wm.open_mainfile(filepath=source_blend)
    action = keep_only_action(event_name)

    hero_directory = os.path.dirname(source_blend)
    public_directory = os.path.normpath(
        os.path.join(
            hero_directory,
            "..",
            "..",
            "..",
            "public",
            "assets",
            "heroes",
            os.path.basename(hero_directory),
            "animations",
        )
    )
    source_output = os.path.join(hero_directory, "animations")
    os.makedirs(source_output, exist_ok=True)
    os.makedirs(public_directory, exist_ok=True)

    slug = {
        "AimSuper": "aim-super",
    }.get(event_name, event_name.casefold())
    blend_output = os.path.join(source_output, f"{slug}.blend")
    glb_output = os.path.join(public_directory, f"{slug}.glb")

    bpy.ops.wm.save_as_mainfile(filepath=blend_output, copy=True)
    select_scene()
    bpy.ops.export_scene.gltf(
        filepath=glb_output,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_morph=True,
        export_yup=True,
        export_apply=False,
        export_extras=True,
    )
    before, after = strip_event_glb(Path(glb_output))
    print(
        "EVENT_ANIMATION_EXPORTED",
        event_name,
        f"frames={action.frame_range[0]:.0f}-{action.frame_range[1]:.0f}",
        f"bytes={before}->{after}",
        blend_output,
        glb_output,
    )


source = bpy.data.filepath
if not source:
    raise RuntimeError("Open a hero .blend before running this exporter")

for event in command_line_events():
    export_event(source, event)
