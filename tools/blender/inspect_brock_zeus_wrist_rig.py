"""Inspect Brock Zeus wrist source meshes, parenting, and skin weights."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/scenes/zeus_rebuild_master.blend"
REPORT = ROOT / "output/blender/brock-zeus-wrist-rig-report.json"


def vec(value):
    return [round(float(v), 6) for v in value]


def bone_data(armature, name):
    bone = armature.data.bones.get(name)
    pose = armature.pose.bones.get(name)
    if bone is None or pose is None:
        return None
    return {
        "parent": bone.parent.name if bone.parent else None,
        "head_local": vec(bone.head_local),
        "tail_local": vec(bone.tail_local),
        "use_connect": bool(bone.use_connect),
        "pose_matrix_translation": vec(pose.matrix.translation),
        "pose_location": vec(pose.location),
        "pose_rotation": vec(pose.rotation_euler),
    }


def mesh_data(obj):
    bounds = [list(obj.bound_box[0]), list(obj.bound_box[0])]
    for corner in obj.bound_box[1:]:
        for axis in range(3):
            bounds[0][axis] = min(bounds[0][axis], corner[axis])
            bounds[1][axis] = max(bounds[1][axis], corner[axis])
    groups = {}
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            name = obj.vertex_groups[group.group].name
            groups.setdefault(name, []).append(float(group.weight))
    return {
        "parent": obj.parent.name if obj.parent else None,
        "parent_type": obj.parent_type,
        "parent_bone": obj.parent_bone,
        "matrix_world_translation": vec(obj.matrix_world.translation),
        "local_bounds": [vec(bounds[0]), vec(bounds[1])],
        "vertex_count": len(obj.data.vertices),
        "modifiers": [
            {
                "name": modifier.name,
                "type": modifier.type,
                "object": modifier.object.name if getattr(modifier, "object", None) else None,
            }
            for modifier in obj.modifiers
        ],
        "vertex_groups": {
            name: {
                "count": len(weights),
                "min": round(min(weights), 6),
                "max": round(max(weights), 6),
            }
            for name, weights in sorted(groups.items())
        },
        "sample_vertices": {
            str(index): vec(obj.data.vertices[index].co)
            for index in (7, 24, 58, 76, 120, 131, 142, 371, 505)
            if index < len(obj.data.vertices)
        },
    }


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = bpy.data.objects["BrockZeus_Rig"]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    names = [
        "ZeusPart_R_Shoulder",
        "ZeusPart_R_Elbow",
        "ZeusPart_R_Hand",
        "ZeusPart_L_Shoulder",
        "ZeusPart_L_Elbow",
        "ZeusPart_L_Hand",
    ]
    report = {
        "master": os.fspath(MASTER),
        "bones": {name: bone_data(armature, name) for name in ("R_Shoulder", "R_Elbow", "R_Hand", "L_Shoulder", "L_Elbow", "L_Hand")},
        "meshes": {name: mesh_data(bpy.data.objects[name]) for name in names if bpy.data.objects.get(name)},
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
