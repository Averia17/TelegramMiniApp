"""Stage-0 rig audit for Needle v2 authoring.

Run with Blender:
  blender --background --python tools/blender/diagnose_needle_rig_axes.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / "needle" / "needle.blend"
REPORT = ROOT / "artifacts" / "needle-rig-axis-diagnostic.json"


def vector_tuple(vector):
    return [round(float(value), 6) for value in vector]


def axis_mapping(armature, bone):
    basis = bone.matrix_local.to_3x3()
    world = armature.matrix_world.to_3x3() @ basis
    return {
        "local_x_to_world": vector_tuple(world @ Vector((1, 0, 0))),
        "local_y_to_world": vector_tuple(world @ Vector((0, 1, 0))),
        "local_z_to_world": vector_tuple(world @ Vector((0, 0, 1))),
    }


bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
armature = bpy.data.objects.get("NeedleRig")
if armature is None:
    raise RuntimeError("NeedleRig not found")

report = {
    "hero": "needle",
    "armature": armature.name,
    "blender_up": [0, 0, 1],
    "bones": [],
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

root = armature.data.bones.get("Root")
if root is not None:
    report["root_axis_contract"] = axis_mapping(armature, root)
    report["root_vertical_pose_channel"] = "pose.bones['Root'].location.y"
    report["root_horizontal_pose_channels"] = [
        "pose.bones['Root'].location.x",
        "pose.bones['Root'].location.z",
    ]

REPORT.parent.mkdir(parents=True, exist_ok=True)
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"status": "PASS", "report": os.fspath(REPORT)}, ensure_ascii=False))
