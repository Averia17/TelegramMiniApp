"""Audit frame coverage and finite pose transforms in focused authored scenes."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
CLIPS = [
    "idle",
    "run",
    "attack",
    "super",
    "aim",
    "aim-super",
    "hit",
    "death",
    "spawn",
    "victory",
    "gadget",
]
ABILITY_CLIPS = {"Attack", "super", "Gadget"}
HEROES = [
    p.name for p in SOURCE.iterdir() if p.is_dir() and (p / f"{p.name}.blend").exists()
]


def fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                result.extend(channelbag.fcurves)
    return result


def audit(path):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    action = armature.animation_data.action
    curves = fcurves(action)
    frames = sorted(
        {int(round(point.co[0])) for curve in curves for point in curve.keyframe_points}
    )
    expected = list(range(int(scene.frame_start), int(scene.frame_end) + 1))
    keyed_all_frames = set(expected).issubset(frames)
    smooth_curves = all(
        point.interpolation == "BEZIER"
        and point.handle_left_type == "AUTO_CLAMPED"
        and point.handle_right_type == "AUTO_CLAMPED"
        for curve in curves
        for point in curve.keyframe_points
    )
    finite = True
    finite_deformation = True
    max_world_extent = 0.0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for frame in expected:
        scene.frame_set(frame)
        depsgraph.update()
        for bone in armature.pose.bones:
            values = list(bone.rotation_euler) + list(bone.location) + list(bone.scale)
            if not all(math.isfinite(float(value)) for value in values):
                finite = False
                break
        if not finite:
            break
        for obj in depsgraph.objects:
            if obj.type != "MESH":
                continue
            for corner in obj.bound_box:
                world_corner = obj.matrix_world @ Vector(corner)
                values = list(world_corner)
                if not all(math.isfinite(float(value)) for value in values):
                    finite_deformation = False
                    break
                max_world_extent = max(
                    max_world_extent, *(abs(float(value)) for value in values)
                )
            if not finite_deformation:
                break
        if not finite_deformation or max_world_extent > 1000.0:
            finite_deformation = False
            break
    return {
        "file": str(path.relative_to(ROOT)),
        "hero": scene.get("hero_slug"),
        "clip": scene.get("clip_name"),
        "start": int(scene.frame_start),
        "end": int(scene.frame_end),
        "frames": len(expected),
        "distinct_keyed_frames": len(frames),
        "keyed_all_frames": keyed_all_frames,
        "smooth_curves": smooth_curves,
        "curve_count": len(curves),
        "key_count": sum(len(curve.keyframe_points) for curve in curves),
        "finite_pose": finite,
        "finite_deformation": finite_deformation,
        "max_world_extent": round(max_world_extent, 4),
        "authoring_status": scene.get("authoring_status"),
    }


report = [
    audit(SOURCE / hero / "scenes" / f"{clip}.blend")
    for hero in HEROES
    for clip in CLIPS
]
out = ROOT / "artifacts" / "hero-animation-frame-audit.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
failures = [
    item
    for item in report
    if not item["keyed_all_frames"]
    or (item["clip"] in ABILITY_CLIPS and not item["smooth_curves"])
    or not item["finite_pose"]
    or not item["finite_deformation"]
    or item["authoring_status"] != "AUTHORED_FRAME_BY_FRAME"
]
print(
    json.dumps(
        {
            "scenes": len(report),
            "failures": len(failures),
            "total_keys": sum(item["key_count"] for item in report),
            "output": str(out),
        },
        ensure_ascii=False,
    )
)
if failures:
    raise SystemExit(1)
