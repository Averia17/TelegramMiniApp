"""Deep semantic audit for Brock Zeus v2 scenes.

This audit samples every authored frame and checks the prompt's intent in the
measured rig space.  The earlier validator only checked finite values, ranges,
and cycle closure; this one also checks hand/cloud relationships, jumps,
non-uniform cloud stretches, spawn/death visibility, and action ownership.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
REPORT = ROOT / "artifacts" / "brock-zeus-animation-quality.json"

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
CYCLES = {"idle", "run", "aim", "aim-super", "aim-gadget"}


def world_point(armature, bone_name, end="tail"):
    bone = armature.pose.bones[bone_name]
    return armature.matrix_world @ Vector(getattr(bone, end))


def cloud_center(cloud):
    corners = [cloud.matrix_world @ Vector(corner) for corner in cloud.bound_box]
    return sum(corners, Vector()) / max(1, len(corners))


def cloud_extent(cloud):
    corners = [cloud.matrix_world @ Vector(corner) for corner in cloud.bound_box]
    size = Vector(
        (
            max(point.x for point in corners) - min(point.x for point in corners),
            max(point.y for point in corners) - min(point.y for point in corners),
            max(point.z for point in corners) - min(point.z for point in corners),
        )
    )
    return size


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    return [
        curve
        for layer in action.layers
        for strip in layer.strips
        for bag in getattr(strip, "channelbags", [])
        for curve in bag.fcurves
    ]


def sample(armature, locator, cloud):
    root = world_point(armature, "Root", "head")
    hips = world_point(armature, "Hips", "head")
    head = world_point(armature, "Head", "tail")
    right_hand = world_point(armature, "R_Wrist", "tail")
    left_hand = world_point(armature, "L_Wrist", "tail")
    cloud_position = cloud_center(cloud)
    cloud_size = cloud_extent(cloud)
    return {
        "root": tuple(root),
        "hips": tuple(hips),
        "head": tuple(head),
        "right_hand": tuple(right_hand),
        "left_hand": tuple(left_hand),
        "cloud": tuple(cloud_position),
        "cloud_size": tuple(cloud_size),
        "cloud_scale": tuple(cloud.scale),
        "right_hand_cloud_distance": (right_hand - cloud_position).length,
        "left_hand_hips_distance": (left_hand - hips).length,
        # Brock's measured scene uses Blender world Z as vertical.  World Y
        # is the depth axis and must not be used for height assertions.
        "cloud_head_height": cloud_position.z - head.z,
    }


def distance(a, b):
    return math.sqrt(sum((float(x) - float(y)) ** 2 for x, y in zip(a, b)))


def audit_clip(clip):
    path = SCENES / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects.get("brock-zeus-rig")
    locator = bpy.data.objects.get("Cloud_Locator")
    cloud = bpy.data.objects.get("Cloud")
    errors = []
    if not armature or not locator or not cloud:
        return {"clip": clip, "status": "FAIL", "errors": ["missing rig/cloud"]}

    frames = {}
    previous = None
    max_frame_jump = 0.0
    max_cloud_jump = 0.0
    for frame in range(FRAME_ENDS[clip] + 1):
        scene.frame_set(frame)
        current = sample(armature, locator, cloud)
        frames[frame] = current
        if previous is not None:
            max_frame_jump = max(
                max_frame_jump,
                max(
                    distance(current["right_hand"], previous["right_hand"]),
                    distance(current["left_hand"], previous["left_hand"]),
                ),
            )
            max_cloud_jump = max(
                max_cloud_jump,
                distance(current["cloud"], previous["cloud"]),
            )
        previous = current

    def require(condition, message):
        if not condition:
            errors.append(message)

    start = frames[0]
    end = frames[FRAME_ENDS[clip]]
    if clip in CYCLES:
        require(
            distance(start["cloud"], end["cloud"]) < 1e-4,
            "cloud position does not close",
        )
        require(
            distance(start["right_hand"], end["right_hand"]) < 1e-4,
            "right hand does not close",
        )
        require(
            distance(start["left_hand"], end["left_hand"]) < 1e-4,
            "left hand does not close",
        )

    if clip == "idle":
        require(
            frames[0]["right_hand_cloud_distance"] < 1.35,
            "idle: right hand is not interacting with cloud",
        )
        require(
            frames[0]["left_hand_hips_distance"] < 1.15,
            "idle: left hand is not at belt/hip",
        )
        require(
            frames[0]["cloud_head_height"] > 0.15,
            "idle: cloud is not above shoulder/head",
        )
    elif clip == "run":
        require(
            frames[0]["cloud"][2] > frames[0]["head"][2] - 0.15,
            "run: cloud is not elevated",
        )
        require(
            distance(frames[0]["cloud"], frames[6]["cloud"]) > 0.05,
            "run: cloud has no flight motion",
        )
    elif clip == "attack":
        require(
            frames[6]["right_hand_cloud_distance"] < 1.0,
            "attack: cloud does not reach right hand",
        )
        require(
            frames[8]["right_hand_cloud_distance"]
            > frames[6]["right_hand_cloud_distance"] + 0.25,
            "attack: cloud has no recoil",
        )
    elif clip == "super":
        require(
            frames[18]["cloud_head_height"] > 0.55,
            "super: cloud is not above head at jump peak",
        )
        require(
            0.0 <= frames[25]["cloud"][2] <= 0.55,
            "super: first lightning strike is not at ground level",
        )
        require(
            0.0 <= frames[30]["cloud"][2] <= 0.55,
            "super: second lightning strike is not at ground level",
        )
        require(
            0.0 <= frames[35]["cloud"][2] <= 0.55,
            "super: third lightning strike is not at ground level",
        )
        require(
            frames[30]["cloud"][0] < frames[25]["cloud"][0] - 0.25,
            "super: second strike does not move left",
        )
        require(
            frames[35]["cloud"][0] > frames[30]["cloud"][0] + 0.25,
            "super: third strike does not move right",
        )
    elif clip == "aim":
        size = frames[0]["cloud_size"]
        require(
            max(size) / max(min(size), 1e-6) > 1.2,
            "aim: cloud is not stretched toward target",
        )
        require(
            frames[0]["right_hand_cloud_distance"] < 1.55,
            "aim: cloud is not over the hand",
        )
    elif clip == "aim-super":
        require(
            frames[0]["cloud_head_height"] < 0.75,
            "aim-super: cloud is not pulled into chest sphere",
        )
        require(
            frames[30]["cloud_size"][1] > frames[0]["cloud_size"][1] * 1.1,
            "aim-super: cloud does not pulse",
        )
    elif clip == "hit":
        require(
            frames[3]["cloud"][0] > start["cloud"][0] + 0.25,
            "hit: cloud is not knocked right",
        )
        require(
            frames[3]["cloud"][2] > start["cloud"][2] + 0.5,
            "hit: cloud is not knocked upward",
        )
        require(
            distance(frames[7]["cloud"], end["cloud"]) < 0.6,
            "hit: cloud does not return to shoulder",
        )
    elif clip == "death":
        require(
            max(frames[25]["cloud_scale"]) < 0.05, "death: cloud does not disappear"
        )
        require(
            frames[15]["cloud"][2] > start["cloud"][2] + 0.8,
            "death: cloud does not rise",
        )
    elif clip == "spawn":
        require(
            max(frames[0]["cloud_scale"]) < 0.05,
            "spawn: cloud is visible before materialization",
        )
        require(
            max(frames[10]["cloud_scale"]) > max(start["cloud_scale"]) * 1.3,
            "spawn: cloud does not envelop character",
        )
        require(
            frames[18]["cloud"][0] > start["cloud"][0] + 0.6,
            "spawn: cloud does not clear to the side",
        )
    elif clip == "victory":
        require(
            max(frames[10]["cloud_scale"]) > max(start["cloud_scale"]) * 1.3,
            "victory: cloud does not swell",
        )
        require(
            frames[20]["cloud"][0] < start["cloud"][0] - 0.5,
            "victory: cloud has no left strike",
        )
        require(
            frames[28]["cloud"][0] > start["cloud"][0] + 0.5,
            "victory: cloud has no right strike",
        )
        require(
            0.0 <= frames[20]["cloud"][2] <= 0.8,
            "victory: left strike is not near ground",
        )
        require(
            0.0 <= frames[28]["cloud"][2] <= 0.8,
            "victory: right strike is not near ground",
        )
    elif clip == "gadget":
        size = frames[4]["cloud_size"]
        require(
            size[0] / max(min(size[1], size[2]), 1e-6) > 1.8,
            "gadget: cloud is not stretched into a beam",
        )
        require(
            frames[4]["right_hand_cloud_distance"] < 1.0,
            "gadget: cloud is not attached to hand",
        )
    elif clip == "aim-gadget":
        require(
            distance(frames[0]["cloud"], frames[30]["cloud"]) > 0.25,
            "aim-gadget: cloud does not orbit hand",
        )
        require(
            frames[30]["cloud"][2] > frames[0]["cloud"][2],
            "aim-gadget: cloud does not spiral upward",
        )
        require(
            0.8 <= frames[0]["cloud"][2] <= 1.4,
            "aim-gadget: cloud starts outside the hand spiral",
        )
        require(
            1.2 <= frames[30]["cloud"][2] <= 1.8,
            "aim-gadget: cloud peak is outside the target spiral",
        )

    cloud_actions = [
        action
        for action in bpy.data.actions
        if action.name
        in {f"Cloud_{scene.get('clip_name')}", f"CloudLocator_{scene.get('clip_name')}"}
    ]
    require(len(cloud_actions) == 2, "missing dedicated cloud actions")
    scale_tracks = []
    for action in cloud_actions:
        for curve in action_curves(action):
            if curve.data_path == "scale":
                scale_tracks.append(
                    tuple(point.co[1] for point in curve.keyframe_points)
                )
    if clip in {"aim", "gadget"}:
        require(
            any(
                len(set(round(value, 4) for value in track)) > 1
                for track in scale_tracks
            ),
            "cloud stretch scale is not animated",
        )

    return {
        "clip": clip,
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "max_hand_jump": round(max_frame_jump, 6),
        "max_cloud_jump": round(max_cloud_jump, 6),
        "key_frames": {
            str(frame): frames[frame]
            for frame in sorted(
                set([0, 3, 6, 8, 10, 15, 18, 20, 25, 28, 30, 35, 40, 45, 50, 60, 80])
                & set(frames)
            )
        },
    }


def main():
    requested = os.environ.get("BROCK_CLIP_FILTER")
    clips = [requested] if requested else list(FRAME_ENDS)
    results = [audit_clip(clip) for clip in clips]
    payload = {
        "hero": "brock-zeus",
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
                "clips": {item["clip"]: item["status"] for item in results},
                "report": os.fspath(REPORT),
            },
            ensure_ascii=False,
        )
    )
    if payload["status"] != "PASS":
        raise RuntimeError("Brock Zeus semantic animation audit failed")


if __name__ == "__main__":
    main()
