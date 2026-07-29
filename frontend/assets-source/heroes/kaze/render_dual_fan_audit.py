"""Render Kaze and the current fan object from diagnostic viewpoints."""

import os
import sys

import bpy
from mathutils import Vector

blend_path, output_dir = sys.argv[sys.argv.index("--") + 1 :]
os.makedirs(output_dir, exist_ok=True)
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
scene.display.shading.cavity_type = "WORLD"
if scene.world is None:
    scene.world = bpy.data.worlds.new("KazeAuditWorld")
scene.world.color = (0.03, 0.04, 0.06)

armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
weapons = [
    obj
    for obj in scene.objects
    if obj.type == "MESH" and obj.name.startswith("HeroAttachment_Fan")
]

camera_data = bpy.data.cameras.new("KazeAuditCamera")
camera = bpy.data.objects.new("KazeAuditCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"

all_meshes = [obj for obj in scene.objects if obj.type == "MESH"]
points = [
    obj.matrix_world @ Vector(corner) for obj in all_meshes for corner in obj.bound_box
]
lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
hero_center = (lo + hi) * 0.5

for name, target, location, scale in (
    ("front", hero_center, hero_center + Vector((0, -5, 0.15)), 2.3),
    ("back", hero_center, hero_center + Vector((0, 5, 0.15)), 2.3),
    ("left", hero_center, hero_center + Vector((5, 0, 0.15)), 2.3),
):
    camera.data.ortho_scale = scale
    camera.location = location
    camera.rotation_euler = (target - location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(output_dir, f"kaze_{name}.png")
    bpy.ops.render.render(write_still=True)

for obj in all_meshes:
    obj.hide_render = obj not in weapons
weapon_points = [
    weapon.matrix_world @ Vector(corner)
    for weapon in weapons
    for corner in weapon.bound_box
]
weapon_lo = Vector(
    tuple(min(point[axis] for point in weapon_points) for axis in range(3))
)
weapon_hi = Vector(
    tuple(max(point[axis] for point in weapon_points) for axis in range(3))
)
weapon_center = (weapon_lo + weapon_hi) * 0.5
camera.data.ortho_scale = max((weapon_hi - weapon_lo).length * 1.15, 0.5)
camera.location = weapon_center + Vector((0, -3, 0))
camera.rotation_euler = (
    (weapon_center - camera.location).to_track_quat("-Z", "Y").to_euler()
)
scene.render.filepath = os.path.join(output_dir, "kaze_weapon.png")
bpy.ops.render.render(write_still=True)
print("RENDERED", output_dir)
