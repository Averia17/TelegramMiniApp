"""Render one Mandy focused-scene frame for visual QA.

Usage:
  blender --background --python tools/blender/render_mandy_preview.py -- \
    frontend/assets-source/heroes/mandy/scenes/idle.blend 1 output.png
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def args():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 3:
        raise SystemExit("expected scene.blend frame output.png")
    return Path(values[0]), int(values[1]), Path(values[2])


def main():
    scene_path, frame, output = args()
    bpy.ops.wm.open_mainfile(filepath=os.fspath(scene_path))
    scene = bpy.context.scene
    scene.frame_set(frame)
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
    scene.display.shading.curvature_ridge_factor = 1.5
    scene.display.shading.curvature_valley_factor = 1.5
    scene.display.shading.color_type = "MATERIAL"
    staff = bpy.data.objects.get("MandyStaff_Attachment")
    if (
        staff
        and staff.type == "MESH"
        and os.environ.get("MANDY_PREVIEW_STAFF_RED", "1") != "0"
    ):
        material = bpy.data.materials.get(
            "MandyPreviewStaff"
        ) or bpy.data.materials.new("MandyPreviewStaff")
        material.diffuse_color = (0.85, 0.05, 0.04, 1.0)
        staff.data.materials.clear()
        staff.data.materials.append(material)
    scene.world.color = (0.035, 0.045, 0.07)

    points = []
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("no visible mesh objects")
    low = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    high = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    center = (low + high) * 0.5
    radius = max((high - low).length * 0.5, 1.0)
    floor = bpy.data.meshes.new("MandyPreviewFloorMesh")
    floor_obj = bpy.data.objects.new("MandyPreviewFloor", floor)
    bpy.context.collection.objects.link(floor_obj)
    floor.from_pydata(
        [
            (-radius * 2, -radius * 2, low.z - 0.02),
            (radius * 2, -radius * 2, low.z - 0.02),
            (radius * 2, radius * 2, low.z - 0.02),
            (-radius * 2, radius * 2, low.z - 0.02),
        ],
        [],
        [(0, 1, 2, 3)],
    )
    camera_data = bpy.data.cameras.new("MandyPreviewCamera")
    camera = bpy.data.objects.new("MandyPreviewCamera", camera_data)
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
