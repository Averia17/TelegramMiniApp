"""Inspect current super frame components likely belonging to Brock's right arm."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import inspect_brock_skinning as diagnostic

SCENE = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / "super.blend"
)
bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE))
scene = bpy.context.scene
mesh = bpy.data.objects["armor_GEO:PIV.001"]
report = diagnostic.frame_report(scene, mesh, 18)
forearm = next(
    i
    for i, x in enumerate(report["components"])
    if x["vertices"] == 95 and x["source_centroid"][0] > 0
)
items = []
for i, item in enumerate(report["components"]):
    if (
        item["source_centroid"][0] <= 0
        or item["source_centroid"][2] >= 1.2
        or item["vertices"] < 10
    ):
        continue
    gaps = [
        x["distance"]
        for x in report["joint_gaps"]
        if {x["left"], x["right"]} == {forearm, i}
    ]
    items.append(
        {
            "index": i,
            "vertices": item["vertices"],
            "owner": item["owner"],
            "source": item["source_centroid"],
            "bounds": item["deformed_bounds"],
            "gap": gaps[0] if gaps else None,
        }
    )
print(
    json.dumps(
        sorted(
            items, key=lambda x: (x["gap"] is not None, x["gap"] or -1), reverse=True
        ),
        ensure_ascii=False,
        indent=2,
    )
)
