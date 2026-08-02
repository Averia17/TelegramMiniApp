"""Numeric QA for the Fairy Mina focused animation scenes."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "scenes"
DIAGNOSTIC = ROOT / "artifacts" / "fairy-mina-rig-axis-diagnostic.json"
REPORT = ROOT / "artifacts" / "fairy-mina-animation-validation.json"
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
FRAME_ENDS = {
    "idle": 90,
    "run": 24,
    "attack": 18,
    "super": 55,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 14,
    "aim-gadget": 60,
}
CYCLES = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ROOT_Y_LIMITS = {
    "idle": (-0.04, 0.04),
    "run": (-0.04, 0.04),
    "attack": (-0.04, 0.04),
    "super": (-0.15, 0.15),
    "aim": (-0.04, 0.04),
    "aim-super": (-0.15, 0.04),
    "hit": (-0.04, 0.04),
    "death": (-0.38, 0.04),
    "spawn": (-0.24, 0.04),
    "victory": (-0.04, 0.15),
    "gadget": (-0.15, 0.15),
    "aim-gadget": (-0.15, 0.04),
}
TORSO_BONES = ("hips_s", "spine_upper_s", "chest_s")


def close(a, b, tolerance=1e-3):
    return abs(a - b) <= tolerance


def vector_values(vector):
    return tuple(float(value) for value in vector)


def world_point(armature, pose_bone):
    return armature.matrix_world @ pose_bone.head


def snapshot(armature):
    return {
        bone.name: {
            "location": vector_values(bone.location),
            "rotation": vector_values(bone.rotation_euler),
            "scale": vector_values(bone.scale),
        }
        for bone in armature.pose.bones
    }


def check_hand_side(clip, frame, armature, errors):
    """Keep each wrist on its own side of the torso in rig-relative space."""

    right_shoulder = armature.pose.bones.get("R_shoulder_s")
    left_shoulder = armature.pose.bones.get("L_shoulder_s")
    right_wrist = armature.pose.bones.get("R_wrist_s")
    left_wrist = armature.pose.bones.get("L_wrist_s")
    if not all((right_shoulder, left_shoulder, right_wrist, left_wrist)):
        errors.append(f"{clip}@{frame}: hand-side semantic bones are missing")
        return

    shoulder_span = world_point(armature, left_shoulder) - world_point(
        armature, right_shoulder
    )
    if shoulder_span.length < 1e-4:
        errors.append(f"{clip}@{frame}: shoulder span collapsed")
        return
    lateral = shoulder_span.normalized()
    torso_center = (
        world_point(armature, right_shoulder) + world_point(armature, left_shoulder)
    ) * 0.5
    right_offset = (world_point(armature, right_wrist) - torso_center).dot(lateral)
    left_offset = (world_point(armature, left_wrist) - torso_center).dot(lateral)
    if right_offset >= -0.005:
        errors.append(
            f"{clip}@{frame}: right wrist crossed torso center ({right_offset:.4f})"
        )
    if left_offset <= 0.005:
        errors.append(
            f"{clip}@{frame}: left wrist crossed torso center ({left_offset:.4f})"
        )


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def check_finite_and_limits(clip, armature, frame, errors):
    for bone in armature.pose.bones:
        for label, vector in snapshot(armature)[bone.name].items():
            if not all(math.isfinite(value) for value in vector):
                errors.append(f"{clip}@{frame}: {bone.name} {label} is non-finite")

    root = armature.pose.bones.get("hips_s")
    waterball = armature.pose.bones.get("waterball_s")
    if root is None or waterball is None:
        errors.append(f"{clip}@{frame}: required root bones are missing")
        return
    if abs(root.location.x) > 1e-4 or abs(root.location.z) > 1e-4:
        errors.append(f"{clip}@{frame}: hips_s local X/Z drift {tuple(root.location)}")
    low, high = ROOT_Y_LIMITS[clip]
    if not low - 1e-4 <= root.location.y <= high + 1e-4:
        errors.append(
            f"{clip}@{frame}: hips_s local Y/up {root.location.y:.4f} outside [{low}, {high}]"
        )
    for label, vector, expected in (
        ("location", waterball.location, (0.0, 0.0, 0.0)),
        ("rotation", waterball.rotation_euler, (0.0, 0.0, 0.0)),
        ("scale", waterball.scale, (1.0, 1.0, 1.0)),
    ):
        if any(not close(actual, wanted) for actual, wanted in zip(vector, expected)):
            errors.append(f"{clip}@{frame}: waterball_s {label} is not locked")

    torso_pitch = sum(
        math.degrees(armature.pose.bones[name].rotation_euler.x) for name in TORSO_BONES
    )
    if abs(torso_pitch) > 15.5:
        errors.append(
            f"{clip}@{frame}: torso pitch {torso_pitch:.2f} exceeds 15 degrees"
        )

    for name in ("hips_s", "spine_upper_s", "chest_s", "head_s"):
        bone = armature.pose.bones.get(name)
        if bone is None:
            errors.append(f"{clip}@{frame}: missing semantic bone {name}")
            continue
        values = tuple(math.degrees(value) for value in bone.rotation_euler)
        maximums = (
            (90.5, 360.5, 90.5)
            if name == "hips_s" and clip == "victory"
            else (90.5, 90.5, 90.5)
        )
        if any(abs(value) > maximum for value, maximum in zip(values, maximums)):
            errors.append(
                f"{clip}@{frame}: {name} rotation {values} exceeds safe body limit"
            )
    check_hand_side(clip, frame, armature, errors)


def validate_clip(clip, expected_bones):
    errors = []
    path = SCENES / f"{clip}.blend"
    if not path.exists():
        return {"clip": clip, "status": "FAIL", "errors": [f"missing {path}"]}
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None:
        return {"clip": clip, "status": "FAIL", "errors": ["no armature"]}

    expected_action = ACTION_NAMES[clip]
    actions = list(bpy.data.actions)
    if len(actions) != 1 or actions[0].name != expected_action:
        errors.append(
            f"actions={[(action.name, action.users) for action in actions]} expected only {expected_action}"
        )
    actual_bones = {bone.name for bone in armature.data.bones}
    if actual_bones != expected_bones:
        errors.append(
            f"bone set changed: missing={sorted(expected_bones - actual_bones)} extra={sorted(actual_bones - expected_bones)}"
        )
    if scene.render.fps != FPS:
        errors.append(f"fps={scene.render.fps} expected {FPS}")
    if scene.frame_start != 0 or scene.frame_end != FRAME_ENDS[clip]:
        errors.append(
            f"frame range={scene.frame_start}..{scene.frame_end} expected 0..{FRAME_ENDS[clip]}"
        )
    if (
        scene.get("hero_slug") != "fairy-mina"
        or scene.get("clip_name") != expected_action
    ):
        errors.append("scene metadata does not match hero/action")

    end = FRAME_ENDS[clip]
    snapshots = {}
    for frame in range(0, end + 1):
        scene.frame_set(frame)
        snapshots[frame] = snapshot(armature)
        check_finite_and_limits(clip, armature, frame, errors)
    if clip in CYCLES:
        first = snapshots[0]
        last = snapshots[end]
        for name in first:
            for key in ("location", "rotation", "scale"):
                if any(
                    not close(a, b) for a, b in zip(first[name][key], last[name][key])
                ):
                    errors.append(f"cycle mismatch {name}.{key}")

    action = actions[0] if len(actions) == 1 else None
    curves = action_fcurves(action) if action else []
    if not curves:
        errors.append("action has no F-curves")
    return {
        "clip": clip,
        "action": expected_action,
        "frames": [0, end],
        "fps": scene.render.fps,
        "curves": len(curves),
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
    }


def main():
    diagnostic = json.loads(DIAGNOSTIC.read_text(encoding="utf-8"))
    expected_bones = {item["name"] for item in diagnostic["bones"]}
    requested = os.environ.get("FAIRY_MINA_CLIP_FILTER")
    clips = [requested] if requested else list(ACTION_NAMES)
    unknown = [clip for clip in clips if clip not in ACTION_NAMES]
    if unknown:
        raise RuntimeError(f"unknown Fairy Mina clip filter: {unknown}")
    results = [validate_clip(clip, expected_bones) for clip in clips]
    payload = {
        "hero": "fairy-mina",
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
        raise RuntimeError("Fairy Mina animation validation failed")


if __name__ == "__main__":
    main()
