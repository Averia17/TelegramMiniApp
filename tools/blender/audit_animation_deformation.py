"""Detect frame-local mesh deformation spikes in focused hero scenes."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
CLIPS = (
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
)
HEROES = tuple(
    path.name
    for path in SOURCE.iterdir()
    if path.is_dir() and (path / f"{path.name}.blend").exists()
)


def bounds_for_scene(scene, depsgraph):
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    mesh_count = 0
    for obj in depsgraph.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        mesh_count += 1
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            minimum.x = min(minimum.x, point.x)
            minimum.y = min(minimum.y, point.y)
            minimum.z = min(minimum.z, point.z)
            maximum.x = max(maximum.x, point.x)
            maximum.y = max(maximum.y, point.y)
            maximum.z = max(maximum.z, point.z)
    if mesh_count == 0:
        return Vector((0.0, 0.0, 0.0))
    return maximum - minimum


def audit(path: Path):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    sizes = []
    for frame in range(int(scene.frame_start), int(scene.frame_end) + 1):
        scene.frame_set(frame)
        depsgraph.update()
        size = bounds_for_scene(scene, depsgraph)
        sizes.append((frame, size))
    baseline = max(0.0001, max(sizes[0][1]))
    max_ratio = 0.0
    max_ratio_frame = sizes[0][0]
    min_ratio = math.inf
    min_ratio_frame = sizes[0][0]
    for frame, size in sizes:
        ratio = max(size) / baseline
        if ratio > max_ratio:
            max_ratio = ratio
            max_ratio_frame = frame
        if ratio < min_ratio:
            min_ratio = ratio
            min_ratio_frame = frame
    return {
        "hero": scene.get("hero_slug"),
        "clip": scene.get("clip_name"),
        "file": str(path.relative_to(ROOT)),
        "frames": len(sizes),
        "baseline_max_dimension": round(baseline, 5),
        "max_dimension_ratio": round(max_ratio, 4),
        "max_dimension_frame": max_ratio_frame,
        "min_dimension_ratio": round(min_ratio, 4),
        "min_dimension_frame": min_ratio_frame,
        "status": "passed" if max_ratio < 2.5 and min_ratio > 0.35 else "review",
    }


report = [
    audit(SOURCE / hero / "scenes" / f"{clip}.blend")
    for hero in HEROES
    for clip in CLIPS
]
output = ROOT / "artifacts" / "hero-animation-deformation-audit.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
review = [item for item in report if item["status"] != "passed"]
print(json.dumps({"scenes": len(report), "review": len(review), "output": str(output)}, ensure_ascii=False))
