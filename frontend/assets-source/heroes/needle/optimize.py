import os

import bpy

PROJECT = r"C:\Users\User\PycharmProjects\TelegramMiniApp"
SOURCE_BLEND = os.path.join(
    PROJECT, "frontend", "assets-source", "heroes", "needle", "needle.blend"
)
OUTPUT_BLEND = os.environ.get("NEEDLE_OUTPUT_BLEND", SOURCE_BLEND)
OUTPUT_GLB = os.environ.get(
    "NEEDLE_OUTPUT_GLB",
    os.path.join(
        PROJECT, "frontend", "public", "assets", "heroes", "needle", "needle.glb"
    ),
)


def ratio_for(poly_count: int) -> float:
    # Keep small silhouette details intact. The dense organic body pieces benefit
    # most from simplification and are smoothed, so their reduction is unobtrusive.
    if poly_count >= 10_000:
        return 0.48
    if poly_count >= 4_000:
        return 0.58
    if poly_count >= 1_500:
        return 0.72
    return 1.0


before_polygons = sum(
    len(obj.data.polygons) for obj in bpy.data.objects if obj.type == "MESH"
)
optimized = []

for obj in list(bpy.data.objects):
    if obj.type != "MESH":
        continue

    ratio = ratio_for(len(obj.data.polygons))
    if ratio == 1.0:
        continue

    # Applying the modifier keeps the armature and vertex groups in place.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new(name="Needle_Web_Optimize", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = False
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    optimized.append((obj.name, ratio))

after_polygons = sum(
    len(obj.data.polygons) for obj in bpy.data.objects if obj.type == "MESH"
)

bpy.ops.wm.save_as_mainfile(filepath=OUTPUT_BLEND)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format="GLB",
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_yup=True,
)

print(
    f"Needle optimized: {before_polygons} -> {after_polygons} polygons "
    f"({len(optimized)} meshes), output={OUTPUT_GLB}"
)
