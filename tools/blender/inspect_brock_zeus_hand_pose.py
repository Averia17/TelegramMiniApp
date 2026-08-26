"""Report Brock Zeus hand separation in every authored body clip."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/zeus_base.blend"
REPORT = ROOT / "output/blender/brock-zeus-hand-pose-report.json"


def world_bone_point(armature, name):
    bone = armature.pose.bones.get(name)
    if bone is None:
        return None
    return armature.matrix_world @ bone.matrix.translation


def point_data(point):
    return None if point is None else {axis: round(float(value), 5) for axis, value in zip("xyz", point)}


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    armature = bpy.data.objects["BrockZeus_Rig"]
    clips = ("idle", "run", "Spawn", "Attack", "super", "Gadget", "hit", "Victory", "death")
    report = {"master": os.fspath(MASTER), "clips": {}}

    for clip_name in clips:
        action = bpy.data.actions.get(clip_name)
        if action is None:
            continue
        armature.animation_data_clear()
        armature.animation_data_create()
        armature.animation_data.action = action
        start = int(math.floor(action.frame_range[0]))
        end = int(math.ceil(action.frame_range[1]))
        sample_frames = sorted({start, start + max(0, (end - start) // 2), end})
        frames = {}
        for frame in sample_frames:
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            right = world_bone_point(armature, "R_Hand")
            left = world_bone_point(armature, "L_Hand")
            shoulder_right = world_bone_point(armature, "R_Shoulder")
            shoulder_left = world_bone_point(armature, "L_Shoulder")
            hand_gap = (right - left).length if right is not None and left is not None else None
            frames[str(frame)] = {
                "right_hand": point_data(right),
                "left_hand": point_data(left),
                "right_shoulder": point_data(shoulder_right),
                "left_shoulder": point_data(shoulder_left),
                "hand_gap": round(float(hand_gap), 5) if hand_gap is not None else None,
            }
        report["clips"][clip_name] = {
            "frame_range": [start, end],
            "duration_seconds": round(float(action.frame_range[1] - action.frame_range[0]) / 30.0, 5),
            "frames": frames,
        }

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
