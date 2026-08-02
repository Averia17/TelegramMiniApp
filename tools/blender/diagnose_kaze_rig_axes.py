"""Stage-0 Kaze rig, attachment, and axis audit.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/diagnose_kaze_rig_axes.py

The report is deliberately descriptive only: it opens the source master and
never saves it.  Kaze's imported rig is not the humanoid naming scheme from
the brief, so this report is the contract used by the Kaze authoring adapter.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / "kaze" / "kaze.blend"
REPORT = ROOT / "artifacts" / "kaze-rig-axis-diagnostic.json"


def vector_tuple(value):
    return [round(float(component), 6) for component in value]


def axis_mapping(armature, bone):
    basis = bone.matrix_local.to_3x3()
    world = armature.matrix_world.to_3x3() @ basis
    return {
        "local_x_to_world": vector_tuple((world @ Vector((1, 0, 0))).normalized()),
        "local_y_to_world": vector_tuple((world @ Vector((0, 1, 0))).normalized()),
        "local_z_to_world": vector_tuple((world @ Vector((0, 0, 1))).normalized()),
    }


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    low = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    high = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    return {
        "min": vector_tuple(low),
        "max": vector_tuple(high),
        "size": vector_tuple(high - low),
    }


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    return [
        curve
        for layer in action.layers
        for strip in layer.strips
        for bag in getattr(strip, "channelbags", [])
        for curve in bag.fcurves
    ]


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        raise RuntimeError("Kaze master has no armature")

    report = {
        "hero": "kaze",
        "source": os.fspath(MASTER.relative_to(ROOT)),
        "armature": armature.name,
        "blender_up": [0, 0, 1],
        "bones": [],
        "objects": [],
        "actions": [],
        "root_vertical_candidates": [],
        "attachment_contract": {
            "left": {
                "mesh": "HeroAttachment_FanLeft",
                "marker": "Grip.Primary.HeroAttachment_FanLeft",
                "bone": "L_wrist_s",
            },
            "right": {
                "mesh": "HeroAttachment_FanRight",
                "marker": "Grip.Primary.HeroAttachment_FanRight",
                "bone": "R_wrist_s",
            },
            "export_policy": "attachments are separate runtime GLB meshes and excluded from character GLB",
        },
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
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH", "EMPTY"}:
            continue
        item = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "parent_type": obj.parent_type,
            "parent_bone": obj.parent_bone,
            "hide_viewport": bool(obj.hide_viewport),
            "hide_render": bool(obj.hide_render),
        }
        if obj.type == "MESH":
            item["bounds"] = bounds(obj)
            item["modifiers"] = [modifier.type for modifier in obj.modifiers]
            item["vertex_groups"] = [group.name for group in obj.vertex_groups]
        report["objects"].append(item)
    for action in bpy.data.actions:
        curves = action_curves(action)
        frames = [point.co[0] for curve in curves for point in curve.keyframe_points]
        report["actions"].append(
            {
                "name": action.name,
                "users": action.users,
                "frame_range": [min(frames), max(frames)] if frames else [],
                "curves": len(curves),
                "bones": sorted(
                    {
                        curve.data_path.split('"')[1]
                        for curve in curves
                        if curve.data_path.startswith("pose.bones[")
                    }
                ),
            }
        )
    for bone in armature.data.bones:
        up = (
            armature.matrix_world.to_3x3()
            @ bone.matrix_local.to_3x3()
            @ Vector((0, 1, 0))
        ).normalized()
        if abs(up.z) >= 0.8:
            report["root_vertical_candidates"].append(
                {"bone": bone.name, "local_y_world": vector_tuple(up)}
            )

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": "PASS",
                "report": os.fspath(REPORT),
                "bones": len(report["bones"]),
                "objects": len(report["objects"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
