"""Export Wukong body/rig and grip-centred staff as separate runtime GLBs."""

import os
import sys

import bpy
from mathutils import Matrix

blend_path, base_path, weapon_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)

staff = bpy.data.objects["HeroAttachment_Staff"]
grip = bpy.data.objects["Grip.Primary.HeroAttachment_Staff"]

# Export the complete hero hierarchy and animation actions, excluding only the
# staff geometry. Socket/pivot/grip nodes remain in the base GLB.
bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if obj != staff:
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

# Bake the staff's current world orientation into a standalone mesh whose
# origin is the authored grip. Runtime can place it at the grip node with zero
# translation and without any geometry-snapping heuristic.
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
staff_world = staff.matrix_world.copy()
grip_world = grip.matrix_world.translation.copy()
weapon_mesh = staff.data.copy()
weapon_mesh.transform(Matrix.Translation(-grip_world) @ staff_world)
bpy.data.objects.remove(staff, do_unlink=True)
weapon = bpy.data.objects.new("HeroAttachment_Staff", weapon_mesh)
bpy.context.scene.collection.objects.link(weapon)
weapon["attachment_role"] = "held-weapon"
weapon["grip_origin"] = "0,0,0"

bpy.ops.object.select_all(action="DESELECT")
weapon.select_set(True)
bpy.context.view_layer.objects.active = weapon
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
