"""Strengthen silhouettes where the first semantic pass remained ambiguous.

This is deliberately a small second layer over the already-authored source
motion. It never moves the root, so gameplay remains authoritative.
"""

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


REFINEMENTS = {
    ("mandy", "gadget"): {
        "anchors": [
            (1, {}),
            (4, {"hips_s_02": d(-10), "chest_s_033": d(12), "R_shoulder_s_061": d(-18, 0, 18), "L_shoulder_s_044": d(-18, 0, -18)}),
            (8, {"hips_s_02": d(-14), "chest_s_033": d(18), "R_shoulder_s_061": d(-38, 0, 48), "L_shoulder_s_044": d(-38, 0, -48), "R_elbow_s_062": d(0, -42), "L_elbow_s_045": d(0, 42)}),
            (12, {"hips_s_02": d(-12), "chest_s_033": d(15), "R_shoulder_s_061": d(-34, 0, 42), "L_shoulder_s_044": d(-34, 0, -42), "R_elbow_s_062": d(0, -36), "L_elbow_s_045": d(0, 36)}),
            (17, {}),
        ],
        "markers": {"anticipation": 4, "release": 8, "follow_through": 12, "guard_lock": 8},
    },
    ("kaze", "gadget"): {
        "revision": 3,
        "previous_anchors": [
            (0, {}),
            (3, {"hips_s": d(-8), "chest_s": d(16), "head_s": d(-12), "L_shoulder_s": d(-20, 0, 22), "R_shoulder_s": d(-20, 0, -22)}),
            (7, {"hips_s": d(-14), "chest_s": d(30), "head_s": d(-28), "L_shoulder_s": d(-42, 0, 48), "R_shoulder_s": d(-42, 0, -48), "L_elbow_s": d(0, -34), "R_elbow_s": d(0, 34)}),
            (10, {"hips_s": d(-10), "chest_s": d(24), "head_s": d(-22), "L_shoulder_s": d(-34, 0, 38), "R_shoulder_s": d(-34, 0, -38)}),
            (12, {}),
        ],
        "anchors": [
            (0, {}),
            (3, {"hips_s": d(-8), "chest_s": d(16), "head_s": d(-12), "L_shoulder_s": d(-18, 0, -12), "R_shoulder_s": d(-18, 0, 12)}),
            (7, {"hips_s": d(-14), "chest_s": d(30), "head_s": d(-28), "L_shoulder_s": d(-34, 0, -42), "R_shoulder_s": d(-34, 0, 42), "L_elbow_s": d(0, 30), "R_elbow_s": d(0, -30)}),
            (10, {"hips_s": d(-10), "chest_s": d(24), "head_s": d(-22), "L_shoulder_s": d(-28, 0, -32), "R_shoulder_s": d(-28, 0, 32), "L_elbow_s": d(0, 20), "R_elbow_s": d(0, -20)}),
            (12, {}),
        ],
        "markers": {"vanish": 7},
    },
    ("fairy-mina", "gadget"): {
        "anchors": [
            (0, {}),
            (3, {"chest_s": d(16), "L_shoulder_s": d(-34, 0, 28), "R_shoulder_s": d(-34, 0, -28), "L_wing_down_s": d(0, 30), "R_wing_down_s": d(0, -30)}),
            (7, {"chest_s": d(-22), "L_shoulder_s": d(58, 0, -52), "R_shoulder_s": d(58, 0, 52), "L_wing_up_s": d(0, 48), "R_wing_up_s": d(0, -48)}),
            (10, {"chest_s": d(-14), "L_shoulder_s": d(40, 0, -38), "R_shoulder_s": d(40, 0, 38), "L_wing_up_s": d(0, 34), "R_wing_up_s": d(0, -34)}),
            (14, {}),
        ],
        "markers": {"repel": 7},
    },
    ("brock-zeus", "super"): {
        "anchors": [
            (0, {}),
            (10, {"Chest": d(-8), "R_Shoulder": d(-24, 0, -14), "L_Shoulder": d(-18, 0, 14)}),
            (18, {"Chest": d(10, 0, 18), "R_Shoulder": d(52, 0, 34), "R_Elbow": d(0, -28), "L_Shoulder": d(-18, 0, -16)}),
            (24, {"Chest": d(-4, 0, -10), "R_Shoulder": d(8, 0, 8), "L_Shoulder": d(-22, 0, 20)}),
            (30, {"Chest": d(8, 0, -18), "L_Shoulder": d(54, 0, -34), "L_Elbow": d(0, 28), "R_Shoulder": d(-16, 0, 16)}),
            (36, {"Chest": d(-6), "R_Shoulder": d(-20, 0, -18), "L_Shoulder": d(-20, 0, 18)}),
            (42, {"Chest": d(16), "R_Shoulder": d(48, 0, 30), "L_Shoulder": d(48, 0, -30), "R_Elbow": d(0, -20), "L_Elbow": d(0, 20)}),
            (46, {"Chest": d(10), "R_Shoulder": d(34, 0, 20), "L_Shoulder": d(34, 0, -20)}),
            (50, {}),
        ],
        "markers": {"strike_1": 18, "strike_2": 30, "strike_3": 42},
    },
}


