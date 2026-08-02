"""Test all suspected hand islands following R_Wrist at a representative pose."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import inspect_brock_skinning as diagnostic

ROOT = Path(__file__).resolve().parents[2]
SCENE = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / "attack.blend"
)

bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE))
scene = bpy.context.scene
mesh = bpy.data.objects["armor_GEO:PIV.001"]
armature = bpy.data.objects["brock-zeus-rig"]
groups = diagnostic.components(mesh)
for component in groups:
    source = diagnostic.centroid(
        [mesh.matrix_world @ mesh.data.vertices[index].co for index in component]
    )
    if (
        len(component) in {32, 83, 34, 51}
        and source.x > 0
        and source.x < 0.5
        and source.z < 1.05
    ):
        mesh.vertex_groups["R_Wrist"].add(component, 1.0, "REPLACE")
scene.frame_set(3)
wrist = armature.pose.bones["R_Wrist"]
base = wrist.rotation_euler.x
results = []
for offset in range(-120, 121, 10):
    wrist.rotation_euler.x = base + math.radians(offset)
    report = diagnostic.frame_report(scene, mesh, 3)
    forearm = next(
        index
        for index, item in enumerate(report["components"])
        if item["vertices"] == 95 and item["owner"] == "R_Elbow"
    )
    gaps = [
        item["distance"]
        for item in report["joint_gaps"]
        if item["left"] == forearm and item["right_owner"] == "R_Wrist"
    ]
    results.append((max(gaps), math.degrees(wrist.rotation_euler.x)))
print({"best": min(results), "base": math.degrees(base)})
