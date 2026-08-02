"""Render every frame of every Mandy focused clip for visual QA.

Usage:
  blender --background --python tools/blender/render_mandy_full_visual_qa.py -- output-dir

The output is deliberately a frame sequence: a contact sheet or video made
from this sequence cannot hide a bad in-between frame behind a single hero
pose.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "scenes"
DURATIONS = {
    "idle": 90, "run": 20, "attack": 16, "super": 50, "aim": 60,
    "aim-super": 60, "hit": 12, "death": 40, "spawn": 45, "victory": 60,
    "gadget": 16, "aim-gadget": 60,
}


def args():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 1:
        raise SystemExit("expected output-dir")
    return Path(values[0])


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 320
    scene.render.resolution_y = 320
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
    if staff and staff.type == "MESH":
        material = bpy.data.materials.get("MandyFullQAStaff") or bpy.data.materials.new("MandyFullQAStaff")
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
        raise RuntimeError("no visible meshes")
    low = Vector((min(point.x for point in points), min(point.y for point in points), min(point.z for point in points)))
    high = Vector((max(point.x for point in points), max(point.y for point in points), max(point.z for point in points)))
    center = (low + high) * 0.5
    radius = max((high - low).length * 0.5, 1.0)
    floor_mesh = bpy.data.meshes.new("MandyFullQAFloorMesh")
    floor = bpy.data.objects.new("MandyFullQAFloor", floor_mesh)
    bpy.context.collection.objects.link(floor)
    z = low.z - 0.02
    floor_mesh.from_pydata(
        [(-radius * 2, -radius * 2, z), (radius * 2, -radius * 2, z),
         (radius * 2, radius * 2, z), (-radius * 2, radius * 2, z)], [], [(0, 1, 2, 3)]
    )
    camera_data = bpy.data.cameras.new("MandyFullQACamera")
    camera = bpy.data.objects.new("MandyFullQACamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((radius * 1.65, -radius * 2.35, radius * 0.72))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    scene.camera = camera
    return scene


def main():
    output_dir = args()
    output_dir.mkdir(parents=True, exist_ok=True)
    for clip, duration in DURATIONS.items():
        bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENES / f"{clip}.blend"))
        scene = setup_scene()
        clip_dir = output_dir / clip
        clip_dir.mkdir(parents=True, exist_ok=True)
        for frame in range(1, duration + 2):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            scene.render.filepath = os.fspath(clip_dir / f"frame-{frame:03d}.png")
            bpy.ops.render.render(write_still=True)
        print(f"rendered:{clip}:{duration + 1}")


if __name__ == "__main__":
    main()
