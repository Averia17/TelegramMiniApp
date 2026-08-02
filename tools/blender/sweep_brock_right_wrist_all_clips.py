"""Find right-wrist local-X values that keep Brock's cuff attached."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import inspect_brock_skinning as diagnostic

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
TARGETS = {
    "attack": 3,
    "super": 18,
    "aim": 60,
    "victory": 10,
    "gadget": 10,
    "aim-gadget": 41,
}


def gap(mesh, groups, selected):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        points = {
            name: [
                evaluated.matrix_world @ evaluated_mesh.vertices[index].co
                for index in groups[component]
            ]
            for name, component in selected.items()
        }
        values = [
            min((a - b).length for a in points["forearm"] for b in points["hand"]),
            min((a - b).length for a in points["forearm"] for b in points["cuff"]),
        ]
        return max(values)
    finally:
        evaluated.to_mesh_clear()


for clip, frame in TARGETS.items():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENES / f"{clip}.blend"))
    scene = bpy.context.scene
    mesh = bpy.data.objects["armor_GEO:PIV.001"]
    armature = bpy.data.objects["brock-zeus-rig"]
    component_groups = diagnostic.components(mesh)
    centroids = [
        diagnostic.centroid(
            [mesh.matrix_world @ mesh.data.vertices[index].co for index in group]
        )
        for group in component_groups
    ]
    selected = {
        "forearm": next(
            index
            for index, group in enumerate(component_groups)
            if len(group) == 95 and centroids[index].x > 0
        ),
        "hand": next(
            index
            for index, group in enumerate(component_groups)
            if len(group) == 363 and centroids[index].x > 0
        ),
        "cuff": next(
            index
            for index, group in enumerate(component_groups)
            if len(group) == 28 and centroids[index].x > 0 and centroids[index].z < 1
        ),
    }
    scene.frame_set(frame)
    wrist = armature.pose.bones["R_Wrist"]
    base = wrist.rotation_euler.x
    candidates = []
    for step in range(-24, 25):
        wrist.rotation_euler.x = base + math.radians(step * 5)
        candidates.append(
            (
                gap(mesh, component_groups, selected),
                math.degrees(wrist.rotation_euler.x),
            )
        )
    best_gap, best_degrees = min(candidates)
    print(
        {
            "clip": clip,
            "frame": frame,
            "current_degrees": round(math.degrees(base), 2),
            "best_degrees": round(best_degrees, 2),
            "best_gap": round(best_gap, 5),
        }
    )
