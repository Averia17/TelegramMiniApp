"""Render Damian's full pose and close-ups of both equipment grips."""

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
if scene.world is None:
    scene.world = bpy.data.worlds.new("DamianAuditWorld")
scene.world.color = (0.03, 0.04, 0.06)

armature = bpy.data.objects["damian-rig"]
camera_data = bpy.data.cameras.new("DamianAuditCamera")
camera = bpy.data.objects.new("DamianAuditCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"

meshes = [obj for obj in scene.objects if obj.type == "MESH"]
points = [
    obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box
]
lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
center = (lo + hi) * 0.5
camera.data.ortho_scale = 2.8
camera.location = center + Vector((0, -5, 0.1))
camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = os.path.join(output_dir, "damian_front.png")
bpy.ops.render.render(write_still=True)

for side, label in (("L", "microphone"), ("R", "speaker")):
    finger_names = [
        f"{side}_{finger}_01_s"
        for finger in ("thumb", "index", "middle", "ring", "pinky")
    ]
    finger_points = [
        armature.matrix_world @ armature.pose.bones[name].head
        for name in finger_names
        if armature.pose.bones.get(name)
    ]
    target = sum(finger_points, Vector()) / len(finger_points)
    camera.data.ortho_scale = 0.75 if side == "L" else 1.25
    for view, direction in (("palm", Vector((0, -1, 0))), ("side", Vector((1, 0, 0)))):
        camera.location = target + direction * 2
        camera.rotation_euler = (
            (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        )
        scene.render.filepath = os.path.join(output_dir, f"damian_{label}_{view}.png")
        bpy.ops.render.render(write_still=True)
print("RENDERED", output_dir)
