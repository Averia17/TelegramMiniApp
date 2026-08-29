"""Inspect loose mesh components and weights in Fairy Mina's body mesh."""

from __future__ import annotations

import json
import os
from collections import Counter, deque
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
OUTPUT = ROOT / "output" / "blender" / "fairy-mina-body-components.json"


def inspect_mesh(obj) -> dict:
    mesh = obj.data
    vertex_faces = [[] for _ in mesh.vertices]
    for polygon in mesh.polygons:
        for vertex_index in polygon.vertices:
            vertex_faces[vertex_index].append(polygon.index)

    visited = set()
    components = []
    for polygon in mesh.polygons:
        if polygon.index in visited:
            continue
        queue = deque([polygon.index])
        visited.add(polygon.index)
        polygon_indices = []
        vertex_indices = set()
        while queue:
            polygon_index = queue.popleft()
            polygon_indices.append(polygon_index)
            polygon_vertices = mesh.polygons[polygon_index].vertices
            vertex_indices.update(polygon_vertices)
            for vertex_index in polygon_vertices:
                for adjacent in vertex_faces[vertex_index]:
                    if adjacent not in visited:
                        visited.add(adjacent)
                        queue.append(adjacent)

        material_counts = Counter(
            mesh.polygons[index].material_index for index in polygon_indices
        )
        group_scores = Counter()
        for vertex_index in vertex_indices:
            for group in obj.data.vertices[vertex_index].groups:
                group_scores[obj.vertex_groups[group.group].name] += group.weight
        bounds = [
            [
                round(
                    min(obj.data.vertices[index].co[axis] for index in vertex_indices),
                    4,
                ),
                round(
                    max(obj.data.vertices[index].co[axis] for index in vertex_indices),
                    4,
                ),
            ]
            for axis in range(3)
        ]
        components.append(
            {
                "vertices": len(vertex_indices),
                "polygons": len(polygon_indices),
                "bounds": bounds,
                "materials": {
                    str(index): count for index, count in material_counts.items()
                },
                "dominant_groups": [
                    [name, round(score, 3)]
                    for name, score in group_scores.most_common(8)
                ],
            }
        )
    components.sort(key=lambda component: component["vertices"], reverse=True)
    return {
        "object": obj.name,
        "vertices": len(mesh.vertices),
        "polygons": len(mesh.polygons),
        "materials": [
            material.name if material else None for material in obj.data.materials
        ],
        "vertex_groups": [group.name for group in obj.vertex_groups],
        "loose_components": components,
    }


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    meshes = [
        inspect_mesh(obj) for obj in bpy.context.scene.objects if obj.type == "MESH"
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(meshes, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"WROTE {OUTPUT}")


if __name__ == "__main__":
    main()
