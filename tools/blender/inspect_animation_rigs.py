"""Inspect hero rig bones and authored action coverage for animation authoring."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
HEROES = [
    "brock-zeus",
    "damian",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
]


def fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def inspect(hero):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE / hero / f"{hero}.blend"))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    actions = {}
    for action in bpy.data.actions:
        curves = fcurves(action)
        frames = [point.co[0] for curve in curves for point in curve.keyframe_points]
        actions[action.name] = {
            "frames": [min(frames), max(frames)] if frames else [],
            "curves": len(curves),
            "bones": sorted(
                {
                    curve.data_path.split('"')[1]
                    for curve in curves
                    if curve.data_path.startswith("pose.bones[")
                }
            ),
        }
    return {
        "hero": hero,
        "armature": armature.name,
        "bones": [bone.name for bone in armature.data.bones],
        "actions": actions,
    }


report = [inspect(hero) for hero in HEROES]
out = ROOT / "artifacts" / "hero-rig-inventory.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"heroes": len(report), "output": str(out)}, ensure_ascii=False))
