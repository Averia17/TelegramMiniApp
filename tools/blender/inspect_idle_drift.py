from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
CASES = {
    "mandy": ("head_s_035", "L_wrist_s_047", "R_wrist_s_064"),
    "needle": ("Head", "LeftHand", "RightHand", "Flower"),
    "brock-zeus": ("Head", "L_Elbow", "R_Elbow", "L_Wrist", "R_Wrist"),
    "kaze": ("head_s", "L_wrist_s", "R_wrist_s"),
}

for hero, target_names in CASES.items():
    path = SOURCE / hero / "scenes" / "idle.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    action = armature.animation_data.action
    start, end = (int(action.frame_range[0]), int(action.frame_range[1]))
    print(
        f"IDLE {hero} range={start}-{end} revision={scene.get('natural_locomotion_revision')} pass={scene.get('natural_locomotion_pass')}"
    )
    print(
        "  bones:",
        {
            name: (
                armature.data.bones[name].parent.name
                if name in armature.data.bones and armature.data.bones[name].parent
                else None
            )
            for name in target_names
            if name in armature.data.bones
        },
    )
    for frame in sorted(
        {start, start + 1, start + max(1, (end - start) // 2), end - 1, end}
    ):
        scene.frame_set(frame)
        pose = {}
        for name in target_names:
            if name not in armature.pose.bones:
                continue
            bone = armature.pose.bones[name]
            pose[name] = {
                "rot": tuple(round(float(value), 3) for value in bone.rotation_euler),
                "head": tuple(round(float(value), 3) for value in bone.head),
            }
        print(f"  frame={frame} {pose}")
