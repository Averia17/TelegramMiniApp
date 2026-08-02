"""Render Mandy's actual single-GLB runtime path for QA.

Mandy's staff is embedded in ``mandy_base.glb`` and follows the authored left
wrist. This intentionally does not load ``mandy_weapon.glb`` a second time.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
BASE = (
    ROOT
    / "frontend"
    / "public"
    / "assets"
    / "heroes"
    / "output_heroes"
    / "mandy_base.glb"
)


def args():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) == 2:
        return "idle", int(values[0]), Path(values[1])
    if len(values) == 3:
        return values[0], int(values[1]), Path(values[2])
    raise SystemExit("expected frame output.png or clip frame output.png")


def bounds():
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("no visible runtime meshes")
    low = Vector(
        (min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))
    )
    high = Vector(
        (max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))
    )
    return low, high


def main():
    clip, frame, output = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.fspath(BASE))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError("runtime base has no armature")
    armature.animation_data_create()
    action_names = {
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
        "aim-gadget": "AimGadget",
    }
    action_name = action_names.get(clip, clip)
    action = bpy.data.actions.get(action_name)
    if action is None:
        raise RuntimeError(f"runtime base has no {action_name} action")
    armature.animation_data.action = action
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    embedded = bpy.data.objects.get("MandyStaff_Attachment")
    marker = bpy.data.objects.get("Grip.Primary.MandyStaff_Attachment")
    if embedded is None or marker is None:
        raise RuntimeError(
            "runtime base must contain Mandy's embedded staff and grip marker"
        )

    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            obj.animation_data_create()
    scene = bpy.context.scene
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.color_type = "MATERIAL"
    material = bpy.data.materials.get(
        "MandyRuntimePreviewStaff"
    ) or bpy.data.materials.new("MandyRuntimePreviewStaff")
    material.diffuse_color = (0.85, 0.05, 0.04, 1.0)
    for child in (embedded, *embedded.children_recursive):
        if child.type == "MESH":
            child.data.materials.clear()
            child.data.materials.append(material)
    scene.world = bpy.data.worlds.new("MandyRuntimePreviewWorld")
    scene.world.color = (0.035, 0.045, 0.07)

    low, high = bounds()
    center = (low + high) * 0.5
    radius = max((high - low).length * 0.5, 1.0)
    floor_mesh = bpy.data.meshes.new("MandyRuntimePreviewFloorMesh")
    floor_obj = bpy.data.objects.new("MandyRuntimePreviewFloor", floor_mesh)
    bpy.context.collection.objects.link(floor_obj)
    z = low.z - 0.02
    floor_mesh.from_pydata(
        [
            (-radius * 2, -radius * 2, z),
            (radius * 2, -radius * 2, z),
            (radius * 2, radius * 2, z),
            (-radius * 2, radius * 2, z),
        ],
        [],
        [(0, 1, 2, 3)],
    )
    camera_data = bpy.data.cameras.new("MandyRuntimePreviewCamera")
    camera = bpy.data.objects.new("MandyRuntimePreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((radius * 1.65, -radius * 2.35, radius * 0.72))
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    camera.data.lens = 58
    scene.camera = camera
    scene.render.filepath = os.fspath(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"rendered:{output}")


if __name__ == "__main__":
    main()
