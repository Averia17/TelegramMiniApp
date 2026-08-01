"""Render candidate symmetric arm poses for Kaze's dual-fan silhouette."""

import math
import os
import sys

import bpy
from mathutils import Euler, Vector

blend_path, output_dir = sys.argv[sys.argv.index("--") + 1 :]
os.makedirs(output_dir, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend_path)
scene = bpy.context.scene
scene.frame_set(1)
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 600
scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.display.shading.light = "STUDIO"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
if scene.world is None:
    scene.world = bpy.data.worlds.new("KazePoseWorld")
scene.world.color = (0.03, 0.04, 0.06)

armature = bpy.data.objects["kaze-rig"]
armature.animation_data.action = None
names = {
    "la": "L_shoulder_s",
    "lf": "L_elbow_s",
    "lw": "L_wrist_s",
    "ra": "R_shoulder_s",
    "rf": "R_elbow_s",
    "rw": "R_wrist_s",
}
variants = {
    "zero": {key: (0, 0, 0) for key in names},
    "guard_low": {
        "la": (-25, 10, -35),
        "lf": (-35, 0, 0),
        "lw": (0, 0, 0),
        "ra": (-25, -10, 35),
        "rf": (-35, 0, 0),
        "rw": (0, 0, 0),
    },
    "guard_wide": {
        "la": (-55, 5, -40),
        "lf": (-20, 0, 0),
        "lw": (0, 0, 0),
        "ra": (-55, -5, 40),
        "rf": (-20, 0, 0),
        "rw": (0, 0, 0),
    },
    "fans_up": {
        "la": (-75, 15, -55),
        "lf": (-45, 0, 0),
        "lw": (20, -15, -20),
        "ra": (-75, -15, 55),
        "rf": (-45, 0, 0),
        "rw": (20, 15, 20),
    },
}

camera_data = bpy.data.cameras.new("KazePoseCamera")
camera = bpy.data.objects.new("KazePoseCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 2.35
target = Vector((0, 0, 0.8))
camera.location = target + Vector((0, -5, 0))
camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()

for label, pose in variants.items():
    for key, degrees in pose.items():
        bone = armature.pose.bones[names[key]]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = Euler(
            tuple(math.radians(value) for value in degrees), "XYZ"
        )
    bpy.context.view_layer.update()
    scene.render.filepath = os.path.join(output_dir, f"kaze_{label}.png")
    bpy.ops.render.render(write_still=True)
print("RENDERED", output_dir)
