"""Numeric QA for the authored Needle focused animation scenes."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "needle" / "scenes"
REPORT = ROOT / "artifacts" / "needle-animation-validation.json"
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
    "idle": 80,
    "run": 24,
    "attack": 16,
    "super": 50,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 12,
    "aim-gadget": 60,
}
CYCLES = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ROOT_Y_LIMITS = {
    "idle": (-0.03, 0.03),
    "run": (0.0, 0.05),
    "attack": (-0.28, 0.0),
    "super": (0.0, 0.20),
    "aim": (0.05, 0.052),
    "aim-super": (0.0, 0.02),
    "hit": (-0.20, 0.0),
    "death": (-0.40, 0.07),
    "spawn": (-0.30, 0.0),
    "victory": (0.0, 0.25),
    "gadget": (-0.28, 0.04),
    "aim-gadget": (0.028, 0.032),
}


def close(a, b, tolerance=1e-3):
    return abs(a - b) <= tolerance


def values(armature):
    result = {}
    for bone in armature.pose.bones:
        result[bone.name] = {
            "location": tuple(float(v) for v in bone.location),
            "rotation": tuple(float(v) for v in bone.rotation_euler),
            "scale": tuple(float(v) for v in bone.scale),
        }
    return result


def check_pose_limits(clip, armature, frame, errors):
    for bone in armature.pose.bones:
        for label, vector in values(armature)[bone.name].items():
            if not all(math.isfinite(v) for v in vector):
                errors.append(f"{clip}@{frame}: {bone.name} {label} is non-finite")
    root = armature.pose.bones["Root"]
    if abs(root.location.x) > 1e-4 or abs(root.location.z) > 1e-4:
        errors.append(f"{clip}@{frame}: Root local X/Z drift {tuple(root.location)}")
    low, high = ROOT_Y_LIMITS.get(clip, (0.0, 0.0))
    if not low - 1e-4 <= root.location.y <= high + 1e-4:
        errors.append(
            f"{clip}@{frame}: Root local Y/world-up {root.location.y:.4f} outside [{low}, {high}]"
        )

    limits = {
        "Head": (40, 60, 20),
        "Spine": (80, 45, 45),
        "Chest": (60, 45, 45),
        "Hips": (90, 120, 90),
        "LeftArm": (180, 120, 120),
        "RightArm": (180, 120, 120),
        # NeedleRig has no LeftForearm/RightForearm bones; v3 forearm flexion
        # is folded into Hand X by the authoring adapter.
        "LeftHand": (180, 90, 90),
        "RightHand": (180, 90, 90),
        "LeftLeg": (100, 90, 90),
        "RightLeg": (100, 90, 90),
        "LeftFoot": (90, 90, 90),
        "RightFoot": (90, 90, 90),
    }
    # The event spec deliberately permits deeper collapse poses for these two
    # one-shot clips; keep the stricter limits for all other animations.
    if clip == "spawn":
        limits["Head"] = (40, 60, 20)
    for name, maximums in limits.items():
        values_deg = tuple(
            math.degrees(v) for v in armature.pose.bones[name].rotation_euler
        )
        for axis, (value, maximum) in enumerate(zip(values_deg, maximums)):
            if abs(value) > maximum + 0.5:
                errors.append(
                    f"{clip}@{frame}: {name} axis {axis}={value:.2f} exceeds {maximum}"
                )


def validate_clip(clip):
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
            f"actions={[(a.name, a.users) for a in actions]} expected only {expected_action}"
        )
    if scene.render.fps != FPS:
        errors.append(f"fps={scene.render.fps} expected {FPS}")
    if scene.frame_start != 0 or scene.frame_end != FRAME_ENDS[clip]:
        errors.append(
            f"frame range={scene.frame_start}..{scene.frame_end} expected 0..{FRAME_ENDS[clip]}"
        )
    if scene.get("hero_slug") != "needle" or scene.get("clip_name") != expected_action:
        errors.append("scene metadata does not match hero/action")

    sample_frames = sorted({0, FRAME_ENDS[clip], *(range(0, FRAME_ENDS[clip] + 1))})
    snapshots = {}
    for frame in sample_frames:
        scene.frame_set(frame)
        snapshots[frame] = values(armature)
        check_pose_limits(clip, armature, frame, errors)
    if clip in CYCLES:
        first = snapshots[0]
        last = snapshots[FRAME_ENDS[clip]]
        for name in first:
            for key in ("location", "rotation", "scale"):
                if any(
                    not close(a, b) for a, b in zip(first[name][key], last[name][key])
                ):
                    errors.append(f"cycle mismatch {name}.{key}")
    return {
        "clip": clip,
        "action": expected_action,
        "frames": [0, FRAME_ENDS[clip]],
        "fps": scene.render.fps,
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
    }


def main():
    results = [validate_clip(clip) for clip in ACTION_NAMES]
    payload = {
        "hero": "needle",
        "clips": results,
        "status": "PASS" if all(r["status"] == "PASS" for r in results) else "FAIL",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(payload, ensure_ascii=False))
    if payload["status"] != "PASS":
        raise RuntimeError("Needle animation validation failed")


if __name__ == "__main__":
    main()
