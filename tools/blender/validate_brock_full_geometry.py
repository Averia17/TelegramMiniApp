"""Full-frame geometry regression for Brock Zeus.

The animation validator checks actions and semantic cloud motion.  This
diagnostic checks the evaluated skinned mesh at every authored frame so a
detached limb cannot hide behind a passing action name or a single screenshot.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
REPORT = ROOT / "artifacts" / "brock-zeus-full-geometry.json"

FRAME_ENDS = {
    "idle": 80,
    "run": 20,
    "attack": 16,
    "super": 50,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 16,
    "aim-gadget": 60,
}

# These owner pairs are the actual deformation seams.  A nearest-point gap
# between the groups remains meaningful even though each hard-surface prop is
# a separate disconnected mesh island.
JOINT_PAIRS = (
    ("Chest", "L_Shoulder"),
    ("R_Shoulder", "R_Elbow"),
    ("R_Elbow", "R_Wrist"),
    ("L_Shoulder", "L_Elbow"),
    ("L_Elbow", "L_Wrist"),
    ("Root", "L_UpperLeg"),
    ("Root", "R_UpperLeg"),
)
MAX_ALLOWED_GAP = 0.12
MAX_ALLOWED_LEFT_ARM_GAP = 0.03


def weight_owner(mesh, vertex_index):
    vertex = mesh.data.vertices[vertex_index]
    weights = []
    for group in vertex.groups:
        try:
            weights.append((mesh.vertex_groups[group.group].name, float(group.weight)))
        except RuntimeError:
            continue
    return max(weights, key=lambda item: item[1])[0] if weights else None


def min_gap(points_a, points_b):
    if not points_a or not points_b:
        return math.inf
    if len(points_a) > len(points_b):
        points_a, points_b = points_b, points_a
    tree = KDTree(len(points_b))
    for index, point in enumerate(points_b):
        tree.insert(point, index)
    tree.balance()
    return min(tree.find(point)[2] for point in points_a)


def frame_gaps(scene, mesh, owner_indices, frame):
    scene.frame_set(frame)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        world_points = [
            evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices
        ]
        grouped = {
            owner: [world_points[index] for index in indices]
            for owner, indices in owner_indices.items()
        }
        return {
            f"{left}->{right}": round(
                float(min_gap(grouped.get(left, []), grouped.get(right, []))), 6
            )
            for left, right in JOINT_PAIRS
        }
    finally:
        evaluated.to_mesh_clear()


def audit_clip(clip):
    path = SCENES / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    mesh = bpy.data.objects.get("armor_GEO:PIV.001")
    armature = bpy.data.objects.get("brock-zeus-rig")
    cloud = bpy.data.objects.get("Cloud")
    locator = bpy.data.objects.get("Cloud_Locator")
    if not mesh or not armature or not cloud or not locator:
        return {"clip": clip, "status": "FAIL", "errors": ["missing Brock objects"]}

    owner_indices = {}
    for index in range(len(mesh.data.vertices)):
        owner = weight_owner(mesh, index)
        if owner:
            owner_indices.setdefault(owner, []).append(index)

    max_gaps = {f"{left}->{right}": (0.0, 0) for left, right in JOINT_PAIRS}
    failing_frames = []
    for frame in range(FRAME_ENDS[clip] + 1):
        gaps = frame_gaps(scene, mesh, owner_indices, frame)
        frame_failure = {}
        for pair, gap in gaps.items():
            if math.isfinite(gap) and gap > max_gaps[pair][0]:
                max_gaps[pair] = (gap, frame)
            allowed_gap = (
                MAX_ALLOWED_LEFT_ARM_GAP
                if pair == "L_Shoulder->L_Elbow"
                else MAX_ALLOWED_GAP
            )
            if math.isfinite(gap) and gap > allowed_gap:
                frame_failure[pair] = gap
            if pair == "R_Elbow->R_Wrist" and not math.isfinite(gap):
                frame_failure[pair] = "missing deform seam"
        if frame_failure:
            failing_frames.append({"frame": frame, "gaps": frame_failure})

    return {
        "clip": clip,
        "status": "PASS" if not failing_frames else "FAIL",
        "max_joint_gaps": {
            pair: {"gap": round(gap, 6), "frame": frame}
            for pair, (gap, frame) in max_gaps.items()
        },
        "failing_frames": failing_frames,
        "frames_checked": FRAME_ENDS[clip] + 1,
        "cloud_hierarchy": {
            "parent": cloud.parent.name if cloud.parent else None,
            "locator_parent": locator.parent.name if locator.parent else None,
            "locator_parent_bone": locator.parent_bone,
        },
    }


def main():
    requested = os.environ.get("BROCK_CLIP_FILTER")
    clips = [requested] if requested else list(FRAME_ENDS)
    results = [audit_clip(clip) for clip in clips]
    payload = {
        "hero": "brock-zeus",
        "threshold": MAX_ALLOWED_GAP,
        "status": (
            "PASS" if all(item["status"] == "PASS" for item in results) else "FAIL"
        ),
        "clips": results,
    }
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": payload["status"],
                "frames_checked": sum(
                    item.get("frames_checked", 0) for item in results
                ),
                "clips": {item["clip"]: item["status"] for item in results},
                "report": os.fspath(REPORT),
            },
            ensure_ascii=False,
        )
    )
    if payload["status"] != "PASS":
        raise RuntimeError("Brock full-frame geometry regression failed")


if __name__ == "__main__":
    main()
