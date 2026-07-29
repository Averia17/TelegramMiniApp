"""Render the complete Wukong staff profile for authored-grip inspection."""

import os
import sys

import bpy
from mathutils import Vector

arguments = sys.argv[sys.argv.index("--") + 1 :]
blend_path, output_path = arguments[:2]
object_name = arguments[2] if len(arguments) > 2 else "HeroAttachment_Staff"
bpy.ops.wm.open_mainfile(filepath=blend_path)
staff = bpy.data.objects[object_name]

for obj in bpy.context.scene.objects:
    obj.hide_render = obj != staff

corners = [staff.matrix_world @ Vector(corner) for corner in staff.bound_box]
lo = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
hi = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
center = (lo + hi) * 0.5
size = hi - lo

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = 600
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
if scene.world is None:
    scene.world = bpy.data.worlds.new("StaffProfileWorld")
scene.world.color = (0.045, 0.06, 0.09)

camera_data = bpy.data.cameras.new("StaffProfileCamera")
camera = bpy.data.objects.new("StaffProfileCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = max(size.z * 1.08, size.x * 1.9, size.y * 1.9)
camera.location = center + Vector((0, -max(size.length, 1.0) * 1.5, 0))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()

scene.render.filepath = output_path
os.makedirs(os.path.dirname(output_path), exist_ok=True)
bpy.ops.render.render(write_still=True)
print("RENDERED", output_path, "BOUNDS", tuple(lo), tuple(hi))
