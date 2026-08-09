"""Print source, mesh, and bone world-space landmarks for Brock."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = Path(
    os.environ.get(
        "BROCK_MASTER_PATH",
        ROOT
        / "frontend"
        / "assets-source"
        / "heroes"
        / "brock-zeus"
        / "brock-zeus.blend",
    )
)


def world_bone(armature, name):
    bone = armature.pose.bones[name]
    return armature.matrix_world @ bone.head, armature.matrix_world @ bone.tail


def world_centroid(mesh, indices):
    return sum(
        (mesh.matrix_world @ mesh.data.vertices[index].co for index in indices),
        Vector(),
    ) / len(indices)


def components(mesh):
    adjacency = [set() for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        for offset, vertex_index in enumerate(polygon.vertices):
            adjacency[vertex_index].add(polygon.vertices[offset - 1])
            adjacency[vertex_index].add(
                polygon.vertices[(offset + 1) % len(polygon.vertices)]
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


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    mesh = bpy.data.objects["armor_GEO:PIV.001"]
    armature = bpy.data.objects["brock-zeus-rig"]
    scene = bpy.context.scene
    scene.frame_set(int(os.environ.get("BROCK_FRAME", "0")))
    print("MESH_WORLD", mesh.matrix_world[:])
    print(
        "MESH_OBJECT",
        "location",
        tuple(mesh.location),
        "scale",
        tuple(mesh.scale),
        "parent",
        mesh.parent.name if mesh.parent else None,
    )
    print("MESH_PARENT_INV", mesh.matrix_parent_inverse[:])
    print(
        "MESH_DATA_BOUNDS",
        [tuple(round(value, 6) for value in corner) for corner in mesh.bound_box],
    )
    print("MESH_DIMENSIONS", tuple(mesh.dimensions))
    print("ARMATURE_WORLD", armature.matrix_world[:])
    for name in [
        "Root",
        "Hips",
        "Chest",
        "L_Shoulder",
        "L_Elbow",
        "L_Wrist",
        "R_Shoulder",
        "R_Elbow",
        "R_Wrist",
        "L_UpperLeg",
        "L_LowerLeg",
        "R_UpperLeg",
        "R_LowerLeg",
    ]:
        head, tail = world_bone(armature, name)
        print(
            "BONE",
            name,
            "HEAD",
            tuple(round(value, 6) for value in head),
            "TAIL",
            tuple(round(value, 6) for value in tail),
        )
    all_islands = components(mesh)
    for index, island in sorted(
        enumerate(all_islands), key=lambda item: len(item[1]), reverse=True
    )[:80]:
        owner = None
        if mesh.data.vertices[island[0]].groups:
            owner = max(
                (
                    (mesh.vertex_groups[group.group].name, group.weight)
                    for group in mesh.data.vertices[island[0]].groups
                ),
                key=lambda item: item[1],
            )[0]
        print(
            "ISLAND",
            index,
            len(island),
            owner,
            tuple(round(value, 6) for value in world_centroid(mesh, island)),
        )
    print("LATERAL_ISLANDS")
    for index, island in sorted(
        enumerate(all_islands), key=lambda item: len(item[1]), reverse=True
    ):
        center = world_centroid(mesh, island)
        if center.x > 0.35 or center.x < -0.95 or center.y > 0.65:
            print(
                "LATERAL",
                index,
                len(island),
                tuple(round(value, 6) for value in center),
            )


if __name__ == "__main__":
    main()
