"""Deeper semantic and motion-quality QA for Mandy's complete clips.

The attachment validator proves that the prop is on the left wrist. This
second pass checks the motion itself: every frame is sampled for continuity,
cycles close, and each clip has the required movement phases from the brief.
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
REPORT = ROOT / "artifacts" / "mandy-animation-quality.json"

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
DURATIONS = {
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
B = {
    "root": "Root_2_01",
    "hips": "hips_s_02",
    "spine": "spine_lower_s_030",
    "chest": "chest_s_033",
    "upper_l": "L_shoulder_s_044",
    "hand_l": "L_wrist_s_047",
    "upper_r": "R_shoulder_s_061",
    "hand_r": "R_wrist_s_064",
    "thigh_l": "L_upperLeg_s_03",
    "thigh_r": "R_upperLeg_s_07",
}


def degrees(value):
    return math.degrees(float(value))


def pose_snapshot(armature):
    return {
        name: tuple(degrees(value) for value in bone.rotation_euler)
        for name, bone in ((name, armature.pose.bones[name]) for name in B.values())
    }


def vector_delta(a, b):
    return max(abs(x - y) for x, y in zip(a, b))


def world_point(armature, pose_bone, point):
    return armature.matrix_world @ point


def frame_sample(scene, armature, marker, staff):
    left = armature.pose.bones[B["hand_l"]]
    right = armature.pose.bones[B["hand_r"]]
    root = armature.pose.bones[B["root"]]
    hips = armature.pose.bones[B["hips"]]
    chest = armature.pose.bones[B["chest"]]
    spine = armature.pose.bones[B["spine"]]
    left_world = world_point(armature, left, left.head)
    right_world = world_point(armature, right, right.tail)
    marker_world = marker.matrix_world.translation.copy()
    staff_low = min(
        (staff.matrix_world @ Vector(corner)).z for corner in staff.bound_box
    )
    staff_center = (
        sum(
            (staff.matrix_world @ Vector(corner) for corner in staff.bound_box),
            Vector(),
        )
        / 8.0
    )
    # Root_2_01's measured local Z axis is Mandy's forward direction (-Y in
    # world space). Keep this as a geometric metric so Attack QA catches a
    # weapon that is attached correctly but swings behind her body.
    forward = root.z_axis.normalized()
    hips_world = world_point(armature, hips, hips.head)
    torso_pitch = degrees(
        hips.rotation_euler.x + spine.rotation_euler.x + chest.rotation_euler.x
    )
    return {
        "pose": pose_snapshot(armature),
        "root_up": float(root.location.y),
        "torso_pitch": torso_pitch,
        "left_marker": tuple(marker_world),
        "left_wrist": tuple(left_world),
        "right_wrist": tuple(right_world),
        "staff_low_z": staff_low,
        "staff_forward": float((staff_center - hips_world).dot(forward)),
        "right_staff_clearance": float((right_world - marker_world).length),
    }


def validate_clip(clip):
    errors = []
    path = SCENES / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects["MandyRig"]
    marker = bpy.data.objects["Grip.Primary.MandyStaff_Attachment"]
    staff = bpy.data.objects["MandyStaff_Attachment"]
    frames = []
    for frame in range(1, DURATIONS[clip] + 2):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        frames.append(frame_sample(scene, armature, marker, staff))

    max_pose_step = 0.0
    max_pose_acceleration = 0.0
    previous_step = 0.0
    motion_bones = [
        name for name in B.values() if not (clip == "victory" and name == B["hand_l"])
    ]
    for before, after in zip(frames, frames[1:]):
        step = max(
            vector_delta(before["pose"][name], after["pose"][name])
            for name in motion_bones
        )
        max_pose_step = max(max_pose_step, step)
        max_pose_acceleration = max(max_pose_acceleration, abs(step - previous_step))
        previous_step = step
    if max_pose_step > 115.0:
        errors.append(f"motion step spike {max_pose_step:.1f} degrees/frame")
    if max_pose_acceleration > 120.0:
        errors.append(
            f"motion acceleration spike {max_pose_acceleration:.1f} degrees/frame^2"
        )

    if clip in CYCLES:
        first, last = frames[0], frames[-1]
        for name in B.values():
            if vector_delta(first["pose"][name], last["pose"][name]) > 0.5:
                errors.append(f"cycle does not close on {name}")
        if (
            max(
                vector_delta(
                    frames[0]["pose"][name], frames[len(frames) // 2]["pose"][name]
                )
                for name in B.values()
            )
            < 1.0
        ):
            errors.append("cycle has no visible pose variation")

    def pose_change(frame_a, frame_b, bone):
        return vector_delta(
            frames[frame_a - 1]["pose"][B[bone]], frames[frame_b - 1]["pose"][B[bone]]
        )

    if clip == "idle":
        if pose_change(1, 46, "hips") < 1.0:
            errors.append("idle has no weight shift")
    elif clip == "run":
        if frames[0]["pose"][B["thigh_l"]][0] * frames[6]["pose"][B["thigh_l"]][0] >= 0:
            errors.append("run does not alternate the left leg")
        if pose_change(1, 7, "upper_r") < 10.0:
            errors.append("run right arm is not counter-swinging")
    elif clip == "attack":
        if pose_change(1, 7, "upper_l") < 30.0 or pose_change(7, 17, "upper_l") < 20.0:
            errors.append("attack lacks left-hand windup/return")
        neutral_forward = frames[0]["staff_forward"]
        impact_forward = frames[6]["staff_forward"]
        follow_through_forward = frames[7]["staff_forward"]
        if (
            impact_forward < neutral_forward + 0.05
            or follow_through_forward < neutral_forward + 0.05
        ):
            errors.append("attack staff stays behind Mandy at impact")
    elif clip == "super":
        roots = [frame["root_up"] for frame in frames]
        if max(roots) < 0.20 or min(roots) > -0.15:
            errors.append("super lacks crouch and jump phases")
    elif clip == "aim":
        if max(abs(value) for value in frames[0]["pose"][B["upper_l"]]) < 20.0:
            errors.append("aim left arm is not in a target pose")
    elif clip == "aim-super":
        if max(abs(frame["root_up"] + 0.16) for frame in frames) > 0.01:
            errors.append("aim-super leaves its low root stance")
    elif clip == "hit":
        if pose_change(1, 8, "upper_l") < 10.0 or pose_change(1, 8, "hand_l") < 8.0:
            errors.append("hit lacks recoil")
    elif clip == "death":
        if min(frame["root_up"] for frame in frames) > -0.25:
            errors.append("death does not reach the ground")
    elif clip == "spawn":
        if frames[0]["root_up"] >= -0.20 or frames[-1]["root_up"] != 0.0:
            errors.append("spawn root does not rise to neutral")
        if pose_change(1, 19, "upper_l") < 30.0:
            errors.append("spawn does not reveal the staff through the left arm")
    elif clip == "victory":
        hand_z = [frame["pose"][B["hand_l"]][2] for frame in frames]
        if max(hand_z) - min(hand_z) < 300.0:
            errors.append("victory lacks the left-hand staff spin")
        if max(frame["root_up"] for frame in frames) < 0.10:
            errors.append("victory lacks the jump")
    elif clip == "gadget":
        if min(frame["root_up"] for frame in frames) > -0.12:
            errors.append("gadget does not plant into a low stance")
    elif clip == "aim-gadget":
        if (
            min(frame["root_up"] for frame in frames) > -0.05
            or max(abs(value) for value in frames[0]["pose"][B["upper_l"]]) < 20.0
        ):
            errors.append("aim-gadget lacks its low aiming stance")

    return {
        "clip": clip,
        "status": "PASS" if not errors else "FAIL",
        "errors": errors,
        "frames_checked": len(frames),
        "max_pose_step_degrees_per_frame": max_pose_step,
        "max_pose_acceleration_degrees_per_frame2": max_pose_acceleration,
        "min_right_staff_clearance": min(
            frame["right_staff_clearance"] for frame in frames
        ),
    }


def main():
    clips = [validate_clip(clip) for clip in ACTION_NAMES]
    payload = {
        "hero": "mandy",
        "frames_checked": sum(item["frames_checked"] for item in clips),
        "clips": clips,
        "status": "PASS" if all(item["status"] == "PASS" for item in clips) else "FAIL",
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
                "frames_checked": payload["frames_checked"],
                "clips": [
                    {
                        "clip": item["clip"],
                        "status": item["status"],
                        "errors": len(item["errors"]),
                        "max_step": round(item["max_pose_step_degrees_per_frame"], 2),
                    }
                    for item in clips
                ],
            },
            ensure_ascii=False,
        )
    )
    if payload["status"] != "PASS":
        raise RuntimeError("Mandy motion-quality validation failed")


if __name__ == "__main__":
    main()
