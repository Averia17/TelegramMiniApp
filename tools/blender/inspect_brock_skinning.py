"""Inspect Brock's disconnected mesh components and authored deformation.

This is intentionally diagnostic-only.  It opens the focused idle scene,
evaluates the armature modifier at key frames, and reports which deform bone
owns each disconnected mesh component together with its deformed world-space
centroid.  It catches detached hands/feet that a keyframe-only audit misses.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENE_PATH = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / "idle.blend"
)
REPORT = ROOT / "artifacts" / "brock-zeus-skinning-diagnostic.json"


def components(mesh):
    adjacency = [set() for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        for index, vertex_index in enumerate(polygon.vertices):
            adjacency[vertex_index].add(polygon.vertices[index - 1])
            adjacency[vertex_index].add(
                polygon.vertices[(index + 1) % len(polygon.vertices)]
            )
    seen = set()
    result = []
    for start in range(len(adjacency)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            vertex_index = stack.pop()
            component.append(vertex_index)
            for neighbor in adjacency[vertex_index]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        result.append(component)
    return result


def weight_owner(mesh, vertex_index):
    weights = []
    vertex = mesh.data.vertices[vertex_index]
    for group in vertex.groups:
        try:
            weights.append((mesh.vertex_groups[group.group].name, float(group.weight)))
        except RuntimeError:
            continue
    return max(weights, key=lambda item: item[1]) if weights else (None, 0.0)


def centroid(points):
    return sum(points, Vector()) / max(1, len(points))


def bounds(points):
    return {
        "min": [
            round(float(min(point[index] for point in points)), 5) for index in range(3)
        ],
        "max": [
            round(float(max(point[index] for point in points)), 5) for index in range(3)
        ],
    }


def frame_report(scene, mesh, frame):
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    armature = bpy.data.objects.get("brock-zeus-rig")
    classification_offset = Vector((armature.location.x, 0.0, 0.0))
    inverse_armature = armature.matrix_world.inverted()
    try:
        result = []
        point_sets = {}
        component_list = components(mesh)
        material_indices_by_vertex = [set() for _ in mesh.data.vertices]
        for polygon in mesh.data.polygons:
            for vertex_index in polygon.vertices:
                material_indices_by_vertex[vertex_index].add(polygon.material_index)
        for component_index, component in enumerate(component_list):
            source_points = [
                mesh.matrix_world @ mesh.data.vertices[index].co for index in component
            ]
            classification_points = [
                classification_offset + inverse_armature @ point
                for point in source_points
            ]
            deformed_points = [
                evaluated.matrix_world @ evaluated_mesh.vertices[index].co
                for index in component
            ]
            owners = [weight_owner(mesh, index) for index in component]
            material_indices = set().union(
                *(material_indices_by_vertex[index] for index in component)
            )
            result.append(
                {
                    "vertices": len(component),
                    "owner": max(set(owners), key=owners.count)[0],
                    "owner_weight_min": round(min(weight for _, weight in owners), 6),
                    "source_centroid": [
                        round(float(value), 5) for value in centroid(source_points)
                    ],
                    "classification_centroid": [
                        round(float(value), 5)
                        for value in centroid(classification_points)
                    ],
                    "materials": [
                        mesh.data.materials[index].name
                        for index in sorted(material_indices)
                        if index < len(mesh.data.materials)
                    ],
                    "deformed_centroid": [
                        round(float(value), 5) for value in centroid(deformed_points)
                    ],
                    "deformed_bounds": bounds(deformed_points),
                }
            )
            point_sets[component_index] = deformed_points
        joint_gaps = []
        for left_index, left in enumerate(result):
            if (
                left["owner"] not in {"R_Shoulder", "R_Elbow", "R_Wrist"}
                or left["vertices"] < 20
            ):
                continue
            for right_index, right in enumerate(result):
                if (
                    right_index <= left_index
                    or right["owner"] not in {"R_Shoulder", "R_Elbow", "R_Wrist"}
                    or right["vertices"] < 20
                ):
                    continue
                nearest = min(
                    (left_point - right_point).length
                    for left_point in point_sets[left_index]
                    for right_point in point_sets[right_index]
                )
                joint_gaps.append(
                    {
                        "left": left_index,
                        "left_owner": left["owner"],
                        "right": right_index,
                        "right_owner": right["owner"],
                        "distance": round(float(nearest), 5),
                    }
                )
        return {
            "components": result,
            "joint_gaps": sorted(
                joint_gaps, key=lambda item: item["distance"], reverse=True
            ),
        }
    finally:
        evaluated.to_mesh_clear()


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE_PATH))
    scene = bpy.context.scene
    mesh = bpy.data.objects.get("armor_GEO:PIV.001")
    armature = bpy.data.objects.get("brock-zeus-rig")
    if mesh is None or armature is None:
        raise RuntimeError("Brock idle scene is missing mesh or armature")
    payload = {
        "scene": os.fspath(SCENE_PATH.relative_to(ROOT)),
        "frames": {
            str(frame): frame_report(scene, mesh, frame)
            for frame in (0, 3, 6, 8, 10, 16, 20, 40, 60, 80)
        },
    }
    # Regression gate for the defect visible in the browser: the right forearm,
    # hand and small cuff island must remain connected through every sampled
    # frame.  The signatures identify geometry, not component list indices.
    for frame_name, report in payload["frames"].items():
        elbow_index = next(
            index
            for index, item in enumerate(report["components"])
            if item["vertices"] == 95
            and item["owner"] == "R_Elbow"
            and item["source_centroid"][0] > 0
        )
        hand_index = next(
            index
            for index, item in enumerate(report["components"])
            if item["vertices"] == 363
            and item["owner"] == "R_Wrist"
            and item["source_centroid"][0] > 0
        )
        cuff_index = next(
            (
                index
                for index, item in enumerate(report["components"])
                if item["vertices"] == 28
                and item["owner"] == "R_Wrist"
                and item["source_centroid"][0] > 0
            ),
            None,
        )
        if cuff_index is None:
            # The source FBX does not carry semantic object names; a
            # transform repair may move this small island above the legacy
            # z-window.  Keep the diagnostic useful by selecting the only
            # remaining wrist island with the measured vertex signature.
            cuff_index = next(
                (
                    index
                    for index, item in enumerate(report["components"])
                    if item["vertices"] == 28
                    and item["owner"] == "R_Wrist"
                    and item["source_centroid"][0] > 0
                ),
                None,
            )
        if cuff_index is None:
            raise RuntimeError(f"right wrist cuff island missing at frame {frame_name}")
        gaps = {
            (item["left"], item["right"]): item["distance"]
            for item in report["joint_gaps"]
        }
        pair_gaps = [
            gaps.get((min(elbow_index, other), max(elbow_index, other)), 999.0)
            for other in (hand_index, cuff_index)
        ]
        report["right_wrist_regression"] = {
            "forearm_to_hand": pair_gaps[0],
            "forearm_to_cuff": pair_gaps[1],
            "max_gap": max(pair_gaps),
        }
        if max(pair_gaps) > 0.05:
            raise RuntimeError(
                f"right wrist gap regression at frame {frame_name}: {max(pair_gaps):.5f}"
            )
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "report": os.fspath(REPORT),
                "components": len(payload["frames"]["0"]["components"]),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
