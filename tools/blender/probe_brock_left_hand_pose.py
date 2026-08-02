"""Probe the measured left-hand-to-hip distance in Brock's neutral pose."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes" / "idle.blend"


def world_point(armature, bone_name, end):
    bone = armature.pose.bones[bone_name]
    return armature.matrix_world @ Vector(getattr(bone, end))


def probe():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE))
    armature = bpy.data.objects["brock-zeus-rig"]
    scene = bpy.context.scene
    scene.frame_set(0)
    if armature.animation_data:
        armature.animation_data.action = None
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)
    hips = world_point(armature, "Hips", "head")
    shoulder = armature.pose.bones["L_Shoulder"]
    elbow = armature.pose.bones["L_Elbow"]
    wrist = armature.pose.bones["L_Wrist"]
    best = None
    rows = []
    for shoulder_x in range(-45, -4, 5):
        for elbow_x in range(45, 76, 5):
            shoulder.rotation_euler.x = shoulder_x * 3.141592653589793 / 180.0
            elbow.rotation_euler.x = elbow_x * 3.141592653589793 / 180.0
            bpy.context.view_layer.update()
            hand = world_point(armature, "L_Wrist", "tail")
            distance = (hand - hips).length
            rows.append((distance, shoulder_x, elbow_x, hand))
            if best is None or distance < best[0]:
                best = rows[-1]
    print(
        {
            "current": round(float((world_point(armature, "L_Wrist", "tail") - hips).length), 6),
            "best": {
                "distance": round(float(best[0]), 6),
                "shoulder_x": best[1],
                "elbow_x": best[2],
                "hand": [round(float(value), 6) for value in best[3]],
            },
            "candidates": {
                f"{shoulder_x}:{elbow_x}": round(float(distance), 6)
                for distance, shoulder_x, elbow_x, _ in rows
                if (shoulder_x, elbow_x) in {(-40, 50), (-40, 45), (-42, 50), (-42, 45), (-45, 50)}
            },
        }
    )


if __name__ == "__main__":
    probe()
