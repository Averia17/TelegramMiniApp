"""Author a final semantic pose pass for five weakly readable skill clips."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Euler

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
ACTION_NAMES = {"gadget": "Gadget", "super": "super"}


def d(x=0, y=0, z=0):
    return (math.radians(x), math.radians(y), math.radians(z))


POSES = {
    ("needle", "gadget"): {
        "marker": ("moisture_core", 6),
        "anchors": [
            (0, {}),
            (
                3,
                {
                    "Chest": d(10, 0, 0),
                    "LeftArm": d(-18, 0, -16),
                    "RightArm": d(-18, 0, 16),
                    "Flower": d(0, -14, 0),
                },
            ),
            (
                6,
                {
                    "Chest": d(-16, 0, 0),
                    "LeftArm": d(-42, 0, -28),
                    "RightArm": d(-42, 0, 28),
                    "Flower": d(0, 28, 0),
                },
            ),
            (
                9,
                {
                    "Chest": d(-9, 0, 0),
                    "LeftArm": d(-28, 0, -18),
                    "RightArm": d(-28, 0, 18),
                    "Flower": d(0, 16, 0),
                },
            ),
            (12, {}),
        ],
    },
    ("wukong-mico", "gadget"): {
        "marker": ("armor_brace", 20),
        "anchors": [
            (1, {}),
            (
                10,
                {
                    "hips_s": d(-14),
                    "chest_s": d(12),
                    "R_shoulder_s": d(-24, 0, -18),
                    "L_shoulder_s": d(-24, 0, 18),
                },
            ),
            (
                20,
                {
                    "hips_s": d(-24),
                    "chest_s": d(18),
                    "R_shoulder_s": d(-38, 0, -28),
                    "L_shoulder_s": d(-38, 0, 28),
                    "MIC_Handel_s": d(0, -28, 0),
                },
            ),
            (
                40,
                {
                    "hips_s": d(-16),
                    "chest_s": d(10),
                    "R_shoulder_s": d(-24, 0, -18),
                    "L_shoulder_s": d(-24, 0, 18),
                },
            ),
            (68, {}),
        ],
    },
    ("persephone-lumi", "gadget"): {
        "marker": ("garden_snap", 13),
        "anchors": [
            (1, {}),
            (
                6,
                {
                    "chest_s": d(12),
                    "R_shoulder_s": d(-24, 0, -24),
                    "L_shoulder_s": d(-24, 0, 24),
                    "R_weapon_s": d(0, -18, 0),
                },
            ),
            (
                13,
                {
                    "chest_s": d(-20),
                    "R_shoulder_s": d(46, 0, 38),
                    "L_shoulder_s": d(46, 0, -38),
                    "R_weapon_s": d(0, 38, 0),
                    "R_wrist_s": d(0, 30, 0),
                    "L_wrist_s": d(0, -30, 0),
                },
            ),
            (
                21,
                {
                    "chest_s": d(-8),
                    "R_shoulder_s": d(28, 0, 22),
                    "L_shoulder_s": d(28, 0, -22),
                    "R_weapon_s": d(0, 20, 0),
                },
            ),
            (30, {}),
        ],
    },
    ("brock-zeus", "gadget"): {
        "marker": ("cable_charge", 10),
        "anchors": [
            (0, {}),
            (
                4,
                {
                    "Chest": d(8),
                    "R_Shoulder": d(-22, 0, -18),
                    "L_Shoulder": d(-18, 0, 16),
                    "L_Wrist": d(0, 18, 0),
                },
            ),
            (
                10,
                {
                    "Chest": d(-12),
                    "R_Shoulder": d(34, 0, 28),
                    "R_Elbow": d(0, -32, 0),
                    "L_Shoulder": d(-28, 0, -18),
                    "L_Wrist": d(0, 34, 0),
                },
            ),
            (
                13,
                {
                    "Chest": d(-8),
                    "R_Shoulder": d(28, 0, 22),
                    "R_Elbow": d(0, -26, 0),
                    "L_Wrist": d(0, 28, 0),
                },
            ),
            (16, {}),
        ],
    },
    ("fairy-mina", "super"): {
        "marker": ("cocoon_offer", 25),
        "anchors": [
            (0, {}),
            (
                12,
                {
                    "chest_s": d(12),
                    "L_shoulder_s": d(-28, 0, 22),
                    "R_shoulder_s": d(-28, 0, -22),
                    "L_wing_down_s": d(0, 28),
                    "R_wing_down_s": d(0, -28),
                },
            ),
            (
                25,
                {
                    "chest_s": d(-18),
                    "L_shoulder_s": d(38, 0, -28),
                    "R_shoulder_s": d(38, 0, 28),
                    "L_wing_up_s": d(0, -42),
                    "R_wing_up_s": d(0, 42),
                    "head_s": d(-12),
                },
            ),
            (
                38,
                {
                    "chest_s": d(-8),
                    "L_shoulder_s": d(25, 0, -18),
                    "R_shoulder_s": d(25, 0, 18),
                    "L_wing_up_s": d(0, -28),
                    "R_wing_up_s": d(0, 28),
                },
            ),
            (55, {}),
        ],
    },
}


def find_action(name):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def offsets_at(anchors, frame):
    left, right = anchors[0], anchors[-1]
    for i in range(len(anchors) - 1):
        if anchors[i][0] <= frame <= anchors[i + 1][0]:
            left, right = anchors[i], anchors[i + 1]
            break
    t = (frame - left[0]) / max(1, right[0] - left[0])
    zero = (0.0, 0.0, 0.0)
    return {
        name: mix(left[1].get(name, zero), right[1].get(name, zero), t)
        for name in set(left[1]) | set(right[1])
    }


def refine(hero, clip, data):
    path = SOURCE / hero / "scenes" / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    if scene.get("readability_revision") == 3:
        print(f"SKIP {hero}/{clip}: already revision 3")
        return
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(ACTION_NAMES[clip])
    if armature is None or action is None:
        raise RuntimeError(f"{hero}/{clip}: missing armature or action")
    armature.animation_data_create()
    armature.animation_data.action = action
    anchors = data["anchors"]
    bones = set().union(*(pose.keys() for _, pose in anchors))
    missing = bones - set(armature.pose.bones.keys())
    if missing:
        raise RuntimeError(f"{hero}/{clip}: missing bones {sorted(missing)}")
    start, end = anchors[0][0], anchors[-1][0]
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for name, offset in offsets_at(anchors, frame).items():
            bone = armature.pose.bones[name]
            if bone.rotation_mode == "QUATERNION":
                bone.rotation_quaternion = (
                    bone.rotation_quaternion @ Euler(offset, "XYZ").to_quaternion()
                )
                bone.keyframe_insert("rotation_quaternion", frame=frame, group=name)
            else:
                mode = (
                    bone.rotation_mode
                    if bone.rotation_mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
                    else "XYZ"
                )
                bone.rotation_euler = Euler(
                    tuple(bone.rotation_euler[i] + offset[i] for i in range(3)), mode
                )
                bone.keyframe_insert("rotation_euler", frame=frame, group=name)
    marker_name, marker_frame = data["marker"]
    existing = scene.timeline_markers.get(marker_name)
    if existing:
        scene.timeline_markers.remove(existing)
    scene.timeline_markers.new(marker_name, frame=marker_frame)
    scene["readability_revision"] = 3
    scene["semantic_pass"] = "intent-pose-revision-3"
    scene["authoring_status"] = "semantic-authored-intent-revision-3"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"REFINED {hero}/{clip}")


def main():
    for (hero, clip), data in POSES.items():
        refine(hero, clip, data)


if __name__ == "__main__":
    main()
