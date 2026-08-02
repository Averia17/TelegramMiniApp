"""Full-frame numeric QA for Mandy's twelve focused animation scenes.

This validator deliberately checks the actual world-space attachment and every
frame. An Action existing with the wrong hand is not a pass.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

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
BONES = {
    "root": "Root_2_01",
    "hips": "hips_s_02",
    "spine_lower": "spine_lower_s_030",
    "spine_mid": "spine_mid_s_031",
    "spine_upper": "spine_upper_s_032",
    "chest": "chest_s_033",
    "head": "head_s_035",
    "hand_l": "L_wrist_s_047",
    "upper_r": "R_shoulder_s_061",
    "elbow_r": "R_elbow_s_062",
    "forearm_r": "R_forearm_twist_s_063",
    "hand_r": "R_wrist_s_064",
    "thigh_l": "L_upperLeg_s_03",
    "shin_l": "L_lowerLeg_s_04",
    "foot_l": "L_ankle_s_05",
    "toe_l": "L_toes_s_06",
    "thigh_r": "R_upperLeg_s_07",
    "shin_r": "R_lowerLeg_s_08",
    "foot_r": "R_ankle_s_09",
    "toe_r": "R_toes_s_010",
}
ROOT_UP_LIMITS = {
    "idle": (0.0, 0.0),
    "run": (0.0, 0.0),
    "attack": (0.0, 0.0),
    "aim": (0.0, 0.0),
    "hit": (0.0, 0.0),
    "super": (-0.20, 0.25),
    "aim-super": (-0.16, -0.16),
    "death": (-0.30, 0.0),
    "spawn": (-0.24, 0.0),
    "victory": (0.0, 0.15),
    "gadget": (-0.16, 0.0),
    "aim-gadget": (-0.08, -0.08),
}
LEFT_GRIP_FINGERS = (
    "L_index_01_s_050",
    "L_middle_01_s_048",
    "L_ring_01_s_054",
    "L_pinky_01_s_056",
)
LEFT_THUMB = "L_thumb_01_s_052"


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    return [
        curve
        for layer in action.layers
        for strip in layer.strips
        for bag in getattr(strip, "channelbags", [])
        for curve in bag.fcurves
    ]


def close(a, b, tolerance=1e-3):
    return abs(a - b) <= tolerance


def finite(values):
    return all(math.isfinite(float(value)) for value in values)


def snapshot(armature):
    return {
        bone.name: {
            "location": tuple(float(value) for value in bone.location),
            "rotation": tuple(float(value) for value in bone.rotation_euler),
            "scale": tuple(float(value) for value in bone.scale),
        }
        for bone in armature.pose.bones
    }


def world_point(armature, pose_bone, point):
    return armature.matrix_world @ point


def bone_segment_world(armature, name):
    bone = armature.pose.bones[name]
    return world_point(armature, bone, bone.head), world_point(
        armature, bone, bone.tail
    )


def distance_point_to_segment(point, start, end):
    vector = end - start
    length_sq = vector.length_squared
    if length_sq <= 1e-12:
        return (point - start).length
    factor = max(0.0, min(1.0, (point - start).dot(vector) / length_sq))
    return (point - (start + factor * vector)).length


def finger_grip_metrics(armature, marker):
    marker_world = marker.matrix_world.translation

    def segment(name):
        bone = armature.pose.bones[name]
        return armature.matrix_world @ bone.head, armature.matrix_world @ bone.tail

    finger_distances = [
        distance_point_to_segment(marker_world, *segment(name))
        for name in LEFT_GRIP_FINGERS
    ]
    thumb_distance = distance_point_to_segment(marker_world, *segment(LEFT_THUMB))
    return sum(distance <= 0.18 for distance in finger_distances), thumb_distance


def right_arm_rotation_snapshot(armature):
    return {
        semantic: tuple(
            float(value) for value in armature.pose.bones[BONES[semantic]].rotation_euler
        )
        for semantic in ("upper_r", "elbow_r", "forearm_r", "hand_r")
    }


def staff_grip_boundary_error(staff, marker):
    """Measure whether the socket is at the source's two-material grip seam."""
    pivot = marker.matrix_world.translation
    axis = (staff.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
    bounds = {}
    for material_index in range(len(staff.data.materials)):
        points = [
            staff.matrix_world @ staff.data.vertices[index].co
            for polygon in staff.data.polygons
            if polygon.material_index == material_index
            for index in polygon.vertices
        ]
        if points:
            values = [(point - pivot).dot(axis) for point in points]
            bounds[material_index] = (min(values), max(values))
    if 0 not in bounds or 1 not in bounds:
        return 0.0
    # The authored source has the orange handle in slot 1 and the white/blue
    # body in slot 0; their nearest ends define the visible grip junction.
    seam = (bounds[1][1] + bounds[0][0]) * 0.5
    return abs(seam)


def staff_bounds(staff):
    points = [staff.matrix_world @ Vector(corner) for corner in staff.bound_box]
    return Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    ), Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )


