"""Author the production Needle animation pack on the live 14-bone rig.

This script is intentionally Needle-specific.  The source master supplies the
mesh, armature, materials, and rest pose; each focused scene receives exactly
one authored Action with explicit poses at the contract frames.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/author_needle_animation_scenes.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
HERO = "needle"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "needle.blend"
SCENES = MASTER.parent / "scenes"
REPORT = ROOT / "artifacts" / "needle-animation-authoring.json"
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
    "idle": 120,
    "run": 30,
    "attack": 18,
    "super": 45,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 45,
    "spawn": 45,
    "victory": 60,
    "gadget": 10,
    "aim-gadget": 60,
}

CYCLE_CLIPS = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ABILITY_CLIPS = {"attack", "super", "gadget"}

# This is the actual bind-pose stance in needle.blend, expressed in local
# Euler degrees.  It is deliberately kept here rather than copied from the
# legacy Actions so the new pack has a single, reviewable baseline.
BASE_ROT = {
    "Root": (0.0, 0.0, 0.0),
    "Hips": (26.0, 0.0, 0.0),
    "Spine": (0.0, 0.0, 0.0),
    "Chest": (0.0, 0.0, 0.0),
    "Head": (0.0, 0.0, 0.0),
    "Flower": (0.0, 0.0, 0.0),
    "LeftArm": (0.0, 0.0, 0.0),
    "LeftHand": (0.0, 0.0, 0.0),
    "RightArm": (-118.0, -12.0, 20.0),
    "RightHand": (0.0, 0.0, 0.0),
    "LeftLeg": (0.0, 0.0, 0.0),
    "LeftFoot": (0.0, 0.0, 0.0),
    "RightLeg": (0.0, 0.0, 0.0),
    "RightFoot": (0.0, 0.0, 0.0),
}

BONES = tuple(BASE_ROT)


def radians(values):
    return tuple(math.radians(value) for value in values)


def pose(
    *,
    root_y=0.0,
    hips=None,
    spine=None,
    chest=None,
    head=None,
    flower=None,
    left_arm=None,
    left_hand=None,
    right_arm=None,
    right_hand=None,
    left_leg=None,
    left_foot=None,
    right_leg=None,
    right_foot=None,
):
    """Return a complete local pose using BASE_ROT plus explicit overrides."""

    rotations = {name: BASE_ROT[name] for name in BONES}
    overrides = {
        "Hips": hips,
        "Spine": spine,
        "Chest": chest,
        "Head": head,
        "Flower": flower,
        "LeftArm": left_arm,
        "LeftHand": left_hand,
        "RightArm": right_arm,
        "RightHand": right_hand,
        "LeftLeg": left_leg,
        "LeftFoot": left_foot,
        "RightLeg": right_leg,
        "RightFoot": right_foot,
    }
    for name, value in overrides.items():
        if value is not None:
            rotations[name] = value
    return {"root_y": root_y, "rotations": rotations}


def idle_poses():
    return {
        0: pose(),
        30: pose(
            spine=(2, 0, 0),
            chest=(1, 0, 0),
            head=(0, 7, 2),
            right_arm=(-115, -11, 21),
            flower=(0, 2, 0),
        ),
        60: pose(
            spine=(0, 0, 0),
            chest=(0, 0, 0),
            head=(0, -7, -2),
            right_arm=(-118, -12, 20),
            flower=(0, -2, 0),
        ),
        90: pose(
            spine=(-2, 0, 0),
            chest=(-1, 0, 0),
            head=(0, -7, -2),
            right_arm=(-121, -13, 19),
            flower=(0, -2, 0),
        ),
        120: pose(),
    }


def run_poses():
    return {
        0: pose(
            spine=(10, 0, 0),
            head=(0, 2, 0),
            left_arm=(35, 0, -12),
            right_arm=(-145, -12, 32),
            left_leg=(0, -25, 0),
            right_leg=(0, 25, 0),
            left_foot=(4, 0, 0),
            right_foot=(-6, 0, 0),
        ),
        7: pose(
            spine=(10, 0, 0),
            head=(0, 0, 0),
            left_arm=(10, 0, -4),
            right_arm=(-128, -12, 24),
            left_leg=(0, 15, 0),
            right_leg=(0, -15, 0),
            left_foot=(8, 0, 0),
            right_foot=(-8, 0, 0),
        ),
        15: pose(
            spine=(10, 0, 0),
            head=(0, -2, 0),
            left_arm=(145, 0, 32),
            right_arm=(-165, -12, -12),
            left_leg=(0, 25, 0),
            right_leg=(0, -25, 0),
            left_foot=(-6, 0, 0),
            right_foot=(4, 0, 0),
        ),
        22: pose(
            spine=(10, 0, 0),
            head=(0, 0, 0),
            left_arm=(128, 0, 24),
            right_arm=(-10, -12, -4),
            left_leg=(0, -15, 0),
            right_leg=(0, 15, 0),
            left_foot=(-8, 0, 0),
            right_foot=(8, 0, 0),
        ),
        30: pose(
            spine=(10, 0, 0),
            head=(0, 2, 0),
            left_arm=(35, 0, -12),
            right_arm=(-145, -12, 32),
            left_leg=(0, -25, 0),
            right_leg=(0, 25, 0),
            left_foot=(4, 0, 0),
            right_foot=(-6, 0, 0),
        ),
    }


def attack_poses():
    return {
        0: pose(right_arm=(-145, -15, 16), right_hand=(0, 0, 0), head=(0, 0, 0)),
        4: pose(
            spine=(2, 0, 0),
            right_arm=(-165, -6, 14),
            right_hand=(0, -0.08, 0),
            head=(0, 12, 0),
            left_arm=(25, 0, -5),
        ),
        7: pose(
            spine=(3, 0, 0),
            right_arm=(-170, -4, 12),
            right_hand=(0, -0.12, -5),
            head=(0, 20, 0),
            left_arm=(30, 0, -7),
        ),
        12: pose(
            spine=(1, 0, 0),
            right_arm=(-155, -10, 18),
            right_hand=(0, -0.04, 0),
            head=(0, 10, 0),
            left_arm=(15, 0, -3),
        ),
        18: pose(right_arm=(-145, -15, 16), right_hand=(0, 0, 0), head=(0, 0, 0)),
    }


def super_poses():
    return {
        0: pose(),
        10: pose(
            root_y=-0.25,
            hips=(34, 0, 0),
            spine=(25, 0, 0),
            head=(20, 0, 0),
            left_arm=(-10, 0, -28),
            left_hand=(0, -0.06, 0),
            right_arm=(-132, -8, 36),
            right_hand=(0, -0.06, 0),
            left_leg=(48, 0, 0),
            right_leg=(48, 0, 0),
            left_foot=(-22, 0, 0),
            right_foot=(-22, 0, 0),
        ),
        18: pose(
            root_y=-0.25,
            hips=(38, 0, 0),
            spine=(30, 0, 0),
            head=(22, 0, 0),
            left_arm=(-18, 0, -34),
            left_hand=(0, -0.08, 0),
            right_arm=(-138, -8, 42),
            right_hand=(0, -0.08, 0),
            left_leg=(56, 0, 0),
            right_leg=(56, 0, 0),
            left_foot=(-28, 0, 0),
            right_foot=(-28, 0, 0),
        ),
        22: pose(
            root_y=-0.16,
            hips=(32, 0, 0),
            spine=(18, 0, 0),
            head=(10, 0, 0),
            left_arm=(20, 0, -18),
            right_arm=(-150, -8, 32),
            left_leg=(38, 0, 0),
            right_leg=(38, 0, 0),
            left_foot=(-18, 0, 0),
            right_foot=(-18, 0, 0),
        ),
        35: pose(
            hips=(30, 0, 0),
            spine=(3, 0, 0),
            head=(2, 0, 0),
            left_arm=(20, 0, -8),
            right_arm=(-150, -10, 22),
            left_leg=(8, 0, 0),
            right_leg=(8, 0, 0),
        ),
        45: pose(),
    }


def aim_poses():
    return {
        0: pose(
            chest=(0, 0, 20),
            head=(0, 25, 0),
            left_arm=(8, 0, -18),
            left_hand=(0, -0.05, 0),
            right_arm=(-165, -5, 18),
            right_hand=(0, -0.11, 0),
        ),
        30: pose(
            spine=(1, 0, 0),
            chest=(1, 0, 20),
            head=(0, 25, 0),
            left_arm=(8, 0, -18),
            left_hand=(0, -0.05, 0),
            right_arm=(-160, -5, 18),
            right_hand=(0, -0.10, 0),
        ),
        60: pose(
            chest=(0, 0, 20),
            head=(0, 25, 0),
            left_arm=(8, 0, -18),
            left_hand=(0, -0.05, 0),
            right_arm=(-165, -5, 18),
            right_hand=(0, -0.11, 0),
        ),
    }


def aim_super_poses():
    return {
        0: pose(
            hips=(30, 0, 0),
            spine=(15, 0, 0),
            head=(15, 0, 0),
            left_arm=(22, 0, -22),
            left_hand=(0, -0.05, 0),
            right_arm=(-150, -8, 28),
            right_hand=(0, -0.05, 0),
        ),
        30: pose(
            hips=(30, 0, 0),
            spine=(17, 0, 0),
            head=(15, 0, 0),
            left_arm=(25, 0, -22),
            left_hand=(0, -0.05, 0),
            right_arm=(-147, -8, 28),
            right_hand=(0, -0.05, 0),
        ),
        60: pose(
            hips=(30, 0, 0),
            spine=(15, 0, 0),
            head=(15, 0, 0),
            left_arm=(22, 0, -22),
            left_hand=(0, -0.05, 0),
            right_arm=(-150, -8, 28),
            right_hand=(0, -0.05, 0),
        ),
    }


def hit_poses():
    return {
        0: pose(),
        3: pose(
            spine=(-15, 0, 0),
            chest=(-8, 0, 0),
            head=(-15, 0, 0),
            left_arm=(35, 0, -12),
            right_arm=(-150, -8, 28),
            left_hand=(0, 0.04, 0),
            right_hand=(0, 0.04, 0),
            left_leg=(10, 0, 0),
            right_leg=(10, 0, 0),
        ),
        6: pose(
            spine=(-18, 0, 0),
            chest=(-10, 0, 0),
            head=(-17, 0, 0),
            left_arm=(42, 0, -14),
            right_arm=(-145, -8, 30),
            left_hand=(0, 0.05, 0),
            right_hand=(0, 0.05, 0),
            left_leg=(12, 0, 0),
            right_leg=(12, 0, 0),
        ),
        9: pose(
            spine=(-4, 0, 0),
            chest=(-2, 0, 0),
            head=(-4, 0, 0),
            left_arm=(20, 0, -6),
            right_arm=(-145, -10, 22),
            left_leg=(4, 0, 0),
            right_leg=(4, 0, 0),
        ),
        12: pose(),
    }


def death_poses():
    return {
        0: pose(),
        10: pose(
            root_y=-0.10,
            hips=(34, 0, 0),
            spine=(15, 0, 0),
            head=(10, 0, 0),
            left_arm=(25, 0, -10),
            right_arm=(-140, -12, 18),
            left_leg=(35, 0, 0),
            right_leg=(35, 0, 0),
        ),
        20: pose(
            root_y=-0.35,
            hips=(42, 0, 0),
            spine=(40, 0, 0),
            head=(30, 0, 0),
            left_arm=(35, 0, -18),
            right_arm=(-140, -12, 22),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
            left_foot=(-45, 0, 0),
            right_foot=(-45, 0, 0),
        ),
        35: pose(
            root_y=-0.35,
            hips=(42, 0, 0),
            spine=(42, 0, 0),
            head=(30, 0, 0),
            left_arm=(42, 0, -18),
            right_arm=(-145, -12, 22),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
            left_foot=(-48, 0, 0),
            right_foot=(-48, 0, 0),
        ),
        45: pose(
            root_y=-0.35,
            hips=(42, 0, 0),
            spine=(42, 0, 0),
            head=(30, 0, 0),
            left_arm=(42, 0, -18),
            right_arm=(-145, -12, 22),
            left_leg=(70, 0, 0),
            right_leg=(70, 0, 0),
            left_foot=(-48, 0, 0),
            right_foot=(-48, 0, 0),
        ),
    }


def spawn_poses():
    return {
        0: pose(
            root_y=-0.30,
            hips=(42, 0, 0),
            spine=(50, 0, 0),
            head=(30, 0, 0),
            left_arm=(30, 0, -28),
            right_arm=(-145, -12, 28),
            left_leg=(65, 0, 0),
            right_leg=(65, 0, 0),
            left_foot=(-38, 0, 0),
            right_foot=(-38, 0, 0),
        ),
        10: pose(
            root_y=-0.15,
            hips=(38, 0, 0),
            spine=(30, 0, 0),
            head=(20, 0, 0),
            left_arm=(28, 0, -18),
            right_arm=(-145, -12, 24),
            left_leg=(45, 0, 0),
            right_leg=(45, 0, 0),
            left_foot=(-22, 0, 0),
            right_foot=(-22, 0, 0),
        ),
        25: pose(
            hips=(32, 0, 0),
            spine=(10, 0, 0),
            head=(7, 0, 0),
            left_arm=(55, 0, -30),
            right_arm=(-165, -8, 38),
            left_leg=(15, 0, 0),
            right_leg=(15, 0, 0),
        ),
        35: pose(left_arm=(45, 0, -20), right_arm=(-155, -10, 30)),
        45: pose(),
    }


def victory_poses():
    return {
        0: pose(),
        15: pose(
            spine=(-5, 0, 0),
            head=(-10, 0, 0),
            left_arm=(75, 0, -70),
            right_arm=(-170, -8, 80),
            left_hand=(-8, 0, 0),
            right_hand=(-8, 0, 0),
        ),
        30: pose(
            spine=(-6, 0, 0),
            head=(-11, 0, 0),
            left_arm=(90, 0, -78),
            right_arm=(-175, -8, 88),
            left_hand=(-10, 0, 0),
            right_hand=(-10, 0, 0),
            flower=(0, 3, 0),
        ),
        45: pose(
            spine=(-2, 0, 0),
            head=(-4, 0, 0),
            left_arm=(55, 0, -40),
            right_arm=(-155, -10, 48),
            left_hand=(-4, 0, 0),
            right_hand=(-4, 0, 0),
        ),
        60: pose(),
    }


def gadget_poses():
    return {
        0: pose(),
        2: pose(
            hips=(32, 0, 0),
            spine=(20, 0, 0),
            head=(15, 0, 0),
            left_arm=(28, 0, -15),
            right_arm=(-145, -12, 28),
            left_leg=(15, 0, 0),
            right_leg=(15, 0, 0),
        ),
        5: pose(
            hips=(34, 0, 0),
            spine=(25, 0, 0),
            head=(18, 0, 0),
            left_arm=(35, 0, -18),
            right_arm=(-150, -12, 30),
            left_leg=(18, 0, 0),
            right_leg=(18, 0, 0),
        ),
        8: pose(
            hips=(30, 0, 0),
            spine=(8, 0, 0),
            head=(6, 0, 0),
            left_arm=(20, 0, -7),
            right_arm=(-145, -12, 24),
            left_leg=(5, 0, 0),
            right_leg=(5, 0, 0),
        ),
        10: pose(),
    }


def aim_gadget_poses():
    return {
        0: pose(
            root_y=-0.10,
            hips=(30, 0, 0),
            spine=(25, 0, 0),
            head=(-5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-145, -12, 34),
            left_leg=(30, 0, 0),
            right_leg=(30, 0, 0),
        ),
        30: pose(
            root_y=-0.10,
            hips=(30, 0, 0),
            spine=(27, 0, 0),
            head=(-5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-145, -12, 34),
            left_leg=(30, 0, 0),
            right_leg=(30, 0, 0),
        ),
        60: pose(
            root_y=-0.10,
            hips=(30, 0, 0),
            spine=(25, 0, 0),
            head=(-5, 0, 0),
            left_arm=(25, 0, -30),
            right_arm=(-145, -12, 34),
            left_leg=(30, 0, 0),
            right_leg=(30, 0, 0),
        ),
    }


POSE_BUILDERS = {
    "idle": idle_poses,
    "run": run_poses,
    "attack": attack_poses,
    "super": super_poses,
    "aim": aim_poses,
    "aim-super": aim_super_poses,
    "hit": hit_poses,
    "death": death_poses,
    "spawn": spawn_poses,
    "victory": victory_poses,
    "gadget": gadget_poses,
    "aim-gadget": aim_gadget_poses,
}


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def clear_actions(keep=None):
    for action in list(bpy.data.actions):
        if action == keep:
            continue
        action.user_clear()
        bpy.data.actions.remove(action)


def reset_pose(armature):
    for name in BONES:
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def apply_pose(armature, data):
    reset_pose(armature)
    for name, values in data["rotations"].items():
        armature.pose.bones[name].rotation_euler = radians(values)
    # NeedleRig's Root bone is oriented so local Y maps to Blender world Z.
    # Local Z maps to depth and would make crouches look like forward falls.
    armature.pose.bones["Root"].location.y = float(data["root_y"])


def key_pose(armature, action, frame, data):
    apply_pose(armature, data)
    for name in BONES:
        bone = armature.pose.bones[name]
        bone.keyframe_insert("location", frame=frame)
        bone.keyframe_insert("rotation_euler", frame=frame)
        bone.keyframe_insert("scale", frame=frame)


def smooth_action(action):
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = FRAME_ENDS[clip]
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None or armature.name != "NeedleRig":
        raise RuntimeError(f"{clip}: expected NeedleRig armature")
    if set(armature.data.bones.keys()) != set(BONES):
        raise RuntimeError(f"{clip}: live rig bone set changed")

    armature.animation_data_clear()
    clear_actions()
    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    poses = POSE_BUILDERS[clip]()
    expected_end = FRAME_ENDS[clip]
    if min(poses) != 0 or max(poses) != expected_end:
        raise RuntimeError(f"{clip}: pose frames do not cover 0..{expected_end}")
    for frame in sorted(poses):
        key_pose(armature, action, frame, poses[frame])
    smooth_action(action)
    scene.frame_set(0)

    scene.name = f"needle_{clip}"
    scene["hero_slug"] = HERO
    scene["clip_name"] = ACTION_NAMES[clip]
    scene["clip_slug"] = clip
    scene["clip_kind"] = (
        "ability"
        if clip in ABILITY_CLIPS
        else (
            "aim"
            if clip.startswith("aim")
            else ("locomotion" if clip in {"idle", "run"} else "event")
        )
    )
    scene["frame_start"] = 0
    scene["frame_end"] = expected_end
    scene["fps"] = FPS
    scene["authoring_status"] = "READY_FOR_REVIEW"
    scene["source_of_truth"] = os.fspath(MASTER.relative_to(ROOT))
    scene["root_motion_contract"] = (
        "Root local X/Z locked; Root local Y is world-up and authored only for super/death/spawn/aim-gadget"
    )
    scene["cycle_contract"] = (
        "frame 0 equals frame end" if clip in CYCLE_CLIPS else "one-shot"
    )

    target = SCENES / f"{clip}.blend"
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(target))
    curves = action_fcurves(action)
    frames = [point.co[0] for curve in curves for point in curve.keyframe_points]
    return {
        "clip": clip,
        "action": action.name,
        "file": os.fspath(target.relative_to(ROOT)),
        "frame_start": int(min(frames)),
        "frame_end": int(max(frames)),
        "fps": FPS,
        "curves": len(curves),
        "keyframes": sum(len(curve.keyframe_points) for curve in curves),
        "cycle": clip in CYCLE_CLIPS,
    }


def main():
    if not MASTER.exists():
        raise FileNotFoundError(MASTER)
    report = [author_clip(clip) for clip in ACTION_NAMES]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps({"hero": HERO, "clips": report}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {"hero": HERO, "scenes": len(report), "report": os.fspath(REPORT)},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
