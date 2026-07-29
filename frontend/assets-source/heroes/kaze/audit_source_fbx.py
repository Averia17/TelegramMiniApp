"""Inspect the original Kaze FBX before the generic builder removes objects."""

import json
import os
import sys

import bpy
from mathutils import Vector

fbx_path, output_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx_path, use_anim=False)

payload = []
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    payload.append(
        {
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "center": list((lo + hi) * 0.5),
            "size": list(hi - lo),
            "materials": [
                slot.material.name if slot.material else None
                for slot in obj.material_slots
            ],
        }
    )

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
print(json.dumps(payload, ensure_ascii=False))
