"""Render Kaze source weapon candidates without the character."""

import os
import sys

import bpy
from mathutils import Vector

fbx_path, output_dir = sys.argv[sys.argv.index("--") + 1 :]
os.makedirs(output_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path, use_anim=False)

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 700
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.display.shading.light = "STUDIO"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True

camera_data = bpy.data.cameras.new("Camera")
camera = bpy.data.objects.new("Camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
for selected_name in ("menu_GEO", "blades01_GEO", "blades02_GEO"):
    selected = bpy.data.objects.get(selected_name)
    for obj in meshes:
        obj.hide_render = obj != selected
    points = [selected.matrix_world @ Vector(corner) for corner in selected.bound_box]
    lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (lo + hi) * 0.5
    size = hi - lo
    camera.data.ortho_scale = max(size.x, size.z) * 1.2
    camera.location = center + Vector((0, -max(size.length, 3), 0))
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    scene.render.filepath = os.path.join(output_dir, f"{selected_name}.png")
    bpy.ops.render.render(write_still=True)
print("RENDERED", output_dir)
