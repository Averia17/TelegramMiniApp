"""Print weapon bounds and hand locations from an opened hero .blend."""

import bpy
from mathutils import Vector

armature = next(
    (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
)
print("GRIP_AUDIT", bpy.data.filepath)
if armature:
    for bone in armature.pose.bones:
        if "wrist" in bone.name.casefold() or "hand" in bone.name.casefold():
            location = armature.matrix_world @ bone.matrix.translation
            print("HAND", bone.name, tuple(round(value, 4) for value in location))

for obj in bpy.context.scene.objects:
    role = obj.get("attachment_role")
    if not role and not any(
        token in obj.name.casefold()
        for token in ("staff", "fan", "weapon", "microphone", "speaker")
    ):
        continue
    if obj.type == "MESH":
        local = [Vector(corner) for corner in obj.bound_box]
        world = [obj.matrix_world @ corner for corner in local]
        local_min = Vector(tuple(min(point[i] for point in local) for i in range(3)))
        local_max = Vector(tuple(max(point[i] for point in local) for i in range(3)))
        world_min = Vector(tuple(min(point[i] for point in world) for i in range(3)))
        world_max = Vector(tuple(max(point[i] for point in world) for i in range(3)))
        print(
            "WEAPON",
            obj.name,
            role or "-",
            "local",
            tuple(round(value, 4) for value in local_min),
            tuple(round(value, 4) for value in local_max),
            "world",
            tuple(round(value, 4) for value in world_min),
            tuple(round(value, 4) for value in world_max),
        )
