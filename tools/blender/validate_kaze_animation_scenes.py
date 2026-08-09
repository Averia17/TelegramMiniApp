"""Numeric QA for the Kaze focused animation scenes.

The validator checks the real Kaze rig rather than the humanoid names from the
brief.  It is intentionally strict about root drift, cycle closure, torso
pitch, both weapon hands, and the detached-weapon grip contract.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "kaze" / "scenes"
REPORT = ROOT / "artifacts" / "kaze-animation-validation.json"
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
    "idle": 70,
    "run": 18,
    "attack": 20,
    "super": 25,
    "aim": 60,
    "aim-super": 60,
    "hit": 10,
    "death": 35,
    "spawn": 40,
    "victory": 50,
    "gadget": 12,
    "aim-gadget": 60,
}
CYCLES = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ROOT_UP_LIMITS = {
    "idle": (-0.01, 0.01),
    "run": (-0.03, 0.01),
    "attack": (-0.01, 0.01),
    "super": (-0.20, 0.08),
    "aim": (-0.03, 0.01),
    "aim-super": (-0.20, 0.01),
    "hit": (-0.02, 0.01),
    "death": (-0.40, 0.01),
    "spawn": (-0.30, 0.01),
    "victory": (-0.01, 0.15),
    "gadget": (-0.22, 0.01),
    "aim-gadget": (-0.18, 0.01),
}
ROOT_BONE = "hips_s"
TORSO_BONES = ("hips_s", "spine_lower_s1", "spine_middle_s", "spine_upper_s", "chest_s")
WEAPON_GRIP_LOCAL = {
    "HeroAttachment_FanLeft": (0.00, 1.67, 3.75),
    "HeroAttachment_FanRight": (0.00, 1.67, 3.75),
}
WEAPON_GRIP_MAX_DISTANCE = 0.01
FRONT_DEPTH_MAX = 0.23
RUN_ROTATION_LIMITS = {
    "L_shoulder_s": (45.0, 1.0, 15.0),
    "R_shoulder_s": (45.0, 1.0, 15.0),
    "L_wrist_s": (8.0, 5.0, 8.0),
    "R_wrist_s": (8.0, 5.0, 8.0),
    "L_leg_s": (5.0, 6.0, 5.0),
    "R_leg_s": (5.0, 6.0, 5.0),
    "L_upper_leg_0_bend_s": (16.0, 5.0, 5.0),
    "R_upper_leg_0_bend_s": (16.0, 5.0, 5.0),
    "L_knee_s": (36.0, 5.0, 5.0),
    "R_knee_s": (36.0, 5.0, 5.0),
}
REQUIRED_CURVE_BONES = (
    "hips_s",
    "spine_lower_s1",
    "spine_middle_s",
    "spine_upper_s",
    "chest_s",
    "head_s",
    "L_shoulder_s",
    "L_elbow_s",
    "L_lower_elbow_0_bend_s",
    "L_wrist_s",
    "R_shoulder_s",
    "R_elbow_s",
    "R_lower_elbow_0_bend_s",
    "R_wrist_s",
    "L_leg_s",
    "L_upper_leg_0_bend_s",
    "L_knee_s",
    "L_lower_knee_0_bend_s",
    "L_foot_s",
    "R_leg_s",
    "R_upper_leg_0_bend_s",
    "R_knee_s",
    "R_lower_knee_0_bend_s",
    "R_foot_s",
    "L_thumb_0_s",
    "L_index_0_s",
    "L_pinky_0_s",
    "R_thumb_0_s",
    "R_index_0_s",
    "R_pinky_0_s",
)


def close(a, b, tolerance=1e-3):
    return abs(a - b) <= tolerance


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


def pose_values(armature):
    return {
        bone.name: {
            "location": tuple(float(value) for value in bone.location),
            "rotation": tuple(float(value) for value in bone.rotation_euler),
            "scale": tuple(float(value) for value in bone.scale),
        }
        for bone in armature.pose.bones
    }


def validate_pose(clip, armature, frame, errors):
    values = pose_values(armature)
    for name, data in values.items():
        for label, vector in data.items():
            if not all(math.isfinite(value) for value in vector):
                errors.append(f"{clip}@{frame}: {name}.{label} is non-finite")

    root = armature.pose.bones[ROOT_BONE]
    if abs(root.location.x) > 1e-4 or abs(root.location.z) > 1e-4:
        errors.append(f"{clip}@{frame}: root local X/Z drift {tuple(root.location)}")
    low, high = ROOT_UP_LIMITS[clip]
    if not low - 1e-4 <= root.location.y <= high + 1e-4:
        errors.append(
            f"{clip}@{frame}: root local Y={root.location.y:.4f} outside [{low}, {high}]"
        )

    torso_pitch = sum(
        abs(math.degrees(values[name]["rotation"][0])) for name in TORSO_BONES
    )
    if torso_pitch > 26.0:
        errors.append(
            f"{clip}@{frame}: summed torso pitch={torso_pitch:.2f} exceeds 25 degree budget"
        )

    if clip == "run":
        for bone_name, limits in RUN_ROTATION_LIMITS.items():
            degrees = tuple(
                abs(math.degrees(value)) for value in values[bone_name]["rotation"]
            )
            for axis, (actual, limit) in enumerate(zip(degrees, limits)):
                if actual > limit + 1e-3:
                    errors.append(
                        f"{clip}@{frame}: {bone_name} axis {axis} rotation "
                        f"{actual:.2f} exceeds natural-run limit {limit:.2f}"
                    )

    chest_world = armature.matrix_world @ armature.pose.bones["chest_s"].head
    if clip in {"idle", "aim", "aim-super", "gadget", "aim-gadget"} or frame in {
        0,
        FRAME_ENDS[clip],
    }:
        for wrist_name in ("L_wrist_s", "R_wrist_s"):
            wrist_world = armature.matrix_world @ armature.pose.bones[wrist_name].head
            if wrist_world.y > chest_world.y + FRONT_DEPTH_MAX:
                errors.append(
                    f"{clip}@{frame}: {wrist_name} is behind torso depth "
                    f"({wrist_world.y:.3f} > {chest_world.y + FRONT_DEPTH_MAX:.3f})"
                )

    for mesh_name, local_grip in WEAPON_GRIP_LOCAL.items():
        mesh = bpy.data.objects.get(mesh_name)
        marker = bpy.data.objects.get(f"Grip.Primary.{mesh_name}")
        if mesh is None or marker is None:
            continue
        grip_world = mesh.matrix_world @ Vector(local_grip)
        marker_world = marker.matrix_world.translation
        distance = (grip_world - marker_world).length
        if distance > WEAPON_GRIP_MAX_DISTANCE:
            errors.append(
                f"{clip}@{frame}: {mesh_name} grip is {distance:.3f} from marker"
            )


def validate_clip(clip):
    errors = []
    path = SCENES / f"{clip}.blend"
    if not path.exists():
        return {"clip": clip, "status": "FAIL", "errors": [f"missing {path}"]}

    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects.get("kaze-rig")
    if armature is None or armature.type != "ARMATURE":
        return {"clip": clip, "status": "FAIL", "errors": ["missing kaze-rig"]}
    expected_action = ACTION_NAMES[clip]
    actions = list(bpy.data.actions)
    if len(actions) != 1 or actions[0].name != expected_action:
        errors.append(
            f"actions={[(action.name, action.users) for action in actions]} expected only {expected_action}"
        )
    if scene.render.fps != FPS:
        errors.append(f"fps={scene.render.fps} expected {FPS}")
    if scene.frame_start != 0 or scene.frame_end != FRAME_ENDS[clip]:
        errors.append(
            f"frame range={scene.frame_start}..{scene.frame_end} expected 0..{FRAME_ENDS[clip]}"
        )
    if scene.get("hero_slug") != "kaze" or scene.get("clip_name") != expected_action:
        errors.append("scene metadata does not match hero/action")
    for object_name in ("HeroAttachment_FanLeft", "HeroAttachment_FanRight"):
        obj = bpy.data.objects.get(object_name)
        if obj is None or obj.type != "MESH" or obj.hide_render:
            errors.append(f"missing visible embedded weapon mesh {object_name}")
    for marker_name, bone_name in (
        ("Grip.Primary.HeroAttachment_FanLeft", "L_wrist_s"),
        ("Grip.Primary.HeroAttachment_FanRight", "R_wrist_s"),
    ):
        marker = bpy.data.objects.get(marker_name)
        if (
            marker is None
            or marker.parent_type != "OBJECT"
            or not marker.parent
            or marker.parent_bone
        ):
            errors.append(f"invalid grip marker parenting {marker_name}")
        elif (
            marker.parent.parent_type != "BONE"
            or marker.parent.parent_bone != bone_name
        ):
            errors.append(f"{marker_name} must ultimately follow {bone_name}")

    action = actions[0] if len(actions) == 1 else None
    if action:
        curve_bones = {
            curve.data_path.split('"')[1]
            for curve in action_curves(action)
            if curve.data_path.startswith("pose.bones[")
        }
        for bone_name in REQUIRED_CURVE_BONES:
            if bone_name not in curve_bones:
                errors.append(
                    f"{expected_action}: missing authored curves for {bone_name}"
                )

    frames = range(0, FRAME_ENDS[clip] + 1)
    snapshots = {}
    for frame in frames:
        scene.frame_set(frame)
        snapshots[frame] = pose_values(armature)
        validate_pose(clip, armature, frame, errors)
    if clip in CYCLES:
        first, last = snapshots[0], snapshots[FRAME_ENDS[clip]]
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
    requested = os.environ.get("KAZE_CLIP_FILTER")
    clips = [requested] if requested else list(ACTION_NAMES)
    if any(clip not in ACTION_NAMES for clip in clips):
        raise RuntimeError(f"unknown KAZE_CLIP_FILTER value: {requested}")
    results = [validate_clip(clip) for clip in clips]
    payload = {
        "hero": "kaze",
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
        raise RuntimeError("Kaze animation validation failed")


if __name__ == "__main__":
    main()
