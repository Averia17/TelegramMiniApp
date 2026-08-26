"""Probe local hand-mesh offsets that close the cuff seam across Attack."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/scenes/zeus_rebuild_master.blend"


def points(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def distance(left, right):
    return min((a - b).length for a in left for b in right)


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = bpy.data.objects["BrockZeus_Rig"]
    armature.animation_data_clear()
    armature.animation_data_create()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    candidates = (-0.08, -0.04, 0.0, 0.04, 0.08)
    clips = (("Attack", (1, 4, 8, 13, 15, 24, 30)), ("super", (1, 12, 19, 29, 39, 49, 54)))
    for side, elbow_name, hand_name in (
        ("right", "ZeusPart_R_Elbow", "ZeusPart_R_Hand"),
        ("left", "ZeusPart_L_Elbow", "ZeusPart_L_Hand"),
    ):
        hand = bpy.data.objects[hand_name]
        base = [vertex.co.copy() for vertex in hand.data.vertices]
        best = None
        for dx in candidates:
            for dy in candidates:
                for dz in candidates:
                    for vertex, original in zip(hand.data.vertices, base):
                        vertex.co = original + Vector((dx, dy, dz))
                    hand.data.update()
                    values = []
                    for clip_name, frames in clips:
                        armature.animation_data.action = bpy.data.actions[clip_name]
                        for frame in frames:
                            bpy.context.scene.frame_set(frame)
                            bpy.context.view_layer.update()
                            values.append(distance(
                                points(bpy.data.objects[elbow_name], depsgraph),
                                points(hand, depsgraph),
                            ))
                    score = (max(values), sum(values), dx * dx + dy * dy + dz * dz)
                    if best is None or score < best[0]:
                        best = (score, (dx, dy, dz), values)
        for vertex, original in zip(hand.data.vertices, base):
            vertex.co = original
        hand.data.update()
        print(side, "best_delta", best[1], "distances", [round(value, 5) for value in best[2]], "score", tuple(round(value, 5) for value in best[0]))


if __name__ == "__main__":
    main()
