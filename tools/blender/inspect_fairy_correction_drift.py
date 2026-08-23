from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "scenes"

for stem in ("idle", "attack", "super"):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE / f"{stem}.blend"))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    action = armature.animation_data.action
    print(
        f"{stem} range={tuple(action.frame_range)} revision={bpy.context.scene.get('fairy_arm_posture_revision')}"
    )
    for frame in sorted(
        {
            int(action.frame_range[0]),
            1,
            5,
            10,
            int((action.frame_range[0] + action.frame_range[1]) / 2),
            int(action.frame_range[1]),
        }
    ):
        bpy.context.scene.frame_set(frame)
        bones = armature.pose.bones
        print(
            frame,
            tuple(round(float(v), 3) for v in bones["L_shoulder_s"].rotation_euler),
            tuple(round(float(v), 3) for v in bones["L_wrist_s"].rotation_euler),
            tuple(round(float(v), 3) for v in bones["R_wrist_s"].rotation_euler),
        )
