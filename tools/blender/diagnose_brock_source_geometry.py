"""Inspect disconnected geometry islands in the supplied Brock Zeus FBX."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

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
REPORT = ROOT / "artifacts" / "brock-zeus-source-geometry-diagnostic.json"


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
        island = []
        while stack:
            vertex_index = stack.pop()
            island.append(vertex_index)
            for neighbor in adjacency[vertex_index]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        result.append(island)
    return result


def record(obj, island):
    points = [obj.matrix_world @ obj.data.vertices[index].co for index in island]
    minimum = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    center = sum(points, Vector()) / len(points)
    return {
        "vertices": len(island),
        "polygons": sum(
            1
            for polygon in obj.data.polygons
            if any(index in island for index in polygon.vertices)
        ),
        "centroid": [round(float(value), 6) for value in center],
        "min": [round(float(value), 6) for value in minimum],
        "max": [round(float(value), 6) for value in maximum],
        "dimensions": [round(float(value), 6) for value in maximum - minimum],
    }


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.fspath(SOURCE), use_image_search=True)
    payload = {"source": os.fspath(SOURCE.relative_to(ROOT)), "objects": []}
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        islands = [record(obj, island) for island in components(obj)]
        islands.sort(key=lambda item: item["vertices"], reverse=True)
        payload["objects"].append({"name": obj.name, "islands": islands})
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "objects": [
                    (item["name"], len(item["islands"])) for item in payload["objects"]
                ],
                "report": os.fspath(REPORT),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
