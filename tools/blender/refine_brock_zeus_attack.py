"""Refine Brock Zeus's one-second cloud-to-glove attack in the master scene."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend/assets-source/heroes/brock-zeus/scenes/zeus_rebuild_master.blend"
)
REPORT = ROOT / "artifacts/brock-zeus-archive-rebuild/archive_rebuild_report.json"
FPS = 30


def radians(values):
    return tuple(math.radians(value) for value in values)


def get_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def neutral_pose(armature):
    """Read the authored idle reference instead of guessing a second rest pose."""
    idle = bpy.data.actions.get("idle")
    if idle is None:
        raise RuntimeError("Brock Zeus master has no idle Action")
    armature.animation_data_clear()
    armature.animation_data_create()
    armature.animation_data.action = idle
    bpy.context.scene.frame_set(120)
    bpy.context.view_layer.update()
    return {
        bone.name: {
            "rotation_mode": bone.rotation_mode,
            "loc": tuple(bone.location),
            "rot": tuple(bone.rotation_euler),
            "scale": tuple(bone.scale),
        }
        for bone in armature.pose.bones
    }


def reset_to_neutral(armature, pose):
    for bone in armature.pose.bones:
        reference = pose[bone.name]
        bone.rotation_mode = reference["rotation_mode"]
        bone.location = reference["loc"]
        bone.rotation_euler = reference["rot"]
        bone.scale = reference["scale"]


def apply_pose(armature, pose):
    for name, values in pose.items():
        bone = armature.pose.bones.get(name)
        if bone is None:
            continue
        if "loc" in values:
            bone.location = values["loc"]
        if "rot" in values:
            bone.rotation_euler = radians(values["rot"])
        if "scale" in values:
            bone.scale = values["scale"]


def key_bones(action, armature, frame):
    for bone in armature.pose.bones:
        bone.keyframe_insert("location", frame=frame, group=bone.name)
        bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
        bone.keyframe_insert("scale", frame=frame, group=bone.name)


def mark_clip(
    action, *, name, end, semantic, anticipation, release, follow_through, points
):
    action["hero_slug"] = "brock-zeus"
    action["clip_name"] = "attack"
    action["source_layout"] = "master-actions"
    action["frame_start"] = 1
    action["frame_end"] = end
    action["fps"] = FPS
    action["rig_version"] = 2
    action["point_contract"] = ",".join(points)
    action["anticipation_frame"] = anticipation
    action["release_frame"] = release
    action["follow_through_frame"] = follow_through
    action["semantic"] = semantic


def replace_action(name):
    old = bpy.data.actions.get(name)
    if old is not None:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    return action


def author_character_attack(armature):
    pose = neutral_pose(armature)
    armature.animation_data_clear()
    action = replace_action("Attack")
    armature.animation_data_create()
    armature.animation_data.action = action

    # R is the authored attacking arm in this rig. The cloud reaches the open
    # glove at frame 8, charges through frames 9-12, releases at 13-15, and
    # settles with Bezier recovery from frame 15 onward.
    neutral = {
        "Chest": {"rot": (0, 0, 0)},
        "R_Shoulder": {"rot": (-22, 0, -12)},
        "R_Elbow": {"rot": (0, 0, -14)},
        "R_Hand": {"rot": (0, 0, 0)},
        "L_Shoulder": {"rot": (-22, 0, 12)},
        "L_Elbow": {"rot": (0, 0, 12)},
        "L_Hand": {"rot": (0, 0, 0)},
        "Head": {"rot": (0, 0, 0)},
    }
    attract = {
        "Pelvis": {"rot": (0, 0, 4)},
        "Spine": {"rot": (5, 0, 0)},
        "Chest": {"rot": (2, 0, 0)},
        "R_Shoulder": {"rot": (0, 5, 58)},
        "R_Elbow": {"rot": (0, 0, -88)},
        "R_Hand": {"rot": (0, 0, 18)},
        "L_Shoulder": {"rot": (-20, 0, 4)},
        "L_Elbow": {"rot": (0, 0, -8)},
        "Head": {"rot": (0, 0, -10)},
    }
    charge_a = {
        "Pelvis": {"rot": (0, 0, 1)},
        "Spine": {"rot": (3, 0, 0)},
        "Chest": {"rot": (1, 0, 0)},
        "R_Shoulder": {"rot": (0, 2, 68)},
        "R_Elbow": {"rot": (0, 0, -58)},
        "R_Hand": {"loc": (0.018, 0, 0), "rot": (0, 0, 12)},
        "L_Shoulder": {"rot": (-16, 0, 10)},
        "L_Elbow": {"rot": (0, 0, 2)},
        "Head": {"rot": (0, 0, -4)},
    }
    charge_b = {**charge_a, "R_Hand": {"loc": (-0.018, 0, 0), "rot": (0, 0, 15)}}
    charge_c = {
        **charge_a,
        "R_Hand": {"loc": (0.018, 0, 0), "rot": (0, 0, 11)},
        "L_Shoulder": {"rot": (-14, 0, 18)},
        "L_Elbow": {"rot": (0, 0, 12)},
    }
    charge_end = {
        "Pelvis": {"rot": (0, 0, -2)},
        "Spine": {"rot": (2, 0, 0)},
        "R_Shoulder": {"rot": (-2, -2, 74)},
        "R_Elbow": {"rot": (0, -2, -36)},
        "R_Hand": {"rot": (0, -4, 2)},
        "L_Shoulder": {"rot": (-12, 0, 26)},
        "L_Elbow": {"rot": (0, 0, 20)},
        "Head": {"rot": (0, 0, 0)},
    }
    release_a = {
        "Pelvis": {"loc": (0, 0, 0.02), "rot": (0, 0, -4)},
        "Spine": {"rot": (-4, 0, -2)},
        "Chest": {"rot": (0, 0, -2)},
        "R_Shoulder": {"rot": (-5, -5, 82)},
        "R_Elbow": {"rot": (0, -4, -10)},
        "R_Hand": {"rot": (0, -8, -14)},
        "L_Shoulder": {"rot": (-18, 0, -6)},
        "L_Elbow": {"rot": (0, 0, -8)},
        "L_Knee": {"rot": (-8, 0, 0)},
        "R_Knee": {"rot": (-8, 0, 0)},
        "L_Ankle": {"loc": (0, 0, 0.025)},
        "R_Ankle": {"loc": (0, 0, 0.025)},
        "Head": {"rot": (-3, 0, 4)},
    }
    release_b = {
        **release_a,
        "Pelvis": {"loc": (0, 0, 0.04), "rot": (0, 0, -5)},
        "Spine": {"rot": (-9, 0, -4)},
        "Chest": {"rot": (0, 0, -4)},
        "R_Shoulder": {"rot": (-7, -8, 84)},
        "R_Elbow": {"rot": (0, -5, -4)},
        "R_Hand": {"rot": (0, -10, -18)},
        "L_Shoulder": {"rot": (-20, 0, -10)},
        "L_Elbow": {"rot": (0, 0, -14)},
        "L_Knee": {"rot": (-10, 0, 0)},
        "R_Knee": {"rot": (-10, 0, 0)},
        "L_Ankle": {"loc": (0, 0, 0.04)},
        "R_Ankle": {"loc": (0, 0, 0.04)},
        "Head": {"rot": (-4, 0, 6)},
    }
    release_c = {
        **release_b,
        "Spine": {"rot": (-10, 0, -3)},
        "R_Shoulder": {"rot": (-8, -10, 84)},
        "R_Elbow": {"rot": (0, -6, 0)},
        "R_Hand": {"rot": (0, -12, -20)},
        "L_Shoulder": {"rot": (-22, 0, -12)},
        "L_Elbow": {"rot": (0, 0, -18)},
        "Head": {"rot": (-5, 0, 8)},
    }
    recover = {
        "Pelvis": {"rot": (0, 0, 1)},
        "Spine": {"rot": (-4, 0, -1)},
        "R_Shoulder": {"rot": (-16, 0, 15)},
        "R_Elbow": {"rot": (6, 0, -42)},
        "R_Hand": {"rot": (0, 0, -4)},
        "L_Shoulder": {"rot": (-20, 0, 4)},
        "L_Elbow": {"rot": (0, 0, -4)},
        "Head": {"rot": (-1, 0, 2)},
    }
    settle = {
        "Pelvis": {"rot": (0, 0, 0)},
        "Spine": {"rot": (0, 0, 0)},
        "Chest": {"rot": (0, 0, 0)},
        "R_Shoulder": {"rot": (-20, 0, -6)},
        "R_Elbow": {"rot": (0, 0, -8)},
        "L_Shoulder": {"rot": (-20, 0, 8)},
        "L_Elbow": {"rot": (0, 0, 8)},
        "Head": {"rot": (0, 0, 0)},
    }

    poses = {
        1: neutral,
        4: attract,
        8: attract,
        9: charge_a,
        10: charge_b,
        11: charge_c,
        12: charge_end,
        13: release_a,
        14: release_b,
        15: release_c,
        16: recover,
        24: settle,
        30: neutral,
    }
    for frame, overrides in poses.items():
        bpy.context.scene.frame_set(frame)
        reset_to_neutral(armature, pose)
        apply_pose(armature, overrides)
        key_bones(action, armature, frame)

    for curve in get_fcurves(action):
        for key in curve.keyframe_points:
            linear = key.co.x < 15
            key.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    mark_clip(
        action,
        name="Attack",
        end=30,
        semantic="cloud charge flows into the glove, releases a powerful shot, then reforms behind Zeus",
        anticipation=8,
        release=13,
        follow_through=24,
        points=("POINT_Attack_Target", "POINT_R_Hand", "POINT_Cloud_Anchor"),
    )


def author_cloud_attack(cloud):
    cloud.animation_data_clear()
    action = replace_action("Cloud_Attack")
    cloud.animation_data_create()
    cloud.animation_data.action = action
    cloud.rotation_mode = "XYZ"
    frames = [
        (1, (0.08, 0.06, 0.25), (1.0, 1.0, 1.0), 0),
        (4, (0.22, -3.80, 0.58), (0.82, 0.82, 0.82), -8),
        (8, (0.78, -11.10, 2.15), (0.10, 0.10, 0.10), -16),
        (9, (0.78, -11.10, 2.15), (0.08, 0.08, 0.08), -16),
        (12, (0.78, -11.10, 2.15), (0.06, 0.06, 0.06), -16),
        (13, (0.78, -11.10, 2.15), (0.06, 0.06, 0.06), -16),
        (15, (0.34, 0.30, -0.10), (0.08, 0.08, 0.08), 12),
        (16, (0.34, 0.30, -0.10), (0.90, 0.90, 0.90), 12),
        (18, (0.30, 0.18, -0.02), (1.50, 1.50, 1.50), 18),
        (22, (0.22, 0.10, 0.16), (1.16, 1.08, 1.16), 8),
        (26, (0.14, 0.07, 0.24), (1.04, 1.0, 1.04), 3),
        (30, (0.08, 0.06, 0.25), (1.0, 1.0, 1.0), 0),
    ]
    for frame, location, scale, yaw in frames:
        bpy.context.scene.frame_set(frame)
        cloud.location = location
        cloud.rotation_euler = (0.0, 0.0, math.radians(yaw))
        cloud.scale = scale
        cloud.keyframe_insert("location", frame=frame, group="Cloud_Attack")
        cloud.keyframe_insert("rotation_euler", frame=frame, group="Cloud_Attack")
        cloud.keyframe_insert("scale", frame=frame, group="Cloud_Attack")
    for curve in get_fcurves(action):
        for key in curve.keyframe_points:
            linear = key.co.x < 15
            key.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    mark_clip(
        action,
        name="Cloud_Attack",
        end=30,
        semantic="cloud flows into the glove, vanishes during charge, then reforms behind Zeus after the shot",
        anticipation=8,
        release=13,
        follow_through=24,
        points=("POINT_Cloud_Anchor", "POINT_R_Hand"),
    )


def update_report():
    if not REPORT.exists():
        return
    data = json.loads(REPORT.read_text(encoding="utf-8"))
    for clip in data.get("animation_clips", []):
        if clip.get("name") == "Attack":
            clip["frame_end"] = 30
            clip["fps"] = FPS
    REPORT.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = bpy.data.objects["BrockZeus_Rig"]
    cloud = bpy.data.objects["Cloud"]
    author_character_attack(armature)
    author_cloud_attack(cloud)
    update_report()
    bpy.context.scene.render.fps = FPS
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print("BROCK_ZEUS_ATTACK_REFINEMENT_OK attack_frames=1..30 cloud_frames=1..30")


if __name__ == "__main__":
    main()
