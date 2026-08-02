"""Verify Brock's right arm stays connected over every authored clip frame."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import inspect_brock_skinning as diagnostic

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
REPORT = ROOT / "artifacts" / "brock-zeus-skinning-all-clips.json"
FRAME_ENDS = {
    "idle": 80,
    "run": 20,
    "attack": 16,
    "super": 50,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 16,
    "aim-gadget": 60,
}


def find_component(report, vertices, owner, *, positive=True, z_below=None):
    for index, item in enumerate(report["components"]):
        if item["vertices"] != vertices or item["owner"] != owner:
            continue
        if positive and item["source_centroid"][0] <= 0:
            continue
        if z_below is not None and item["source_centroid"][2] >= z_below:
            continue
        return index
    raise RuntimeError(f"component signature not found: {vertices}/{owner}")


def connected_gap(report, left, right):
    for item in report["joint_gaps"]:
        if {item["left"], item["right"]} == {left, right}:
            return item["distance"]
    return 999.0


def component_source_centroid(mesh, component):
    points = [mesh.matrix_world @ mesh.data.vertices[index].co for index in component]
    return diagnostic.centroid(points)


def fast_gap_report(scene, mesh, component_groups, selected, frame):
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        forearm = [
            evaluated.matrix_world @ evaluated_mesh.vertices[index].co
            for index in component_groups[selected["forearm"]]
        ]
        island_gaps = {
            str(component_index): min(
                (a - b).length
                for a in forearm
                for b in [
                    evaluated.matrix_world @ evaluated_mesh.vertices[index].co
                    for index in component_groups[component_index]
                ]
            )
            for component_index in selected["wrist_islands"]
        }
        gaps = {f"component_{index}": value for index, value in island_gaps.items()}
        gaps["max"] = max(island_gaps.values())
        return {name: round(float(value), 5) for name, value in gaps.items()}
    finally:
        evaluated.to_mesh_clear()


def main():
    payload = {"clips": {}, "status": "PASS"}
    for clip, end in FRAME_ENDS.items():
        scene_path = SCENES / f"{clip}.blend"
        bpy.ops.wm.open_mainfile(filepath=os.fspath(scene_path))
        scene = bpy.context.scene
        mesh = bpy.data.objects.get("armor_GEO:PIV.001")
        if mesh is None:
            raise RuntimeError(f"{clip}: missing Brock mesh")
        component_groups = diagnostic.components(mesh)
        centroids = [
            component_source_centroid(mesh, group) for group in component_groups
        ]
        selected = {
            "forearm": next(
                index
                for index, group in enumerate(component_groups)
                if len(group) == 95 and centroids[index].x > 0
            ),
            "wrist_islands": [
                index
                for index, group in enumerate(component_groups)
                if len(group) >= 10
                and centroids[index].x > 0
                and diagnostic.weight_owner(mesh, group[0])[0] == "R_Wrist"
            ],
        }
        clip_result = {"status": "PASS", "frames": {}, "max_gap": 0.0}
        for frame in range(end + 1):
            gaps = fast_gap_report(scene, mesh, component_groups, selected, frame)
            clip_result["frames"][str(frame)] = gaps
            clip_result["max_gap"] = max(clip_result["max_gap"], gaps["max"])
            if gaps["max"] > 0.05:
                clip_result["status"] = "FAIL"
                payload["status"] = "FAIL"
        payload["clips"][clip] = clip_result
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({"status": payload["status"], "report": os.fspath(REPORT)}))
    if payload["status"] != "PASS":
        raise RuntimeError("Brock right-arm skinning gap exceeded 0.05")


if __name__ == "__main__":
    main()
