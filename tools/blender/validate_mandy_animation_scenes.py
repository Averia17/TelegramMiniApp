"""Numeric QA for Mandy's twelve focused animation scenes."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "scenes"
REPORT = ROOT / "artifacts" / "mandy-animation-validation.json"
FPS = 30

ACTION_NAMES = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
    "gadget": "Gadget",
    "aim-gadget": "AimGadget",
}
FRAME_DURATIONS = {
    "idle": 90,
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
ROOT_Z_LIMITS = {
    "super": (-0.20, 0.20),
    "aim-super": (-0.20, -0.20),
    "death": (-0.35, 0.0),
    "spawn": (-0.30, 0.0),
    "victory": (0.0, 0.15),
    "gadget": (-0.20, 0.0),
    "aim-gadget": (-0.10, -0.10),
}
BONES = {
    "root": "Root_2_01",
    "head": "head_s_035",
    "upper_l": "L_shoulder_s_044",
    "elbow_l": "L_elbow_s_045",
    "hand_l": "L_wrist_s_047",
    "upper_r": "R_shoulder_s_061",
    "elbow_r": "R_elbow_s_062",
    "hand_r": "R_wrist_s_064",
    "thigh_l": "L_upperLeg_s_03",
    "shin_l": "L_lowerLeg_s_04",
    "foot_l": "L_ankle_s_05",
    "thigh_r": "R_upperLeg_s_07",
    "shin_r": "R_lowerLeg_s_08",
    "foot_r": "R_ankle_s_09",
}


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def close(a, b, tolerance=1e-3):
    return abs(a - b) <= tolerance


def values(armature):
    return {
        bone.name: {
            "location": tuple(float(value) for value in bone.location),
            "rotation": tuple(float(value) for value in bone.rotation_euler),
            "scale": tuple(float(value) for value in bone.scale),
        }
        for bone in armature.pose.bones
    }


def check_frame(clip, frame, armature, errors):
    snapshot = values(armature)
    for name, channels in snapshot.items():
        for channel, vector in channels.items():
            if not all(math.isfinite(value) for value in vector):
                errors.append(f"{clip}@{frame}: {name}.{channel} is non-finite")

    root = armature.pose.bones[BONES["root"]]
    if abs(root.location.x) > 1e-4 or abs(root.location.y) > 1e-4:
        errors.append(f"{clip}@{frame}: Root X/Y drift {tuple(root.location)}")
    low, high = ROOT_Z_LIMITS.get(clip, (0.0, 0.0))
    if not low - 1e-4 <= root.location.z <= high + 1e-4:
        errors.append(
            f"{clip}@{frame}: Root Z {root.location.z:.4f} outside [{low}, {high}]"
        )

    for semantic in ("foot_l", "foot_r"):
        foot = armature.pose.bones[BONES[semantic]]
        if any(abs(value) > 1e-4 for value in foot.location):
            errors.append(
                f"{clip}@{frame}: {semantic} location changed; FK foot slide must use rotations"
            )

    limits = {
        "head_s_035": (60, 60, 45),
        "L_shoulder_s_044": (180, 140, 140),
        "R_shoulder_s_061": (180, 140, 140),
        "L_elbow_s_045": (180, 180, 180),
        "R_elbow_s_062": (180, 180, 180),
        "L_wrist_s_047": (180, 180, 360),
        "R_wrist_s_064": (180, 180, 360),
        "L_upperLeg_s_03": (100, 90, 90),
        "R_upperLeg_s_07": (100, 90, 90),
        "L_lowerLeg_s_04": (120, 120, 120),
        "R_lowerLeg_s_08": (120, 120, 120),
    }
    if clip == "victory":
        # Victory intentionally spins the staff three full turns through the
        # weapon wrist (0 -> 1080 degrees in the authored brief).
        limits["R_wrist_s_064"] = (180, 180, 1080)
    for name, maximums in limits.items():
        degrees = tuple(
            math.degrees(value) for value in armature.pose.bones[name].rotation_euler
        )
        for axis, (value, maximum) in enumerate(zip(degrees, maximums)):
            if abs(value) > maximum + 0.5:
                errors.append(
                    f"{clip}@{frame}: {name} axis {axis}={value:.2f} exceeds {maximum}"
                )

    return snapshot


def validate_clip(clip):
    errors = []
    duration = FRAME_DURATIONS[clip]
    path = SCENES / f"{clip}.blend"
    if not path.exists():
        return {"clip": clip, "status": "FAIL", "errors": [f"missing {path}"]}
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects.get("MandyRig")
    if armature is None:
        return {"clip": clip, "status": "FAIL", "errors": ["no MandyRig"]}
    expected_action = ACTION_NAMES[clip]
    actions = list(bpy.data.actions)
    if len(actions) != 1 or actions[0].name != expected_action:
        errors.append(
            f"actions={[(action.name, action.users) for action in actions]} expected only {expected_action}"
        )
    if scene.render.fps != FPS:
        errors.append(f"fps={scene.render.fps} expected {FPS}")
    if scene.frame_start != 1 or scene.frame_end != duration:
        errors.append(
            f"timeline={scene.frame_start}..{scene.frame_end} expected 1..{duration}"
        )
    if scene.get("keyframe_end") != duration + 1:
        errors.append(
            f"keyframe_end={scene.get('keyframe_end')} expected {duration + 1}"
        )
    if scene.get("hero_slug") != "mandy" or scene.get("clip_name") != expected_action:
        errors.append("scene metadata does not match Mandy/action")
    pivot = bpy.data.objects.get("MandyStaff_SourcePivot")
    if pivot is None or pivot.parent_bone != "R_wrist_s_064":
        errors.append("staff is not parented to R_wrist_s_064")
    if (
        scene.get("foot_motion_contract")
        != "FK foot slide allowed only in attack/super/hit; no IK targets"
    ):
        errors.append("foot motion contract is missing or changed")

    action = actions[0] if actions else None
    frames = (
        [key.co[0] for curve in action_fcurves(action) for key in curve.keyframe_points]
        if action
        else []
    )
    if frames and (min(frames) != 1 or max(frames) != duration + 1):
        errors.append(
            f"action range={min(frames)}..{max(frames)} expected 1..{duration + 1}"
        )

    snapshots = {}
    for frame in range(1, duration + 2):
        scene.frame_set(frame)
        snapshots[frame] = check_frame(clip, frame, armature, errors)
    if clip in CYCLES:
        first = snapshots[1]
        last = snapshots[duration + 1]
        for name in first:
            for channel in ("location", "rotation", "scale"):
                if any(
                    not close(a, b)
                    for a, b in zip(first[name][channel], last[name][channel])
                ):
                    errors.append(f"cycle mismatch {name}.{channel}")
    return {
        "clip": clip,
        "action": expected_action,
        "timeline": [1, duration],
        "action_frames": [1, duration + 1],
        "fps": scene.render.fps,
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
    }


def main():
    results = [validate_clip(clip) for clip in ACTION_NAMES]
    payload = {
        "hero": "mandy",
        "clips": results,
        "status": (
            "PASS" if all(item["status"] == "PASS" for item in results) else "FAIL"
        ),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(payload, ensure_ascii=False))
    if payload["status"] != "PASS":
        raise RuntimeError("Mandy animation validation failed")


if __name__ == "__main__":
    main()
