"""Export Mandy base rig and grip-centred weapon GLBs."""

import os
import sys

import bpy
from mathutils import Matrix

blend_path, base_path, weapon_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
weapon = bpy.data.objects["MandyStaff_Attachment"]
grip = bpy.data.objects["Grip.Primary.MandyStaff_Attachment"]

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if obj != weapon:
        obj.select_set(True)
os.makedirs(os.path.dirname(base_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=base_path,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_skins=True,
    export_yup=True,
    export_extras=True,
)

bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
mesh = weapon.data.copy()
mesh.transform(Matrix.Translation(-grip.matrix_world.translation) @ weapon.matrix_world)
bpy.data.objects.remove(weapon, do_unlink=True)
standalone = bpy.data.objects.new("MandyStaff_Attachment", mesh)
bpy.context.scene.collection.objects.link(standalone)
standalone["attachment_role"] = "held-weapon"
bpy.ops.object.select_all(action="DESELECT")
standalone.select_set(True)
bpy.context.view_layer.objects.active = standalone
os.makedirs(os.path.dirname(weapon_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=weapon_path,
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_yup=True,
    export_extras=True,
)
print("EXPORTED", base_path, weapon_path)
