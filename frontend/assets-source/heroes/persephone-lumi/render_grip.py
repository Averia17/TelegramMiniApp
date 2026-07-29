"""Render Persephone Lumi weapon-hand close-ups."""

import os
import sys

import bpy
from mathutils import Vector

blend_path, output_dir = sys.argv[sys.argv.index("--") + 1 :]
os.makedirs(output_dir, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=blend_path)
scene = bpy.context.scene
armature = bpy.data.objects["persephone-lumi-rig"]
staff = bpy.data.objects["HeroAttachment_WeaponHeld"]
grip = bpy.data.objects["Grip.Primary.HeroAttachment_WeaponHeld"]
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and obj != staff:
        has_right_fingers = any(
            obj.vertex_groups.get(name)
            for name in (
                "R_thumb_01_s",
                "R_index_01_s",
                "R_middle_01_s",
                "R_ring_01_s",
                "R_pinky_01_s",
            )
        )
        obj.hide_render = not has_right_fingers
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "MATERIAL"
scene.display.shading.show_shadows = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
if scene.world is None:
    scene.world = bpy.data.worlds.new("MandyGripWorld")
scene.world.color = (0.05, 0.07, 0.11)

camera_data = bpy.data.cameras.new("PersephoneGripCamera")
camera = bpy.data.objects.new("PersephoneGripCamera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.type = "ORTHO"
camera.data.ortho_scale = 0.62

target = grip.matrix_world.translation.copy()
local_size = Vector(
    tuple(
        max(corner[index] for corner in staff.bound_box)
        - min(corner[index] for corner in staff.bound_box)
        for index in range(3)
    )
)
axis_index = max(range(3), key=lambda index: local_size[index])
local_axis = Vector((axis_index == 0, axis_index == 1, axis_index == 2))
axis = (staff.matrix_world.to_3x3() @ local_axis).normalized()
wrist = armature.matrix_world @ armature.pose.bones["R_wrist_s"].head
outward = target - wrist
outward -= axis * outward.dot(axis)
if outward.length < 0.01:
    outward = Vector((0, -1, 0))
outward.normalize()
side = axis.cross(outward).normalized()

for name, direction in (
    ("palm", outward),
    ("back", -outward),
    ("axis", axis),
    ("side", side),
):
    camera.location = target + direction * 1.25
    camera.rotation_euler = (
        (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    scene.render.filepath = os.path.join(output_dir, f"persephone_grip_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)
