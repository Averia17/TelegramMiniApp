"""Render close-up grip evidence for Wukong in several animation poses."""

import math
import os
import sys

import bpy
from mathutils import Vector

blend_path = sys.argv[sys.argv.index("--") + 1]
output_dir = sys.argv[sys.argv.index("--") + 2]
os.makedirs(output_dir, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend_path)

scene = bpy.context.scene
armature = bpy.data.objects["wukong-mico-rig"]
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.studio_light = "paint.sl"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.display.shading.cavity_type = "WORLD"
scene.display.shading.show_specular_highlight = True
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
if scene.world is None:
    scene.world = bpy.data.worlds.new("GripProofWorld")
scene.world.color = (0.055, 0.075, 0.12)

camera_data = bpy.data.cameras.new("GripProofCamera")
camera = bpy.data.objects.new("GripProofCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 0.85


def point_camera(target, offset):
    camera.location = target + Vector(offset)
    camera.rotation_euler = (
        (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    )


def palm_center():
    names = (
        "L_wrist_s",
        "L_thumb_01_s",
        "L_index_01_s",
        "L_middle_01_s",
        "L_ring_01_s",
        "L_pinky_01_s",
    )
    points = [armature.matrix_world @ armature.pose.bones[name].head for name in names]
    return sum(points, Vector()) / len(points)


preserve_pose = os.environ.get("PRESERVE_GRIP_POSE") == "1"
poses = (
    (("SolvedGrip", scene.frame_current),)
    if preserve_pose
    else (
        ("Idle", 1),
        ("Attack", 12),
        ("Super", 20),
    )
)
for action_name, frame in poses:
    if not preserve_pose:
        armature.animation_data.action = bpy.data.actions[action_name]
        scene.frame_set(frame)
    bpy.context.view_layer.update()
    target = palm_center()
    chest = armature.matrix_world @ armature.pose.bones["spine_upper_s"].head
    outward = target - chest
    outward.z = 0.0
    if outward.length < 0.01:
        outward = Vector((0.0, -1.0, 0.0))
    outward.normalize()
    side = Vector((-outward.y, outward.x, 0.0))
    for view_name, offset in (
        ("outside", outward * 1.5 + Vector((0.0, 0.0, 0.08))),
        ("inside", -outward * 1.5 + Vector((0.0, 0.0, 0.08))),
        ("side", side * 1.5 + Vector((0.0, 0.0, 0.08))),
    ):
        point_camera(target, offset)
        scene.render.filepath = os.path.join(
            output_dir, f"wukong_{action_name.casefold()}_{view_name}.png"
        )
        bpy.ops.render.render(write_still=True)
        print("RENDERED", scene.render.filepath)
