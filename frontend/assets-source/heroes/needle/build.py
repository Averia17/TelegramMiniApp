import bpy
import math
import os
from mathutils import Vector

PROJECT = r"C:\Users\User\PycharmProjects\TelegramMiniApp"
GLB_PATH = os.path.join(PROJECT, "frontend", "public", "assets", "heroes", "needle", "needle.glb")
BLEND_PATH = os.path.join(PROJECT, "frontend", "assets-source", "heroes", "needle", "needle.blend")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB_PATH)

cactus = bpy.data.objects["SpawnCactus"]
cactus.scale = (0.86, 0.86, 0.86)

green = bpy.data.materials.get("SpawnCactusGreen")
ridge = bpy.data.materials.get("SpawnCactusRidge")
thorn = bpy.data.materials.get("SpawnCactusThorn")

def make_ico_mesh(name):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    obj = bpy.context.object
    mesh = obj.data
    mesh.name = name
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh

def make_cone_mesh(name):
    bpy.ops.mesh.primitive_cone_add(vertices=10, radius1=0.045, radius2=0.008, depth=0.22)
    obj = bpy.context.object
    mesh = obj.data
    mesh.name = name
    bpy.data.objects.remove(obj, do_unlink=True)
    return mesh

areole_mesh = make_ico_mesh("SpawnCactus_AreoleMesh")
needle_mesh = make_cone_mesh("SpawnCactus_MicroNeedleMesh")
crown_bud_mesh = areole_mesh.copy()
crown_bud_mesh.name = "SpawnCactus_CrownBudMesh"

def linked_detail(name, mesh, material, location, scale=(1, 1, 1), direction=None):
    obj = bpy.data.objects.new(name, mesh)
    cactus.users_collection[0].objects.link(obj)
    obj.parent = cactus
    obj.location = location
    obj.scale = scale
    if direction is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    if material:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return obj

# Dense, staggered areoles make the trunk read as a real ribbed cactus at gameplay distance.
detail_index = 0
for ring, z in enumerate((0.38, 0.65, 0.92, 1.19, 1.45)):
    for side in range(8):
        angle = side * math.tau / 8 + (ring % 2) * math.pi / 8
        normal = Vector((math.cos(angle), math.sin(angle), 0))
        radius = 0.395
        linked_detail(
            f"SpawnCactus_Areole_{detail_index:02d}",
            areole_mesh, ridge,
            normal * radius + Vector((0, 0, z)),
            (0.052, 0.052, 0.024),
            normal,
        )
        # Two fine needles form a V rather than another isolated ball.
        tangent = Vector((-normal.y, normal.x, 0))
        for branch, tilt in enumerate((-0.32, 0.32)):
            direction = (normal + tangent * tilt + Vector((0, 0, 0.20 if branch else -0.12))).normalized()
            linked_detail(
                f"SpawnCactus_MicroNeedle_{detail_index:02d}_{branch}",
                needle_mesh, thorn,
                normal * 0.445 + Vector((0, 0, z)),
                (0.72, 0.72, 0.72),
                direction,
            )
        detail_index += 1

# Extra areoles on both raised arms preserve detail in the silhouette.
for side, x, base_z in (("L", -0.58, 0.82), ("R", 0.57, 0.98)):
    outward = Vector((-1 if x < 0 else 1, 0, 0))
    for row, z in enumerate((base_z - 0.12, base_z + 0.10, base_z + 0.30)):
        for face, y in enumerate((-0.13, 0.13)):
            normal = (outward * 0.82 + Vector((0, -1 if y < 0 else 1, 0)) * 0.48).normalized()
            loc = Vector((x, y, z)) + normal * 0.09
            linked_detail(
                f"SpawnCactus_ArmAreole_{side}_{row}_{face}",
                areole_mesh, ridge, loc, (0.047, 0.047, 0.021), normal,
            )
            linked_detail(
                f"SpawnCactus_ArmNeedle_{side}_{row}_{face}",
                needle_mesh, thorn, loc + normal * 0.045, (0.62, 0.62, 0.62),
                (normal + Vector((0, 0, 0.16))).normalized(),
            )

# A small crown of new growth adds a layered transition into the flower bud.
for index in range(8):
    angle = index * math.tau / 8
    normal = Vector((math.cos(angle), math.sin(angle), 0))
    linked_detail(
        f"SpawnCactus_CrownBud_{index}",
        crown_bud_mesh, green,
        normal * 0.235 + Vector((0, 0, 1.67)),
        (0.105, 0.072, 0.15),
        normal,
    )

for obj in cactus.children_recursive:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_yup=True,
)
print("V13 exported", len(cactus.children_recursive), "cactus detail nodes", len(bpy.data.actions), "animation clips")
