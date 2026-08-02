"""Sweep Brock's authored wrist rotation to localize the visible hand gap."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENE = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / "idle.blend"
)


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
        group = []
        while stack:
            vertex = stack.pop()
            group.append(vertex)
            for neighbor in adjacency[vertex]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        result.append(group)
    return result


def center(points):
    return sum(points, Vector()) / max(1, len(points))


def evaluate(mesh, left_component, right_component):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        left = [
            evaluated.matrix_world @ evaluated_mesh.vertices[index].co
            for index in left_component
        ]
        right = [
            evaluated.matrix_world @ evaluated_mesh.vertices[index].co
            for index in right_component
        ]
        gap = min((a - b).length for a in left for b in right)
        return center(left), center(right), gap
    finally:
        evaluated.to_mesh_clear()


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE))
    scene = bpy.context.scene
    armature = bpy.data.objects["brock-zeus-rig"]
    mesh = bpy.data.objects["armor_GEO:PIV.001"]
    groups = components(mesh)
    # The two largest right-arm islands are the visible forearm and hand.
    right_arm = sorted(
        (index for index, group in enumerate(groups) if len(group) > 50),
        key=lambda index: len(groups[index]),
        reverse=True,
    )
    left_component = next(index for index in right_arm if len(groups[index]) == 95)
    right_component = next(
        index
        for index in right_arm
        if len(groups[index]) == 363
        and center(
            [
                mesh.matrix_world @ mesh.data.vertices[vertex].co
                for vertex in groups[index]
            ]
        ).x
        > 0
    )
    scene.frame_set(0)
    wrist = armature.pose.bones["R_Wrist"]
    base = wrist.rotation_euler.copy()
    cuff_component = next(
        index
        for index, group in enumerate(groups)
        if len(group) == 28
        and center(
            [mesh.matrix_world @ mesh.data.vertices[vertex].co for vertex in group]
        ).x
        > 0
        and center(
            [mesh.matrix_world @ mesh.data.vertices[vertex].co for vertex in group]
        ).z
        < 1
    )
    print(
        {
            "forearm_component": left_component,
            "hand_component": right_component,
            "cuff_component": cuff_component,
        }
    )
    for degrees in range(-90, 91, 15):
        wrist.rotation_euler.x = math.radians(degrees)
        left, right, gap = evaluate(
            mesh, groups[left_component], groups[right_component]
        )
        _, _, cuff_gap = evaluate(mesh, groups[left_component], groups[cuff_component])
        print(
            {
                "wrist_x_degrees": degrees,
                "forearm": [round(float(v), 4) for v in left],
                "hand": [round(float(v), 4) for v in right],
                "gap": round(float(gap), 5),
                "cuff_gap": round(float(cuff_gap), 5),
            }
        )
    wrist.rotation_euler = base


if __name__ == "__main__":
    main()
