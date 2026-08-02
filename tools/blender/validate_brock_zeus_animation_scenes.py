"""Numeric QA for Brock Zeus v2 focused scenes and cloud companion."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
REPORT = ROOT / "artifacts" / "brock-zeus-animation-validation.json"
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
ROOT_Y_LIMITS = {
    "idle": (-0.03, 0.03),
    "run": (-0.02, 0),
    "attack": (0, 0),
    "super": (-0.20, 0.20),
    "aim": (0, 0),
    "aim-super": (-0.16, -0.16),
    "hit": (0, 0),
    "death": (-0.34, 0),
    "spawn": (-0.28, 0),
    "victory": (0, 0.15),
    "gadget": (0, 0),
    "aim-gadget": (-0.10, -0.10),
}
BONES = {
    "Head": (70, 70, 50),
    "Spine": (55, 45, 45),
    "Chest": (45, 45, 45),
    "Hips": (70, 90, 70),
    "L_Shoulder": (100, 90, 90),
    "R_Shoulder": (100, 90, 90),
    "L_Elbow": (110, 90, 90),
    "R_Elbow": (110, 90, 90),
    "L_Wrist": (100, 90, 90),
    "R_Wrist": (100, 90, 90),
    "L_UpperLeg": (95, 80, 70),
    "R_UpperLeg": (95, 80, 70),
    "L_LowerLeg": (95, 80, 70),
    "R_LowerLeg": (95, 80, 70),
}


def close(a, b, tolerance=1e-3):
    return abs(float(a) - float(b)) <= tolerance


def vec(value):
    return tuple(float(component) for component in value)


def check_finite(values, label, clip, frame, errors):
    if not all(math.isfinite(float(value)) for value in values):
        errors.append(f"{clip}@{frame}: {label} is non-finite")


def snapshot(armature, locator, cloud):
    return {
        "bones": {
            bone.name: {
                "location": vec(bone.location),
                "rotation": vec(bone.rotation_euler),
                "scale": vec(bone.scale),
            }
            for bone in armature.pose.bones
        },
        "locator": {
            "location": vec(locator.location),
            "rotation": vec(locator.rotation_euler),
            "scale": vec(locator.scale),
        },
        "cloud": {
            "location": vec(cloud.location),
            "rotation": vec(cloud.rotation_euler),
            "scale": vec(cloud.scale),
        },
    }


def validate_frame(clip, frame, armature, locator, cloud, errors):
    root = armature.pose.bones["Root"]
    check_finite(root.location, "Root.location", clip, frame, errors)
    if abs(root.location.x) > 1e-4 or abs(root.location.z) > 1e-4:
        errors.append(f"{clip}@{frame}: Root local X/Z drift {tuple(root.location)}")
    low, high = ROOT_Y_LIMITS[clip]
    if not low - 1e-4 <= root.location.y <= high + 1e-4:
        errors.append(
            f"{clip}@{frame}: Root local Y {root.location.y:.4f} outside [{low}, {high}]"
        )
    for bone in armature.pose.bones:
        check_finite(bone.location, f"{bone.name}.location", clip, frame, errors)
        check_finite(bone.rotation_euler, f"{bone.name}.rotation", clip, frame, errors)
        check_finite(bone.scale, f"{bone.name}.scale", clip, frame, errors)
    for name, maximums in BONES.items():
        values = tuple(
            math.degrees(value) for value in armature.pose.bones[name].rotation_euler
        )
        for axis, (value, maximum) in enumerate(zip(values, maximums)):
            if abs(value) > maximum + 0.5:
                errors.append(
                    f"{clip}@{frame}: {name} axis {axis}={value:.2f} exceeds {maximum}"
                )
    check_finite(locator.location, "Cloud_Locator.location", clip, frame, errors)
    check_finite(cloud.location, "Cloud.location", clip, frame, errors)
    check_finite(cloud.rotation_euler, "Cloud.rotation", clip, frame, errors)
    check_finite(cloud.scale, "Cloud.scale", clip, frame, errors)
    if any(value < -1e-4 for value in cloud.scale):
        errors.append(
            f"{clip}@{frame}: Cloud scale became negative {tuple(cloud.scale)}"
        )


def action_names():
    return {action.name for action in bpy.data.actions}


def validate_clip(clip):
    errors = []
    path = SCENES / f"{clip}.blend"
    if not path.exists():
        return {"clip": clip, "status": "FAIL", "errors": [f"missing {path}"]}
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects.get("brock-zeus-rig")
    locator = bpy.data.objects.get("Cloud_Locator")
    cloud = bpy.data.objects.get("Cloud")
    if not armature or not locator or not cloud:
        return {
            "clip": clip,
            "status": "FAIL",
            "errors": ["missing rig/cloud hierarchy"],
        }
    expected = ACTION_NAMES[clip]
    names = action_names()
    if expected not in names:
        errors.append(f"missing armature Action {expected}; actions={sorted(names)}")
    if scene.render.fps != FPS:
        errors.append(f"fps={scene.render.fps} expected {FPS}")
    if scene.frame_start != 0 or scene.frame_end != FRAME_ENDS[clip]:
        errors.append(
            f"frame range={scene.frame_start}..{scene.frame_end} expected 0..{FRAME_ENDS[clip]}"
        )
    if scene.get("hero_slug") != "brock-zeus" or scene.get("clip_name") != expected:
        errors.append("scene metadata does not match hero/action")
    if (
        locator.parent != armature
        or locator.parent_type != "BONE"
        or locator.parent_bone != "Root"
    ):
        errors.append("Cloud_Locator is not parented to brock-zeus-rig Root bone")
    if cloud.parent != locator:
        errors.append("Cloud is not parented to Cloud_Locator")

    snapshots = {}
    for frame in range(0, FRAME_ENDS[clip] + 1):
        scene.frame_set(frame)
        snapshots[frame] = snapshot(armature, locator, cloud)
        validate_frame(clip, frame, armature, locator, cloud, errors)
    if clip in CYCLES:
        first = snapshots[0]
        last = snapshots[FRAME_ENDS[clip]]
        for key in ("location", "scale"):
            for component_a, component_b in zip(
                first["locator"][key], last["locator"][key]
            ):
                if not close(component_a, component_b):
                    errors.append(f"cycle mismatch Cloud_Locator.{key}")
            for component_a, component_b in zip(
                first["cloud"][key], last["cloud"][key]
            ):
                if not close(component_a, component_b):
                    errors.append(f"cycle mismatch Cloud.{key}")
        rotation_delta = (
            snapshots[FRAME_ENDS[clip]]["cloud"]["rotation"][2]
            - first["cloud"]["rotation"][2]
        )
        if (
            abs(
                (rotation_delta / (2 * math.pi)) - round(rotation_delta / (2 * math.pi))
            )
            > 1e-3
        ):
            errors.append(
                f"cloud rotation does not close by full turns: {rotation_delta}"
            )
        for name in first["bones"]:
            for key in ("location", "rotation", "scale"):
                if any(
                    not close(a, b)
                    for a, b in zip(first["bones"][name][key], last["bones"][name][key])
                ):
                    errors.append(f"cycle mismatch {name}.{key}")
    return {
        "clip": clip,
        "action": expected,
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "frames": [0, FRAME_ENDS[clip]],
        "fps": scene.render.fps,
        "actions": sorted(names),
    }


def main():
    requested = os.environ.get("BROCK_CLIP_FILTER")
    clips = [requested] if requested else list(ACTION_NAMES)
    results = [validate_clip(clip) for clip in clips]
    payload = {
        "hero": "brock-zeus",
        "clips": results,
        "status": (
            "PASS" if all(result["status"] == "PASS" for result in results) else "FAIL"
        ),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(payload, ensure_ascii=False))
    if payload["status"] != "PASS":
        raise RuntimeError("Brock Zeus animation validation failed")


if __name__ == "__main__":
    main()