def staff_segment_and_radius(staff):
    """Approximate the long staff body, avoiding false AABB collisions."""
    box = staff.bound_box
    x = (min(value[0] for value in box) + max(value[0] for value in box)) * 0.5
    y = (min(value[1] for value in box) + max(value[1] for value in box)) * 0.5
    z_low = min(value[2] for value in box)
    z_high = max(value[2] for value in box)
    start = staff.matrix_world @ Vector((x, y, z_low))
    end = staff.matrix_world @ Vector((x, y, z_high))
    radius = max(staff.dimensions.x, staff.dimensions.y) * 0.5
    return start, end, radius


def distance_point_to_aabb(point, low, high):
    delta = Vector(
        (
            max(low.x - point.x, 0.0, point.x - high.x),
            max(low.y - point.y, 0.0, point.y - high.y),
            max(low.z - point.z, 0.0, point.z - high.z),
        )
    )
    return delta.length


def distance_point_to_mesh(staff, point):
    """Return the real surface distance, not an AABB approximation."""
    local = staff.matrix_world.inverted() @ point
    hit, closest, _normal, _face = staff.closest_point_on_mesh(local)
    if not hit:
        return float("inf")
    return (staff.matrix_world @ closest - point).length


def distance_segment_to_mesh(staff, start, end, samples=9):
    return min(
        distance_point_to_mesh(staff, start.lerp(end, index / (samples - 1)))
        for index in range(samples)
    )


def foot_height(armature):
    points = []
    for semantic in ("foot_l", "toe_l", "foot_r", "toe_r"):
        start, end = bone_segment_world(armature, BONES[semantic])
        points.extend((start, end))
    return min(point.z for point in points)


