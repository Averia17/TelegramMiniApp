"""Stage-0 audit for Brock Zeus animation authoring.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/diagnose_brock_zeus_rig.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
HERO = "brock-zeus"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "brock-zeus.blend"
REPORT = ROOT / "artifacts" / "brock-zeus-rig-axis-diagnostic.json"


def vector(values):
    return [round(float(value), 6) for value in values]


def matrix(values):
    return [[round(float(value), 6) for value in row] for row in values]


def finite(values):
    return all(math.isfinite(float(value)) for value in values)


def action_frames(action):
    points = []
    if hasattr(action, "fcurves"):
        curves = action.fcurves
    else:
        curves = []
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in getattr(strip, "channelbags", []):
                    curves.extend(channelbag.fcurves)
    for curve in curves:
        points.extend(point.co[0] for point in curve.keyframe_points)
    return [min(points), max(points)] if points else []


def object_record(obj):
    dimensions = vector(obj.dimensions)
    return {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "parent_type": obj.parent_type,
        "parent_bone": obj.parent_bone or None,
        "location": vector(obj.location),
        "rotation_euler": vector(obj.rotation_euler),
        "scale": vector(obj.scale),
        "dimensions": dimensions,
        "finite_transform": finite(obj.location)
        and finite(obj.rotation_euler)
        and finite(obj.scale),
        "modifiers": [modifier.type for modifier in obj.modifiers],
        "vertex_groups": sorted(group.name for group in obj.vertex_groups),
        "collection_names": sorted(
            collection.name for collection in obj.users_collection
        ),
    }


def inspect():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError("Brock Zeus master has no armature")

    bones = []
    for bone in armature.data.bones:
        pose_bone = armature.pose.bones.get(bone.name)
        bones.append(
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "head_local": vector(bone.head_local),
                "tail_local": vector(bone.tail_local),
                "length": round(float(bone.length), 6),
                "matrix_local": matrix(bone.matrix_local),
                "use_deform": bool(bone.use_deform),
                "pose_rotation_mode": pose_bone.rotation_mode if pose_bone else None,
                "pose_location": vector(pose_bone.location) if pose_bone else None,
                "pose_rotation_euler": (
                    vector(pose_bone.rotation_euler) if pose_bone else None
                ),
                "pose_scale": vector(pose_bone.scale) if pose_bone else None,
            }
        )

    objects = [object_record(obj) for obj in scene.objects]
    cloud_candidates = [
        record["name"]
        for record in objects
        if "cloud" in record["name"].casefold()
        or "cloud" in " ".join(record["vertex_groups"]).casefold()
    ]
    actions = {
        action.name: {"frames": action_frames(action), "users": action.users}
        for action in bpy.data.actions
    }
    payload = {
        "hero": HERO,
        "master": os.fspath(MASTER.relative_to(ROOT)),
        "scene": {
            "name": scene.name,
            "fps": scene.render.fps,
            "frame_start": scene.frame_start,
            "frame_end": scene.frame_end,
            "unit_system": scene.unit_settings.system,
            "unit_scale": scene.unit_settings.scale_length,
        },
        "armature": {
            "name": armature.name,
            "location": vector(armature.location),
            "rotation_euler": vector(armature.rotation_euler),
            "scale": vector(armature.scale),
            "bones": bones,
        },
        "objects": objects,
        "cloud_candidates": cloud_candidates,
        "actions": actions,
        "axis_contract": {
            "status": "MEASURED_FROM_MASTER",
            "note": "Use measured Root local channels; do not assume Root local Y is world-up until confirmed from matrices and frame tests.",
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "hero": HERO,
                "armature": armature.name,
                "bones": len(bones),
                "objects": len(objects),
                "cloud_candidates": cloud_candidates,
                "actions": sorted(actions),
                "report": os.fspath(REPORT),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    inspect()
