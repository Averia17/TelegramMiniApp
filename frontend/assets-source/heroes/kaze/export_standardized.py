"""Export Kaze's animated base and two independently grip-centred fans."""

import os
import sys

import bpy
from mathutils import Matrix

blend_path, base_path, weapon_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)

fan_names = ("HeroAttachment_FanLeft", "HeroAttachment_FanRight")
fans = [bpy.data.objects[name] for name in fan_names]
grips = [bpy.data.objects[f"Grip.Primary.{name}"] for name in fan_names]

bpy.ops.object.select_all(action="DESELECT")
for obj in bpy.context.scene.objects:
    if obj not in fans:
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
standalone = []
for fan, grip in zip(fans, grips):
    mesh = fan.data.copy()
    mesh.transform(
        Matrix.Translation(-grip.matrix_world.translation) @ fan.matrix_world
    )
    item = bpy.data.objects.new(fan.name, mesh)
    bpy.context.scene.collection.objects.link(item)
    item["attachment_role"] = "held-weapon"
    standalone.append(item)
for fan in fans:
    bpy.data.objects.remove(fan, do_unlink=True)

bpy.ops.object.select_all(action="DESELECT")
for item in standalone:
    item.select_set(True)
bpy.context.view_layer.objects.active = standalone[0]
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
