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


def fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", ()):
                result.extend(bag.fcurves)
    return result


for hero, names in CASES.items():
    bpy.ops.wm.open_mainfile(
        filepath=os.fspath(SOURCE / hero / "scenes" / "idle.blend")
    )
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    action = arm.animation_data.action
    print(f"IDLE {hero} {action.frame_range[:]}")
    for name in names:
        curves = [c for c in fcurves(action) if f'pose.bones["{name}"]' in c.data_path]
        print(f" BONE {name}")
        for curve in sorted(curves, key=lambda c: c.array_index):
            values = [float(p.co[1]) for p in curve.keyframe_points]
            frames = [float(p.co[0]) for p in curve.keyframe_points]
            jumps = [abs(values[i + 1] - values[i]) for i in range(len(values) - 1)]
            peak = max(range(len(jumps)), key=lambda i: jumps[i], default=None)
            peak_text = (
                f" peak={frames[peak]}->{frames[peak + 1]}" if peak is not None else ""
            )
            print(
                f"  {curve.data_path.split('.')[-1]}[{curve.array_index}] keys={len(values)} frames={frames[0] if frames else None}-{frames[-1] if frames else None} range={(min(values), max(values)) if values else None} max_jump={max(jumps, default=0):.5f}{peak_text} interp={sorted(set(p.interpolation for p in curve.keyframe_points))}"
            )
