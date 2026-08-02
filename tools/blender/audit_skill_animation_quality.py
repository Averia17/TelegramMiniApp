"""Quality gate for authored attack/super/gadget scenes.

This is intentionally stricter than the frame-coverage audit: a skill can have
one key per frame and still be unusable when a bone jumps, the action contains
non-smooth interpolation, or the authored attachment loses its bone parent.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
HEROES = (
    "brock-zeus",
    "damian",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
)
CLIPS = ("attack", "super", "gadget")
ABILITY_ACTIONS = {"attack": "Attack", "super": "super", "gadget": "Gadget"}
MAX_FRAME_DELTA_DEGREES = 35.0
MAX_FRAME_DELTA_OVERRIDES = {("mandy", "attack"): 42.0}
UNARMED_ARM_LIMITS = {}

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import author_frame_by_frame_animation_scenes as authoring
import author_skill_animation_scenes_v2 as authored_v2
import hero_skill_spec as skill_spec


def bone_quaternion(pose_bone):
    if pose_bone.rotation_mode == "QUATERNION":
        return pose_bone.rotation_quaternion.copy()
    if pose_bone.rotation_mode == "AXIS_ANGLE":
        value = pose_bone.rotation_axis_angle
        return Quaternion((value[1], value[2], value[3]), value[0])
    return pose_bone.rotation_euler.to_quaternion()


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def attachment_contract(scene, armature):
    issues = []
    for obj in scene.objects:
        if not (
            "Grip" in obj.name or "Attachment" in obj.name or "SourcePivot" in obj.name
        ):
            continue
        if obj.parent != armature:
            continue
        if (
            obj.parent_type != "BONE"
            or not obj.parent_bone
            or armature.data.bones.get(obj.parent_bone) is None
        ):
            issues.append(f"{obj.name}:missing_bone_parent")
    return issues


def audit(path: Path, clip: str):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    action = armature.animation_data.action
    curves = action_curves(action)
    groups = authoring.rig_groups(armature)
    core_bones = sorted(
        {
            name
            for value in groups.values()
            for name in (value if isinstance(value, list) else [value])
            if name and armature.pose.bones.get(name)
        }
    )
    previous = {}
    first_pose = {}
    max_delta = 0.0
    max_delta_bone = None
    max_unarmed_delta = 0.0
    max_unarmed_bone = None
    unarmed_names = []
    if (scene.get("hero_slug"), clip) in UNARMED_ARM_LIMITS:
        groups_for_unarmed = authored_v2.rig_groups(armature)
        unarmed_names = [
            groups_for_unarmed.get("R_shoulder"),
            groups_for_unarmed.get("R_elbow"),
            groups_for_unarmed.get("R_wrist"),
        ]
        unarmed_names = [
            name for name in unarmed_names if name and armature.pose.bones.get(name)
        ]
    tracked_names = sorted(set(core_bones) | set(unarmed_names))
    for frame in range(int(scene.frame_start), int(scene.frame_end) + 1):
        scene.frame_set(frame)
        for name in tracked_names:
            current = bone_quaternion(armature.pose.bones[name])
            if name in unarmed_names:
                if name not in first_pose:
                    first_pose[name] = current.copy()
                else:
                    delta_from_start = math.degrees(
                        first_pose[name].rotation_difference(current).angle
                    )
                    if delta_from_start > max_unarmed_delta:
                        max_unarmed_delta = delta_from_start
                        max_unarmed_bone = name
            if name in previous:
                delta = math.degrees(previous[name].rotation_difference(current).angle)
                if delta > max_delta:
                    max_delta = delta
                    max_delta_bone = name
            previous[name] = current
    smooth = all(
        point.interpolation == "BEZIER"
        and point.handle_left_type == "AUTO_CLAMPED"
        and point.handle_right_type == "AUTO_CLAMPED"
        for curve in curves
        for point in curve.keyframe_points
    )
    position_tracks = [
        curve.data_path for curve in curves if curve.data_path.endswith(".location")
    ]
    issues = attachment_contract(scene, armature)
    expected_frames = skill_spec.FRAME_ENDS[scene.get("hero_slug")][clip]
    if int(scene.frame_end - scene.frame_start + 1) != expected_frames:
        issues.append(
            f"frame_count:{int(scene.frame_end - scene.frame_start + 1)}!=expected:{expected_frames}"
        )
    if not scene.get("skill_event_frames"):
        issues.append("missing_skill_event_frames")
    if action.name.casefold().split(".")[0] != ABILITY_ACTIONS[clip].casefold():
        issues.append(f"action_name:{action.name}")
    if not smooth:
        issues.append("non_smooth_curve")
    max_delta_limit = MAX_FRAME_DELTA_OVERRIDES.get(
        (scene.get("hero_slug"), clip), MAX_FRAME_DELTA_DEGREES
    )
    if max_delta > max_delta_limit:
        issues.append(f"frame_jump:{max_delta:.2f}deg:{max_delta_bone}")
    unarmed_limit = UNARMED_ARM_LIMITS.get((scene.get("hero_slug"), clip))
    if unarmed_limit is not None and max_unarmed_delta > unarmed_limit:
        issues.append(
            f"unarmed_arm_amplitude:{max_unarmed_delta:.2f}deg:{max_unarmed_bone}"
        )
    return {
        "hero": scene.get("hero_slug"),
        "clip": clip,
        "file": str(path.relative_to(ROOT)),
        "action": action.name,
        "frames": int(scene.frame_end - scene.frame_start + 1),
        "expected_frames": expected_frames,
        "core_bones": len(core_bones),
        "curve_count": len(curves),
        "max_frame_delta_degrees": round(max_delta, 3),
        "max_frame_delta_limit_degrees": max_delta_limit,
        "max_frame_delta_bone": max_delta_bone,
        "max_unarmed_arm_delta_degrees": round(max_unarmed_delta, 3),
        "max_unarmed_arm_delta_bone": max_unarmed_bone,
        "smooth_curves": smooth,
        "position_tracks": position_tracks,
        "attachment_issues": issues,
        "status": "passed" if not issues else "failed",
    }


report = [
    audit(SOURCE / hero / "scenes" / f"{clip}.blend", clip)
    for hero in HEROES
    for clip in CLIPS
]
output = ROOT / "artifacts" / "hero-skill-quality-audit.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
failures = [item for item in report if item["status"] != "passed"]
print(
    json.dumps(
        {"scenes": len(report), "failures": len(failures), "output": str(output)},
        ensure_ascii=False,
    )
)
if failures:
    raise SystemExit(1)
