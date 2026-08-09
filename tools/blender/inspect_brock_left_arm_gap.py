"""Print the evaluated left-arm seam locations for a Brock scene."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / "idle.blend"
)


def owner(mesh, vertex):
    weights = [
        (mesh.vertex_groups[group.group].name, float(group.weight))
        for group in vertex.groups
    ]
    return max(weights, key=lambda item: item[1])[0] if weights else None


def main():
    path = Path(os.environ.get("BROCK_SCENE_PATH", DEFAULT))
    frame = int(os.environ.get("BROCK_FRAME", "0"))
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    mesh = bpy.data.objects["armor_GEO:PIV.001"]
    scene.frame_set(frame)
    evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
    evaluated_mesh = evaluated.to_mesh()
    try:
        groups = {"Chest": [], "L_Shoulder": [], "L_Elbow": [], "L_Wrist": []}
        for index, vertex in enumerate(mesh.data.vertices):
            group = owner(mesh, vertex)
            if group in groups:
                groups[group].append(
                    (evaluated.matrix_world @ evaluated_mesh.vertices[index].co, index)
                )
        for group, anchor in (
            ("L_Shoulder", "Chest"),
            ("L_Elbow", "L_Shoulder"),
            ("L_Wrist", "L_Elbow"),
        ):
            anchor_tree = KDTree(len(groups[anchor]))
            for index, (point, _) in enumerate(groups[anchor]):
                anchor_tree.insert(point, index)
            anchor_tree.balance()
            distances = sorted(anchor_tree.find(point)[2] for point, _ in groups[group])
            gap, source, target = min(
                (
                    (nearest[2], nearest[1], index)
                    for index, (point, _) in enumerate(groups[group])
                    for nearest in [anchor_tree.find(point)]
                ),
                key=lambda item: item[0],
            )
            shoulder_point, shoulder_vertex = groups[anchor][source]
            arm_point, arm_vertex = groups[group][target]
            print(
                {
                    "frame": frame,
                    "group": group,
                    "gap": round(float(gap), 6),
                    "p10_gap": round(
                        float(distances[round((len(distances) - 1) * 0.10)]), 6
                    ),
                    "median_gap": round(float(distances[len(distances) // 2]), 6),
                    "anchor": anchor,
                    "anchor_vertex": shoulder_vertex,
                    "arm_vertex": arm_vertex,
                    "anchor_point": tuple(
                        round(float(value), 6) for value in shoulder_point
                    ),
                    "arm_point": tuple(round(float(value), 6) for value in arm_point),
                    "move_arm_by": tuple(
                        round(float(value), 6) for value in shoulder_point - arm_point
                    ),
                }
            )
    finally:
        evaluated.to_mesh_clear()


if __name__ == "__main__":
    main()
