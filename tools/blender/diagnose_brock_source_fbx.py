"""Stage-0 diagnostic for the Brock Zeus source FBX.

The supplied FBX is intentionally treated as geometry input, not as a rig
contract.  This script imports it into a clean Blender session and records
the meshes, materials, images, transforms, and any armature/action data it
actually contains.  It never writes back to the FBX.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/diagnose_brock_source_fbx.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "source"
    / "brock_zeus_t-pose.fbx"
)
REPORT = ROOT / "artifacts" / "brock-zeus-source-fbx-diagnostic.json"


def vector(values):
    return [round(float(value), 6) for value in values]


def finite(values):
    return all(math.isfinite(float(value)) for value in values)


def object_record(obj):
    record = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "parent_type": obj.parent_type,
        "parent_bone": obj.parent_bone or None,
        "location": vector(obj.location),
        "rotation_euler": vector(obj.rotation_euler),
        "scale": vector(obj.scale),
        "dimensions": vector(obj.dimensions),
        "finite_transform": finite(obj.location)
        and finite(obj.rotation_euler)
        and finite(obj.scale),
        "collections": sorted(collection.name for collection in obj.users_collection),
    }
    if obj.type == "MESH":
        record.update(
            {
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "materials": [
                    slot.material.name if slot.material else None
                    for slot in obj.material_slots
                ],
                "vertex_groups": sorted(group.name for group in obj.vertex_groups),
            }
        )
    if obj.type == "ARMATURE":
        record["bones"] = [
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "head_local": vector(bone.head_local),
                "tail_local": vector(bone.tail_local),
                "length": round(float(bone.length), 6),
                "use_deform": bool(bone.use_deform),
            }
            for bone in obj.data.bones
        ]
    return record


def inspect():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.fspath(SOURCE), use_image_search=True)

    payload = {
        "hero": "brock-zeus",
        "source": os.fspath(SOURCE.relative_to(ROOT)),
        "objects": [object_record(obj) for obj in bpy.context.scene.objects],
        "materials": [
            {
                "name": material.name,
                "use_nodes": bool(material.use_nodes),
                "node_types": (
                    [node.type for node in material.node_tree.nodes]
                    if material.use_nodes
                    else []
                ),
            }
            for material in bpy.data.materials
        ],
        "images": [
            {
                "name": image.name,
                "filepath": image.filepath,
                "packed": bool(image.packed_file),
                "size": [image.size[0], image.size[1]] if image.size[0] else None,
            }
            for image in bpy.data.images
            if image.name not in {"Render Result", "Viewer Node"}
        ],
        "actions": sorted(action.name for action in bpy.data.actions),
        "contract": {
            "armature": "MISSING_FROM_SOURCE" if not any(obj.type == "ARMATURE" for obj in bpy.context.scene.objects) else "PRESENT",
            "actions": "MISSING_FROM_SOURCE" if not bpy.data.actions else "PRESENT",
            "source_role": "geometry_only_input",
        },
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "hero": "brock-zeus",
                "objects": len(payload["objects"]),
                "meshes": sum(obj["type"] == "MESH" for obj in payload["objects"]),
                "armatures": sum(obj["type"] == "ARMATURE" for obj in payload["objects"]),
                "actions": payload["actions"],
                "report": os.fspath(REPORT),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    inspect()
