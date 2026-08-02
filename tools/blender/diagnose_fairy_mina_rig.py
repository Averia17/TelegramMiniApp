"""Stage-0 audit for Fairy Mina animation authoring.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/diagnose_fairy_mina_rig.py

The prose brief uses a generic Root/Hips/Spine naming scheme.  This report is
the authority for Fairy Mina's real armature, local axes, root candidates,
current pose, and mesh binding before any new Action is authored.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REPORT = ROOT / "artifacts" / "fairy-mina-rig-axis-diagnostic.json"


def vector_tuple(vector):
    return [round(float(value), 6) for value in vector]


def matrix_tuple(matrix):
    return [[round(float(value), 6) for value in row] for row in matrix]


def axis_mapping(armature, bone):
    basis = bone.matrix_local.to_3x3()
    world = armature.matrix_world.to_3x3() @ basis
    return {
        "local_x_to_world": vector_tuple(world @ Vector((1, 0, 0))),
        "local_y_to_world": vector_tuple(world @ Vector((0, 1, 0))),
        "local_z_to_world": vector_tuple(world @ Vector((0, 0, 1))),
    }


def pose_snapshot(armature):
    result = {}
    for bone in armature.pose.bones:
        result[bone.name] = {
            "rotation_mode": bone.rotation_mode,
            "location": vector_tuple(bone.location),
            "rotation_euler": vector_tuple(bone.rotation_euler),
            "rotation_quaternion": vector_tuple(bone.rotation_quaternion),
            "scale": vector_tuple(bone.scale),
            "matrix": matrix_tuple(bone.matrix),
        }
    return result


def mesh_binding(scene, armature):
    result = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        modifiers = [
            {
                "type": modifier.type,
                "object": modifier.object.name if modifier.object else None,
                "use_deform_preserve_volume": getattr(
                    modifier, "use_deform_preserve_volume", None
                ),
            }
            for modifier in obj.modifiers
            if modifier.type == "ARMATURE"
        ]
        armature_groups = [
            group.name
            for group in obj.vertex_groups
            if armature.data.bones.get(group.name) is not None
        ]
        result.append(
            {
                "name": obj.name,
                "parent": obj.parent.name if obj.parent else None,
                "parent_type": obj.parent_type,
                "armature_modifiers": modifiers,
                "armature_vertex_groups": len(armature_groups),
                "sample_groups": armature_groups[:24],
                "world_location": vector_tuple(obj.matrix_world.translation),
                "bounds_world": [
                    vector_tuple(obj.matrix_world @ Vector(corner))
                    for corner in obj.bound_box
                ],
            }
        )
    return result


bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
scene = bpy.context.scene
armatures = [obj for obj in scene.objects if obj.type == "ARMATURE"]
if len(armatures) != 1:
    raise RuntimeError(
        f"expected one armature, found {[obj.name for obj in armatures]}"
    )
armature = armatures[0]

root_bones = [bone for bone in armature.data.bones if bone.parent is None]
report = {
    "hero": "fairy-mina",
    "source": os.fspath(MASTER),
    "armature": armature.name,
    "blender_up": [0, 0, 1],
    "armature_object": {
        "location": vector_tuple(armature.location),
        "rotation": vector_tuple(armature.rotation_euler),
        "scale": vector_tuple(armature.scale),
        "matrix_world": matrix_tuple(armature.matrix_world),
    },
    "root_bones": [bone.name for bone in root_bones],
    "bones": [],
    "pose_snapshot_frame": scene.frame_current,
    "pose_snapshot": pose_snapshot(armature),
    "mesh_binding": mesh_binding(scene, armature),
    "actions": [action.name for action in bpy.data.actions],
}
for bone in armature.data.bones:
    report["bones"].append(
        {
            "name": bone.name,
            "parent": bone.parent.name if bone.parent else None,
            "head": vector_tuple(bone.head_local),
            "tail": vector_tuple(bone.tail_local),
            "length": round(float(bone.length), 6),
            "axes": axis_mapping(armature, bone),
        }
    )

if root_bones:
    report["root_axis_contract"] = {
        bone.name: axis_mapping(armature, bone) for bone in root_bones
    }
report["recommended_root_motion_candidates"] = [
    {
        "bone": bone.name,
        "parent": bone.parent.name if bone.parent else None,
        "head_world": vector_tuple(armature.matrix_world @ bone.head_local),
        "tail_world": vector_tuple(armature.matrix_world @ bone.tail_local),
        "pose_location_channel": f"pose.bones['{bone.name}'].location",
    }
    for bone in root_bones
]

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    json.dumps(
        {
            "status": "PASS",
            "armature": armature.name,
            "bone_count": len(armature.data.bones),
            "root_bones": [bone.name for bone in root_bones],
            "mesh_count": len(report["mesh_binding"]),
            "report": os.fspath(REPORT),
        },
        ensure_ascii=False,
    )
)
