"""Print the authored Brock Zeus repair meshes at idle key frames."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
PATH = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / "idle.blend"
)

bpy.ops.wm.open_mainfile(filepath=os.fspath(PATH))
for name in ("armor_GEO:PIV.001", "BrockZeus_RightArm_Repair", "Cloud"):
    obj = bpy.data.objects.get(name)
    if obj is None:
        print(f"MISSING {name}")
        continue
    print(
        f"OBJECT {name}: vertices={len(obj.data.vertices) if obj.type == 'MESH' else 0} "
        f"dimensions={[round(float(value), 4) for value in obj.dimensions]} "
        f"groups={[group.name for group in obj.vertex_groups]}"
    )
    for frame in (0, 20, 40, 60, 80):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        print(
            f"  frame={frame} world={[round(float(value), 4) for value in obj.matrix_world.translation]} "
            f"dimensions={[round(float(value), 4) for value in obj.dimensions]}"
        )