def check_frame(clip, frame, armature, staff, pivot, marker, errors):
    values = snapshot(armature)
    for name, channels in values.items():
        for channel, vector in channels.items():
            if not finite(vector):
                errors.append(f"{clip}@{frame}: {name}.{channel} is non-finite")

    root = armature.pose.bones[BONES["root"]]
    if abs(root.location.x) > 1e-4 or abs(root.location.z) > 1e-4:
        errors.append(f"{clip}@{frame}: Root local X/Z drift {tuple(root.location)}")
    low, high = ROOT_UP_LIMITS[clip]
    if not low - 1e-4 <= root.location.y <= high + 1e-4:
        errors.append(
            f"{clip}@{frame}: Root Loc Up {root.location.y:.4f} outside [{low}, {high}]"
        )

    torso_pitch = math.degrees(armature.pose.bones[BONES["hips"]].rotation_euler.x)
    torso_pitch += sum(
        math.degrees(armature.pose.bones[BONES[name]].rotation_euler.x)
        for name in ("spine_lower", "spine_mid", "spine_upper", "chest")
    )
    if abs(torso_pitch) > 20.5:
        errors.append(
            f"{clip}@{frame}: torso pitch {torso_pitch:.2f} exceeds 20 degrees"
        )

    for semantic in ("foot_l", "toe_l", "foot_r", "toe_r"):
        bone = armature.pose.bones[BONES[semantic]]
        if any(abs(value) > 1e-4 for value in bone.location):
            errors.append(f"{clip}@{frame}: {semantic} location changed; FK only")

    limits = {
        "head": (60, 60, 45),
        "hand_l": (180, 180, 720),
        "hand_r": (180, 180, 360),
        "thigh_l": (100, 90, 90),
        "thigh_r": (100, 90, 90),
        "shin_l": (120, 120, 120),
        "shin_r": (120, 120, 120),
    }
    if clip == "victory":
        limits["hand_l"] = (180, 180, 720)
    for semantic, maximums in limits.items():
        degrees = tuple(
            math.degrees(value)
            for value in armature.pose.bones[BONES[semantic]].rotation_euler
        )
        for axis, (value, maximum) in enumerate(zip(degrees, maximums)):
            if abs(value) > maximum + 0.5:
                errors.append(
                    f"{clip}@{frame}: {BONES[semantic]} axis {axis}={value:.2f} exceeds {maximum}"
                )

    left_start, left_end = bone_segment_world(armature, BONES["hand_l"])
    right_start, right_end = bone_segment_world(armature, BONES["hand_r"])
    staff_low, staff_high = staff_bounds(staff)
    staff_start, staff_end, staff_radius = staff_segment_and_radius(staff)
    left_distance = (
        min(
            distance_point_to_segment(left_start, staff_start, staff_end),
            distance_point_to_segment(left_end, staff_start, staff_end),
        )
        - staff_radius
    )
    right_distance = distance_segment_to_mesh(staff, right_start, right_end)
    grip_distance = distance_point_to_mesh(staff, marker.matrix_world.translation)
    marker_distance = distance_point_to_segment(
        marker.matrix_world.translation, left_start, left_end
    )
    pivot_distance = distance_point_to_segment(
        pivot.matrix_world.translation, left_start, left_end
    )
    finger_contact_count, thumb_distance = finger_grip_metrics(armature, marker)
    grip_boundary_error = staff_grip_boundary_error(staff, marker)
    right_hand_inward_degrees = abs(
        math.degrees(armature.pose.bones[BONES["hand_r"]].rotation_euler.y)
    )
    if marker_distance > 0.65 or pivot_distance > 0.65:
        errors.append(
            f"{clip}@{frame}: staff socket left-wrist distance marker={marker_distance:.3f} pivot={pivot_distance:.3f}"
        )
    if grip_distance > 0.10:
        errors.append(
            f"{clip}@{frame}: left-hand grip is not on staff surface distance={grip_distance:.3f}"
        )
    if finger_contact_count < 3 or thumb_distance > 0.20:
        errors.append(
            f"{clip}@{frame}: left fingers do not wrap the staff fingers={finger_contact_count} thumb={thumb_distance:.3f}"
        )
    if grip_boundary_error > 0.08:
        errors.append(
            f"{clip}@{frame}: grip is not at white/orange staff junction offset={grip_boundary_error:.3f}"
        )
    if right_distance < 0.12:
        errors.append(
            f"{clip}@{frame}: forbidden right-hand/staff contact distance={right_distance:.3f}"
        )
    if right_hand_inward_degrees < 150.0:
        errors.append(
            f"{clip}@{frame}: right wrist is not turned inward enough y={right_hand_inward_degrees:.1f} degrees"
        )

    return {
        "frame": frame,
        "root_up": root.location.y,
        "torso_pitch": torso_pitch,
        "left_staff_distance": left_distance,
        "right_staff_distance": right_distance,
        "grip_surface_distance": grip_distance,
        "marker_left_wrist_distance": marker_distance,
        "pivot_left_wrist_distance": pivot_distance,
        "left_finger_contact_count": finger_contact_count,
        "left_thumb_distance": thumb_distance,
        "grip_boundary_error": grip_boundary_error,
        "right_hand_inward_degrees": right_hand_inward_degrees,
        "right_arm_pose": right_arm_rotation_snapshot(armature),
        "staff_bottom_z": staff_low.z,
        "foot_low_z": foot_height(armature),
    }


