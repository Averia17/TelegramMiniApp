"""Render Mandy from a fixed world-space front camera."""

import os
import sys

import bpy
from mathutils import Vector

blend_path, output_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 700
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.display.shading.light = "STUDIO"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
if scene.world is None:
    scene.world = bpy.data.worlds.new("MandyFullWorld")
scene.world.color = (0.04, 0.05, 0.08)

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
points = [
    obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box
]
lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
center = (lo + hi) * 0.5

camera_data = bpy.data.cameras.new("MandyFullCamera")
camera = bpy.data.objects.new("MandyFullCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(hi.x - lo.x, hi.z - lo.z) * 1.12
camera.location = center + Vector((0, -6, 0))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = output_path
os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("RENDERED", output_path)