def find_action(name):
    return next((action for action in bpy.data.actions if action.name.casefold().split(".")[0] == name.casefold()), None)


def mix(a, b, amount):
    return tuple(a[i] + (b[i] - a[i]) * amount for i in range(3))


def offsets_at(anchors, frame):
    left, right = anchors[0], anchors[-1]
    for index in range(len(anchors) - 1):
        if anchors[index][0] <= frame <= anchors[index + 1][0]:
            left, right = anchors[index], anchors[index + 1]
            break
    amount = (frame - left[0]) / max(1, right[0] - left[0])
    zero = (0.0, 0.0, 0.0)
    return {bone: mix(left[1].get(bone, zero), right[1].get(bone, zero), amount) for bone in set(left[1]) | set(right[1])}


def refine(hero, clip, refinement):
    path = SOURCE / hero / "scenes" / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    target_revision = refinement.get("revision", 2)
    current_revision = scene.get("readability_revision")
    if current_revision == target_revision:
        print(f"SKIP {hero}/{clip}: already readability revision {target_revision}")
        return
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(ACTION_NAMES[clip])
    if armature is None or action is None:
        raise RuntimeError(f"{hero}/{clip}: missing armature or action")
    armature.animation_data_create()
    armature.animation_data.action = action
    anchors = refinement["anchors"]
    previous_anchors = refinement.get("previous_anchors")
    bones = set().union(*(pose.keys() for _, pose in anchors))
    missing = bones - set(armature.pose.bones.keys())
    if missing:
        raise RuntimeError(f"{hero}/{clip}: missing bones {sorted(missing)}")
    base = {}
    for frame in range(anchors[0][0], anchors[-1][0] + 1):
        scene.frame_set(frame)
        for bone_name in bones:
            bone = armature.pose.bones[bone_name]
            base[(frame, bone_name)] = (bone.rotation_mode, bone.rotation_quaternion.copy(), bone.rotation_euler.copy())
    for frame in range(anchors[0][0], anchors[-1][0] + 1):
        scene.frame_set(frame)
        offsets = offsets_at(anchors, frame)
        if current_revision == 2 and target_revision == 3 and previous_anchors:
            previous = offsets_at(previous_anchors, frame)
            zero = (0.0, 0.0, 0.0)
            offsets = {
                bone_name: tuple(
                    offsets.get(bone_name, zero)[i] - previous.get(bone_name, zero)[i]
                    for i in range(3)
                )
                for bone_name in set(offsets) | set(previous)
            }
        for bone_name, offset in offsets.items():
            bone = armature.pose.bones[bone_name]
            mode, quaternion, euler = base[(frame, bone_name)]
            if mode == "QUATERNION":
                bone.rotation_quaternion = quaternion @ Euler(offset, "XYZ").to_quaternion()
                bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone_name)
            else:
                bone.rotation_euler = Euler(tuple(euler[i] + offset[i] for i in range(3)), mode if mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"} else "XYZ")
                bone.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
    for name, frame in refinement["markers"].items():
        existing = scene.timeline_markers.get(name)
        if existing is not None:
            scene.timeline_markers.remove(existing)
        scene.timeline_markers.new(name, frame=frame)
    scene["readability_revision"] = target_revision
    scene["authoring_status"] = "semantic-authored-readability-refined"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"REFINED {hero}/{clip}")


def main():
    for (hero, clip), refinement in REFINEMENTS.items():
        refine(hero, clip, refinement)


if __name__ == "__main__":
    main()