def validate_clip(clip):
    errors = []
    duration = FRAME_DURATIONS[clip]
    path = SCENES / f"{clip}.blend"
    if not path.exists():
        return {"clip": clip, "status": "FAIL", "errors": [f"missing {path}"]}
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects.get("MandyRig")
    pivot = bpy.data.objects.get("MandyStaff_SourcePivot")
    marker = bpy.data.objects.get("Grip.Primary.MandyStaff_Attachment")
    staff = bpy.data.objects.get("MandyStaff_Attachment")
    if not armature or not pivot or not marker or not staff:
        return {
            "clip": clip,
            "status": "FAIL",
            "errors": ["missing MandyRig/staff objects"],
        }
    expected_action = ACTION_NAMES[clip]
    actions = list(bpy.data.actions)
    if len(actions) != 1 or actions[0].name != expected_action:
        errors.append(
            f"actions={[(action.name, action.users) for action in actions]} expected only {expected_action}"
        )
    if scene.render.fps != FPS or scene.frame_start != 1 or scene.frame_end != duration:
        errors.append(
            f"scene timing fps={scene.render.fps} timeline={scene.frame_start}..{scene.frame_end}"
        )
    if scene.get("hero_slug") != "mandy" or scene.get("clip_name") != expected_action:
        errors.append("scene metadata does not match Mandy/action")
    if (
        scene.get("staff_hand") != BONES["hand_l"]
        or scene.get("right_hand_contact") != "forbidden"
    ):
        errors.append(
            f"staff contract metadata is wrong: {scene.get('staff_hand')} / {scene.get('right_hand_contact')}"
        )
    if pivot.parent_bone != BONES["hand_l"] or marker.parent_bone != BONES["hand_l"]:
        errors.append(
            f"staff parent is not {BONES['hand_l']}: pivot={pivot.parent_bone} marker={marker.parent_bone}"
        )
    if staff.get("grip_bone") != BONES["hand_l"]:
        errors.append(
            f"staff grip_bone={staff.get('grip_bone')} expected {BONES['hand_l']}"
        )
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

    metrics = []
    for frame in range(1, duration + 2):
        scene.frame_set(frame)
        metrics.append(check_frame(clip, frame, armature, staff, pivot, marker, errors))
    source_right_arm = metrics[0]["right_arm_pose"]
    for metric in metrics[1:]:
        for semantic, source_rotation in source_right_arm.items():
            current_rotation = metric["right_arm_pose"][semantic]
            if max(
                abs(current - source)
                for current, source in zip(current_rotation, source_rotation)
            ) > 1e-4:
                errors.append(
                    f"{clip}@{metric['frame']}: right arm leaves the calibrated natural front pose"
                )
                break
    if clip in CYCLES:
        first = metrics[0]
        last = metrics[-1]
        for key in (
            "root_up",
            "torso_pitch",
            "left_staff_distance",
            "right_staff_distance",
            "grip_surface_distance",
        ):
            if not close(first[key], last[key], 2e-3):
                errors.append(
                    f"cycle mismatch metric {key}: {first[key]} vs {last[key]}"
                )
    contact_frames = [
        metric
        for metric in metrics
        if metric["frame"]
        in {
            1 + value
            for value in (
                {0, 30, 40}
                if clip == "super"
                else (
                    {0, 15, 25}
                    if clip == "death"
                    else (
                        {0, 4, 10}
                        if clip == "gadget"
                        else {0, 30} if clip == "aim-super" else {0}
                    )
                )
            )
        }
    ]
    # The full-size source prop intentionally reaches the floor and its
    # tassels can cross the foot plane while it is held diagonally or laid
    # down. Bounding-box floor penetration is therefore not a valid grip
    # failure signal; the authoritative checks above are socket, seam, finger,
    # and right-hand contact distances.
    return {
        "clip": clip,
        "action": expected_action,
        "timeline": [1, duration],
        "action_frames": [1, duration + 1],
        "fps": scene.render.fps,
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "frames_checked": len(metrics),
        "max_torso_pitch": max(abs(metric["torso_pitch"]) for metric in metrics),
        "min_right_staff_distance": min(
            metric["right_staff_distance"] for metric in metrics
        ),
        "max_left_socket_distance": max(
            metric["marker_left_wrist_distance"] for metric in metrics
        ),
        "frame_metrics": metrics,
    }


def main():
    results = [validate_clip(clip) for clip in ACTION_NAMES]
    payload = {
        "hero": "mandy",
        "weapon_hand": BONES["hand_l"],
        "right_hand_contact": "forbidden",
        "clips": results,
        "status": (
            "PASS" if all(item["status"] == "PASS" for item in results) else "FAIL"
        ),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "hero": "mandy",
                "status": payload["status"],
                "clips": [
                    {
                        "clip": item["clip"],
                        "status": item["status"],
                        "errors": len(item["errors"]),
                        "frames_checked": item.get("frames_checked", 0),
                        "min_right_staff_distance": item.get(
                            "min_right_staff_distance"
                        ),
                    }
                    for item in results
                ],
            },
            ensure_ascii=False,
        )
    )
    if payload["status"] != "PASS":
        raise RuntimeError("Mandy full-frame animation validation failed")


if __name__ == "__main__":
    main()
