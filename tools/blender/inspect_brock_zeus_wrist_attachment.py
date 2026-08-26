"""Report wrist/hand attachment distances across Brock Zeus clips."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/zeus_base.blend"
REPORT = ROOT / "output/blender/brock-zeus-wrist-attachment-report.json"


def world_points(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def closest_pair(left, right):
    best = None
    for left_index, left_point in enumerate(left):
        for right_index, right_point in enumerate(right):
            distance = (left_point - right_point).length
            if best is None or distance < best[0]:
                best = (
                    distance,
                    left_index,
                    right_index,
                    tuple(left_point),
                    tuple(right_point),
                )
    return best


def sample_action(scene, armature, depsgraph, action, pairs, start, end):
    armature.animation_data_clear()
    armature.animation_data_create()
    armature.animation_data.action = action
    values = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        frame_report = {"frame": frame}
        for side, elbow_name, hand_name in pairs:
            result = closest_pair(
                world_points(bpy.data.objects[elbow_name], depsgraph),
                world_points(bpy.data.objects[hand_name], depsgraph),
            )
            frame_report[side] = {
                "distance": result[0],
                "elbow_vertex": result[1],
                "hand_vertex": result[2],
                "elbow_point": result[3],
                "hand_point": result[4],
            }
        values.append(frame_report)
    return values


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    armature = bpy.data.objects["BrockZeus_Rig"]
    armature.animation_data_clear()
    armature.animation_data_create()
    armature.animation_data.action = bpy.data.actions["idle"]
    pairs = (
        ("right", "ZeusPart_R_Elbow", "ZeusPart_R_Hand"),
        ("left", "ZeusPart_L_Elbow", "ZeusPart_L_Hand"),
    )
    frames = (1, 8, 15, 30, 60, 90, 120)
    report = {"master": os.fspath(MASTER), "frames": {}}
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        frame_report = {}
        for side, elbow_name, hand_name in pairs:
            result = closest_pair(
                world_points(bpy.data.objects[elbow_name], depsgraph),
                world_points(bpy.data.objects[hand_name], depsgraph),
            )
            frame_report[side] = {
                "distance": result[0],
                "elbow_vertex": result[1],
                "hand_vertex": result[2],
                "elbow_point": result[3],
                "hand_point": result[4],
            }
        report["frames"][str(frame)] = frame_report
    clip_summary = {}
    for clip_name in ("run", "Spawn", "Attack", "super", "Gadget", "hit", "Victory", "death"):
        action = bpy.data.actions.get(clip_name)
        if action is None:
            continue
        clip_range = (
            int(action.frame_range[0]),
            int(action.frame_range[1]),
        )
        samples = sample_action(
            scene, armature, depsgraph, action, pairs, clip_range[0], clip_range[1]
        )
        clip_summary[clip_name] = {
            side: {
                "min": min(sample[side]["distance"] for sample in samples),
                "max": max(sample[side]["distance"] for sample in samples),
                "max_frame": max(samples, key=lambda sample: sample[side]["distance"]),
            }
            for side, _, _ in pairs
        }
    report["clip_summary"] = clip_summary
    bpy.context.scene.frame_set(120)
    bpy.context.view_layer.update()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
