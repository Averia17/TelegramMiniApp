"""Inspect Brock master and its adjacent Blender backup without modifying files."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import inspect_brock_skinning as diagnostic


def inspect(path):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    armature = bpy.data.objects.get("brock-zeus-rig")
    mesh = bpy.data.objects.get("armor_GEO:PIV.001")
    cloud = bpy.data.objects.get("Cloud") or bpy.data.objects.get(
        "HeroAttachment_Cloud"
    )
    locator = bpy.data.objects.get("Cloud_Locator")
    owners = {}
    if mesh:
        for component in diagnostic.components(mesh):
            owner = (
                diagnostic.weight_owner(mesh, component[0])[0] if component else None
            )
            owners[owner] = owners.get(owner, 0) + 1
    return {
        "file": os.fspath(path.relative_to(ROOT)),
        "objects": sorted((obj.name, obj.type) for obj in bpy.data.objects),
        "armature": {
            "exists": bool(armature),
            "location": list(armature.location) if armature else None,
            "bones": sorted(armature.data.bones.keys()) if armature else [],
        },
        "mesh": {
            "exists": bool(mesh),
            "modifiers": (
                [
                    (modifier.type, modifier.object.name if modifier.object else None)
                    for modifier in mesh.modifiers
                ]
                if mesh
                else []
            ),
            "components": len(diagnostic.components(mesh)) if mesh else 0,
            "owners": owners,
        },
        "cloud": {
            "exists": bool(cloud),
            "parent": cloud.parent.name if cloud and cloud.parent else None,
            "location": list(cloud.location) if cloud else None,
            "scale": list(cloud.scale) if cloud else None,
            "geometry_centered": cloud.get("geometry_centered") if cloud else None,
        },
        "locator": {
            "exists": bool(locator),
            "parent": locator.parent.name if locator and locator.parent else None,
            "parent_type": locator.parent_type if locator else None,
            "parent_bone": locator.parent_bone if locator else None,
        },
    }


paths = [
    ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "brock-zeus.blend",
    ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "brock-zeus.blend1",
]
print(
    json.dumps(
        [inspect(path) for path in paths if path.exists()], ensure_ascii=False, indent=2
    )
)
