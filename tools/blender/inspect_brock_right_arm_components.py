"""List every positive-X R_Wrist island and its gap to the right forearm."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import inspect_brock_skinning as diagnostic

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
TARGETS = {
    "idle": [0, 40],
    "attack": [3, 6, 10],
    "super": [18, 25],
    "aim": [0, 18, 60],
    "death": [8, 15],
    "victory": [10, 20],
    "gadget": [10],
    "aim-gadget": [41],
}


def main():
    result = {}
    for clip, frames in TARGETS.items():
        bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENES / f"{clip}.blend"))
        scene = bpy.context.scene
        mesh = bpy.data.objects["armor_GEO:PIV.001"]
        for frame in frames:
            report = diagnostic.frame_report(scene, mesh, frame)
            forearm_index = next(
                index
                for index, item in enumerate(report["components"])
                if item["vertices"] == 95 and item["owner"] == "R_Elbow"
            )
            forearm_points = None
            entries = []
            for index, item in enumerate(report["components"]):
                if (
                    item["owner"] not in {"R_Wrist", "R_Elbow"}
                    or item["source_centroid"][0] <= 0
                    or item["vertices"] < 10
                ):
                    continue
                gaps = [
                    pair["distance"]
                    for pair in report["joint_gaps"]
                    if {pair["left"], pair["right"]} == {forearm_index, index}
                ]
                entries.append(
                    {
                        "index": index,
                        "owner": item["owner"],
                        "vertices": item["vertices"],
                        "gap": gaps[0] if gaps else None,
                        "source_centroid": item["source_centroid"],
                        "bounds": item["deformed_bounds"],
                    }
                )
            result[f"{clip}:{frame}"] = sorted(
                entries,
                key=lambda item: item["gap"] if item["gap"] is not None else -1,
                reverse=True,
            )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
