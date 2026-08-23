from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(
    filepath=os.fspath(ROOT / "frontend/assets-source/heroes/katty/katty.blend")
)
arm = bpy.data.objects["Root"]
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
for obj in bpy.context.scene.objects:
    if obj.type != "MESH" or "bottle_s" not in obj.vertex_groups:
        continue
    group = obj.vertex_groups["bottle_s"]
    verts = [
        obj.matrix_world @ obj.data.vertices[v.index].co
        for v in obj.data.vertices
        if any(g.group == group.index and g.weight > 0.1 for g in v.groups)
    ]
    if verts:
        lo = Vector((min(v[i] for v in verts) for i in range(3)))
        hi = Vector((max(v[i] for v in verts) for i in range(3)))
        print(
            obj.name,
            "count",
            len(verts),
            "bbox",
            tuple(round(x, 3) for x in lo),
            tuple(round(x, 3) for x in hi),
            "center",
            tuple(round(x, 3) for x in (lo + hi) / 2),
        )
