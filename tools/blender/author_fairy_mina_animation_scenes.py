"""Author Fairy Mina focused animation scenes on the measured live rig.

The text brief is expressed in generic humanoid names.  This adapter keeps
those intentions behind Fairy Mina's measured `*_s` bones and deliberately
captures only the source's visual arm/wing baseline; old animation Actions are
never copied into the new pack.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/author_fairy_mina_animation_scenes.py
  FAIRY_MINA_CLIP_FILTER=idle blender --background --python tools/blender/author_fairy_mina_animation_scenes.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
HERO = "fairy-mina"
MASTER = ROOT / "frontend" / "assets-source" / "heroes" / HERO / "fairy-mina.blend"
SCENES = MASTER.parent / "scenes"
REPORT = ROOT / "artifacts" / "fairy-mina-animation-authoring.json"
DIAGNOSTIC = ROOT / "artifacts" / "fairy-mina-rig-axis-diagnostic.json"
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
    "idle": 90,
    "run": 24,
    "attack": 18,
    "super": 55,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 14,
    "aim-gadget": 60,
}
CYCLE_CLIPS = {"idle", "run", "aim", "aim-super", "aim-gadget"}
ABILITY_CLIPS = {"attack", "super", "gadget"}

SPINE_BONES = (
    "spine_upper_s",
    "spine_mid_upper_s",
    "spine_mid_s",
    "spine_mid_lower_s",
)
FINGER_PREFIXES = (
    "R_middle_",
    "R_ring_",
    "R_index_",
    "R_pinky_",
    "R_thumb_",
    "L_middle_",
    "L_ring_",
    "L_index_",
    "L_pinky_",
    "L_thumb_",
)


def radians(values):
    return tuple(math.radians(value) for value in values)


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def smooth_action(action):
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def clear_actions(keep=None):
    for action in list(bpy.data.actions):
        if action == keep:
            continue
        action.user_clear()
        bpy.data.actions.remove(action)


def source_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(armatures) != 1 or armatures[0].name != "fairy-mina-rig":
        raise RuntimeError(
            f"expected fairy-mina-rig, found {[obj.name for obj in armatures]}"
        )
    return armatures[0]


def capture_baseline(armature):
    """Capture visual source placement, then neutralize legacy body offsets."""

    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    rotations = {
        bone.name: tuple(float(value) for value in bone.rotation_euler)
        for bone in armature.pose.bones
    }
    locations = {
        bone.name: tuple(float(value) for value in bone.location)
        for bone in armature.pose.bones
    }
    scales = {
        bone.name: tuple(float(value) for value in bone.scale)
        for bone in armature.pose.bones
    }

    # The source's arm placement and wing spread are visual bind details.  Its
    # small hips/spine offsets are legacy animation data and must not become a
    # permanent lean in every new Action.
    for name in ("hips_s", "chest_s", "neck_s", "head_s", *SPINE_BONES):
        if name in rotations:
            rotations[name] = (0.0, 0.0, 0.0)
    for name in rotations:
        if name.startswith("R_dreadlocks_") or name.startswith("L_dreadlocks_"):
            rotations[name] = (0.0, 0.0, 0.0)
    return {"rotations": rotations, "locations": locations, "scales": scales}


def pose(baseline, *, root_up=0.0, rotations=None, fingers_open=True):
    data = {
        "root_up": float(root_up),
        "rotations": dict(baseline["rotations"]),
        "locations": dict(baseline["locations"]),
        "scales": dict(baseline["scales"]),
    }
    if rotations:
        for name, values in rotations.items():
            if name not in data["rotations"]:
                raise KeyError(f"Fairy Mina pose references missing bone {name}")
            data["rotations"][name] = tuple(float(value) for value in values)
    # Explicitly keep the hands open.  This is a measured finger-level accent,
    # not a made-up generic Hand bone from the prose brief.
    if fingers_open:
        for name in data["rotations"]:
            if name.startswith(FINGER_PREFIXES):
                data["rotations"][name] = baseline["rotations"][name]
    data["locations"]["hips_s"] = (0.0, float(root_up), 0.0)
    data["locations"]["waterball_s"] = (0.0, 0.0, 0.0)
    data["rotations"]["waterball_s"] = (0.0, 0.0, 0.0)
    data["scales"]["waterball_s"] = (1.0, 1.0, 1.0)
    return data


def mina_idle_poses(baseline):
    # The measured arm bones use local Euler axes unlike the prose's generic
    # Arm/Forearm names.  These values are calibrated to the actual shoulder,
    # elbow and wrist chains; torso pitch remains deliberately near vertical.
    def frame(root_up, sway, arm_lift, head_yaw, leg_sway):
        return pose(
            baseline,
            root_up=root_up,
            rotations={
                "hips_s": radians((-1.0, sway, 0.0)),
                **{name: radians((0.0, sway * 0.35, 0.0)) for name in SPINE_BONES},
                "chest_s": radians((1.0, sway * 0.2, 0.0)),
                "head_s": radians((-2.0, head_yaw, -3.0)),
                "R_shoulder_s": radians((70.0 + arm_lift, 10.0 + sway, 30.0)),
                # Fairy Mina's elbow X axis is inverted relative to the
                # generic pose brief: negative X folds the arm across the
                # torso, while positive X keeps the wrist on its own side.
                "R_elbow_s": radians((52.0, 0.0, 0.0)),
                "R_wrist_s": radians((12.0, 8.0, 8.0)),
                "L_shoulder_s": radians((62.0 - arm_lift * 0.5, -10.0 + sway, -30.0)),
                "L_elbow_s": radians((52.0, 0.0, 0.0)),
                "L_wrist_s": radians((12.0, -8.0, -8.0)),
                "R_upperLeg_s": radians((leg_sway, 0.0, 0.0)),
                "L_upperLeg_s": radians((-leg_sway * 0.6, 0.0, 0.0)),
                "R_wing_down_s": radians((0.0, -10.0 - arm_lift * 0.15, 0.0)),
                "L_wing_down_s": radians((0.0, 10.0 + arm_lift * 0.15, 0.0)),
                "R_wing_up_s": radians((0.0, -5.0 - arm_lift * 0.1, 0.0)),
                "L_wing_up_s": radians((0.0, 5.0 + arm_lift * 0.1, 0.0)),
            },
        )

    # On this rig the elbow's local X axis is mirrored from the generic
    # authoring convention used by the pose tables.  Keep the public pose
    # values readable (negative means a compact bend) but invert the value
    # at the rig boundary so neither hand crosses the torso.
    return {
        0: frame(0.0, 0.0, 0.0, 0.0, 3.0),
        25: frame(0.02, 5.0, 4.0, 10.0, 2.0),
        50: frame(0.0, -5.0, -3.0, -10.0, -2.0),
        75: frame(-0.02, 2.0, 2.0, 4.0, 1.0),
        90: frame(0.0, 0.0, 0.0, 0.0, 3.0),
    }


def copy_pose(source, *, root_up=None, rotations=None, scale=None):
    data = {
        "root_up": source["root_up"] if root_up is None else float(root_up),
        "rotations": dict(source["rotations"]),
        "locations": dict(source["locations"]),
        "scales": dict(source["scales"]),
    }
    if rotations:
        for name, values in rotations.items():
            data["rotations"][name] = tuple(float(value) for value in values)
    if scale:
        data["scales"].update(scale)
    data["locations"]["hips_s"] = (0.0, data["root_up"], 0.0)
    data["locations"]["waterball_s"] = (0.0, 0.0, 0.0)
    data["rotations"]["waterball_s"] = (0.0, 0.0, 0.0)
    data["scales"]["waterball_s"] = (1.0, 1.0, 1.0)
    return data


def blend_pose(left, right, amount):
    """Interpolate a rig-space pose without letting a long segment snap."""

    amount = max(0.0, min(1.0, float(amount)))
    return {
        "root_up": left["root_up"] + (right["root_up"] - left["root_up"]) * amount,
        "rotations": {
            name: tuple(
                left["rotations"][name][axis]
                + (right["rotations"][name][axis] - left["rotations"][name][axis])
                * amount
                for axis in range(3)
            )
            for name in left["rotations"]
        },
        "locations": {
            name: tuple(
                left["locations"][name][axis]
                + (right["locations"][name][axis] - left["locations"][name][axis])
                * amount
                for axis in range(3)
            )
            for name in left["locations"]
        },
        "scales": {
            name: tuple(
                left["scales"][name][axis]
                + (right["scales"][name][axis] - left["scales"][name][axis]) * amount
                for axis in range(3)
            )
            for name in left["scales"]
        },
    }


def resample_poses(poses, end_frame):
    """Add a controlled pose sample at every frame between story keys.

    The source rig has long, compound Euler rotations.  Leaving a 4–10 frame
    gap to Blender's Bezier solver creates shoulder and root-speed spikes even
    with AUTO_CLAMPED handles.  Per-frame samples preserve the intended story
    keys while making the actual motion rate explicit and testable.
    """

    keys = sorted(poses)
    result = {}
    for frame in range(0, end_frame + 1):
        if frame in poses:
            result[frame] = poses[frame]
            continue
        right_index = next(index for index, key in enumerate(keys) if key > frame)
        left_key = keys[right_index - 1]
        right_key = keys[right_index]
        amount = (frame - left_key) / (right_key - left_key)
        result[frame] = blend_pose(poses[left_key], poses[right_key], amount)
    return result


def side_arm(
    right=True, *, shoulder=(-82.0, 12.0, 32.0), elbow=-58.0, wrist=(12.0, 8.0, 8.0)
):
    sign = 1.0 if right else -1.0
    side = "R" if right else "L"
    return {
        f"{side}_shoulder_s": radians(
            (-shoulder[0], shoulder[1] * sign, shoulder[2] * sign)
        ),
        f"{side}_elbow_s": radians((-elbow, 0.0, 0.0)),
        f"{side}_wrist_s": radians((wrist[0], wrist[1] * sign, wrist[2] * sign)),
    }


def wing_pose(*, lift=0.0, fold=0.0):
    return {
        "R_wing_down_s": radians((0.0, -10.0 + fold - lift, 0.0)),
        "L_wing_down_s": radians((0.0, 10.0 - fold + lift, 0.0)),
        "R_wing_up_s": radians((0.0, -5.0 + fold * 0.5 - lift * 0.5, 0.0)),
        "L_wing_up_s": radians((0.0, 5.0 - fold * 0.5 + lift * 0.5, 0.0)),
    }


def finger_pose(curl=0.0):
    rotations = {}
    for prefix in FINGER_PREFIXES:
        side = -1.0 if prefix.startswith("R_") else 1.0
        rotations[f"{prefix}01_s"] = radians((side * curl, 0.0, 0.0))
        rotations[f"{prefix}02_s"] = radians((side * curl * 0.7, 0.0, 0.0))
    return rotations


def body(*, hips=0.0, spine=0.0, chest=0.0, head=0.0, yaw=0.0, roll=0.0):
    return {
        "hips_s": radians((hips, yaw, roll)),
        **{name: radians((spine, yaw * 0.3, roll * 0.2)) for name in SPINE_BONES},
        "chest_s": radians((chest, yaw * 0.2, roll * 0.15)),
        "head_s": radians((head, yaw * 0.8, head * 0.5)),
    }


def run_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    frames = {}
    for frame, mirror, lift in (
        (0, 1, 0.02),
        (6, -1, 0.0),
        (12, -1, 0.02),
        (18, 1, 0.0),
        (24, 1, 0.02),
    ):
        rotations = {
            **body(hips=2.0, spine=4.0, chest=2.0, head=-2.0, yaw=mirror * 4.0),
            **side_arm(True, shoulder=(-72.0, 18.0 * mirror, 36.0), elbow=-55.0),
            **side_arm(False, shoulder=(-72.0, -18.0 * mirror, -36.0), elbow=-55.0),
            "R_upperLeg_s": radians((28.0 * mirror, 0.0, 0.0)),
            "L_upperLeg_s": radians((-22.0 * mirror, 0.0, 0.0)),
            "R_lowerLeg_s": radians((-12.0 * mirror, 0.0, 0.0)),
            "L_lowerLeg_s": radians((10.0 * mirror, 0.0, 0.0)),
            **wing_pose(lift=8.0 * mirror),
        }
        frames[frame] = copy_pose(
            idle if frame in {0, 24} else pose(baseline),
            root_up=lift * (1 if mirror > 0 else -1),
            rotations=rotations,
        )
    return frames


def attack_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    return {
        0: idle,
        4: copy_pose(
            idle,
            rotations={
                **body(hips=-3.0, spine=-2.0, chest=-2.0, head=2.0),
                **side_arm(
                    True,
                    shoulder=(-78.0, 18.0, 38.0),
                    elbow=-120.0,
                    wrist=(20.0, 12.0, 8.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-104.0, 26.0, 50.0),
                    elbow=-72.0,
                    wrist=(20.0, -8.0, -8.0),
                ),
                **wing_pose(lift=-8.0, fold=4.0),
            },
        ),
        8: copy_pose(
            idle,
            rotations={
                **body(hips=2.0, spine=4.0, chest=2.0, head=-2.0),
                **side_arm(
                    True,
                    shoulder=(-98.0, 0.0, 10.0),
                    elbow=-95.0,
                    wrist=(-15.0, 0.0, -10.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-90.0, 10.0, 30.0),
                    elbow=-70.0,
                    wrist=(10.0, -8.0, -10.0),
                ),
                **wing_pose(lift=14.0),
                **finger_pose(-8.0),
            },
        ),
        12: copy_pose(
            idle,
            rotations={
                **body(hips=0.0, spine=2.0, chest=1.0, head=0.0),
                **side_arm(
                    True,
                    shoulder=(-102.0, -18.0, -28.0),
                    elbow=-92.0,
                    wrist=(-20.0, -12.0, -18.0),
                ),
                **side_arm(False, shoulder=(-78.0, 18.0, 35.0), elbow=-64.0),
                **wing_pose(lift=5.0),
            },
        ),
        18: idle,
    }


def super_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    return {
        0: idle,
        12: copy_pose(
            idle,
            root_up=-0.08,
            rotations={
                **body(hips=-3.0, spine=4.0, chest=2.0, head=3.0),
                **side_arm(
                    True,
                    shoulder=(-104.0, -20.0, -22.0),
                    elbow=-100.0,
                    wrist=(24.0, -10.0, -12.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-104.0, 20.0, 22.0),
                    elbow=-100.0,
                    wrist=(24.0, 10.0, 12.0),
                ),
                **wing_pose(lift=-8.0, fold=12.0),
                **finger_pose(24.0),
            },
        ),
        25: copy_pose(
            idle,
            root_up=0.12,
            rotations={
                **body(hips=3.0, spine=-3.0, chest=-2.0, head=-3.0, yaw=3.0),
                **side_arm(
                    True,
                    shoulder=(-128.0, 18.0, 58.0),
                    elbow=-42.0,
                    wrist=(28.0, 18.0, 24.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-128.0, -18.0, -58.0),
                    elbow=-42.0,
                    wrist=(28.0, -18.0, -24.0),
                ),
                **wing_pose(lift=26.0),
                **finger_pose(-10.0),
            },
        ),
        40: copy_pose(
            idle,
            root_up=0.0,
            rotations={
                **body(hips=1.0, spine=1.0, chest=1.0, head=0.0),
                **side_arm(True, shoulder=(-92.0, 16.0, 38.0), elbow=-58.0),
                **side_arm(False, shoulder=(-92.0, -16.0, -38.0), elbow=-58.0),
                **wing_pose(lift=8.0),
            },
        ),
        55: idle,
    }


def aim_poses(baseline):
    ready = copy_pose(
        mina_idle_poses(baseline)[0],
        rotations={
            **body(hips=-2.0, spine=4.0, chest=2.0, head=-2.0, yaw=4.0),
            **side_arm(
                True,
                shoulder=(-122.0, -22.0, -44.0),
                elbow=-138.0,
                wrist=(-38.0, -28.0, -44.0),
            ),
            **side_arm(
                False,
                shoulder=(-88.0, 26.0, 50.0),
                elbow=-100.0,
                wrist=(20.0, -12.0, -16.0),
            ),
            **wing_pose(lift=4.0),
        },
    )
    sway = copy_pose(
        ready,
        rotations={
            **body(hips=-2.0, spine=3.0, chest=2.0, head=-1.0, yaw=-3.0),
            **wing_pose(lift=-2.0),
        },
    )
    return {0: ready, 30: sway, 60: ready}


def aim_super_poses(baseline):
    def focus(root=-0.10, micro=0.0):
        return copy_pose(
            mina_idle_poses(baseline)[0],
            root_up=root,
            rotations={
                **body(hips=-4.0, spine=5.0, chest=3.0, head=5.0, yaw=micro),
                **side_arm(
                    True,
                    shoulder=(-106.0, 16.0, 22.0),
                    elbow=-98.0,
                    wrist=(18.0, 10.0, 10.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-106.0, -16.0, -22.0),
                    elbow=-98.0,
                    wrist=(18.0, -10.0, -10.0),
                ),
                **wing_pose(lift=-12.0, fold=10.0),
                **finger_pose(28.0),
            },
        )

    return {0: focus(micro=0.0), 30: focus(micro=2.0), 60: focus(micro=0.0)}


def hit_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    return {
        0: idle,
        3: copy_pose(
            idle,
            rotations={
                **body(hips=-4.0, spine=-4.0, chest=-3.0, head=-5.0),
                **side_arm(
                    True,
                    shoulder=(-112.0, 18.0, 34.0),
                    elbow=-68.0,
                    wrist=(28.0, 12.0, 18.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-46.0, -28.0, -58.0),
                    elbow=-45.0,
                    wrist=(30.0, -10.0, -18.0),
                ),
                **wing_pose(lift=18.0),
            },
        ),
        7: copy_pose(
            idle,
            rotations={
                **body(hips=-5.0, spine=-5.0, chest=-4.0, head=-7.0),
                **side_arm(
                    True,
                    shoulder=(-126.0, 22.0, 44.0),
                    elbow=-58.0,
                    wrist=(34.0, 12.0, 20.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-34.0, -34.0, -68.0),
                    elbow=-38.0,
                    wrist=(36.0, -10.0, -20.0),
                ),
                **wing_pose(lift=24.0),
            },
        ),
        10: copy_pose(
            idle,
            rotations={
                **body(hips=-1.0, spine=1.0, chest=1.0, head=-2.0),
                **wing_pose(lift=8.0),
            },
        ),
        12: idle,
    }


def death_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    fall = {
        **body(hips=-5.0, spine=5.0, chest=3.0, head=8.0, roll=20.0),
        **side_arm(
            True, shoulder=(-82.0, 26.0, 42.0), elbow=-52.0, wrist=(45.0, 24.0, 24.0)
        ),
        **side_arm(
            False,
            shoulder=(-72.0, -24.0, -44.0),
            elbow=-50.0,
            wrist=(42.0, -22.0, -20.0),
        ),
        **wing_pose(lift=-20.0, fold=22.0),
    }
    return {
        0: idle,
        10: copy_pose(
            idle,
            root_up=-0.08,
            rotations={
                **body(hips=-3.0, spine=4.0, chest=2.0, head=6.0),
                "R_upperLeg_s": radians((42.0, 0.0, 0.0)),
                "L_upperLeg_s": radians((42.0, 0.0, 0.0)),
                **wing_pose(lift=-8.0, fold=10.0),
            },
        ),
        20: copy_pose(
            idle,
            root_up=-0.30,
            rotations={
                **fall,
                "R_upperLeg_s": radians((60.0, 0.0, 0.0)),
                "L_upperLeg_s": radians((60.0, 0.0, 0.0)),
                "R_lowerLeg_s": radians((-30.0, 0.0, 0.0)),
                "L_lowerLeg_s": radians((-30.0, 0.0, 0.0)),
                **finger_pose(14.0),
            },
        ),
        30: copy_pose(
            idle,
            root_up=-0.36,
            rotations={
                **fall,
                "hips_s": radians((-5.0, 6.0, 25.0)),
                "R_upperLeg_s": radians((70.0, 0.0, 0.0)),
                "L_upperLeg_s": radians((68.0, 0.0, 0.0)),
                "R_lowerLeg_s": radians((-38.0, 0.0, 0.0)),
                "L_lowerLeg_s": radians((-38.0, 0.0, 0.0)),
                **finger_pose(18.0),
            },
        ),
        40: copy_pose(
            idle,
            root_up=-0.36,
            rotations={
                **fall,
                "hips_s": radians((-5.0, 6.0, 25.0)),
                "R_upperLeg_s": radians((70.0, 0.0, 0.0)),
                "L_upperLeg_s": radians((68.0, 0.0, 0.0)),
                **finger_pose(22.0),
            },
        ),
    }


def spawn_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    compact = {
        **body(hips=-5.0, spine=6.0, chest=3.0, head=7.0),
        **side_arm(
            True, shoulder=(-102.0, 18.0, 22.0), elbow=-105.0, wrist=(25.0, 10.0, 12.0)
        ),
        **side_arm(
            False,
            shoulder=(-102.0, -18.0, -22.0),
            elbow=-105.0,
            wrist=(25.0, -10.0, -12.0),
        ),
        **wing_pose(lift=-16.0, fold=18.0),
        **finger_pose(24.0),
    }
    open_pose = {
        **body(hips=0.0, spine=1.0, chest=1.0, head=-2.0),
        **side_arm(
            True, shoulder=(-126.0, 20.0, 58.0), elbow=-45.0, wrist=(26.0, 16.0, 20.0)
        ),
        **side_arm(
            False,
            shoulder=(-126.0, -20.0, -58.0),
            elbow=-45.0,
            wrist=(26.0, -16.0, -20.0),
        ),
        **wing_pose(lift=26.0),
        **finger_pose(-10.0),
    }
    return {
        0: copy_pose(idle, root_up=-0.22, rotations=compact),
        12: copy_pose(
            idle,
            root_up=-0.05,
            rotations={
                **body(hips=-2.0, spine=3.0, chest=2.0, head=4.0),
                **wing_pose(lift=-4.0, fold=8.0),
            },
        ),
        22: copy_pose(idle, root_up=0.0, rotations=open_pose),
        35: copy_pose(
            idle,
            root_up=0.0,
            rotations={
                **open_pose,
                **body(hips=1.0, spine=1.0, chest=1.0, head=-1.0),
                **wing_pose(lift=18.0),
            },
        ),
        45: idle,
    }


def victory_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    final_idle = copy_pose(idle, rotations={"hips_s": radians((0.0, 360.0, 0.0))})
    return {
        0: idle,
        10: copy_pose(
            idle,
            root_up=0.04,
            rotations={
                **body(hips=0.0, spine=-2.0, chest=-1.0, head=-3.0),
                "R_upperLeg_s": radians((24.0, 0.0, 0.0)),
                "L_upperLeg_s": radians((12.0, 0.0, 0.0)),
                **wing_pose(lift=12.0),
            },
        ),
        25: copy_pose(
            idle,
            root_up=0.10,
            rotations={
                **body(hips=0.0, spine=-1.0, chest=-1.0, head=-2.0),
                "hips_s": radians((0.0, 180.0, 0.0)),
                **side_arm(
                    True,
                    shoulder=(-132.0, 18.0, 56.0),
                    elbow=-36.0,
                    wrist=(30.0, 18.0, 24.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-132.0, -18.0, -56.0),
                    elbow=-36.0,
                    wrist=(30.0, -18.0, -24.0),
                ),
                **wing_pose(lift=28.0),
            },
        ),
        35: copy_pose(
            idle,
            root_up=0.0,
            rotations={
                **body(hips=0.0, spine=1.0, chest=1.0, head=0.0),
                "hips_s": radians((0.0, 360.0, 0.0)),
                **side_arm(
                    True,
                    shoulder=(-144.0, 22.0, 62.0),
                    elbow=-28.0,
                    wrist=(34.0, 22.0, 28.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-112.0, -30.0, -72.0),
                    elbow=-52.0,
                    wrist=(24.0, -16.0, -22.0),
                ),
                **wing_pose(lift=22.0),
            },
        ),
        30: copy_pose(
            idle,
            root_up=0.05,
            rotations={
                **body(hips=0.0, spine=0.0, chest=0.0, head=-1.0),
                "hips_s": radians((0.0, 270.0, 0.0)),
                **side_arm(
                    True,
                    shoulder=(-138.0, 20.0, 58.0),
                    elbow=-30.0,
                    wrist=(32.0, 20.0, 26.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-124.0, -24.0, -62.0),
                    elbow=-46.0,
                    wrist=(26.0, -18.0, -24.0),
                ),
                **wing_pose(lift=25.0),
            },
        ),
        50: copy_pose(
            idle,
            rotations={
                **body(hips=0.0, spine=0.0, chest=0.0, head=-2.0),
                "hips_s": radians((0.0, 360.0, 0.0)),
                **side_arm(
                    True,
                    shoulder=(-100.0, 12.0, 38.0),
                    elbow=-50.0,
                    wrist=(18.0, 12.0, 14.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-86.0, -12.0, -40.0),
                    elbow=-54.0,
                    wrist=(18.0, -12.0, -14.0),
                ),
                **wing_pose(lift=10.0),
            },
        ),
        60: final_idle,
    }


def gadget_poses(baseline):
    idle = mina_idle_poses(baseline)[0]
    return {
        0: idle,
        3: copy_pose(
            idle,
            root_up=-0.06,
            rotations={
                **body(hips=-3.0, spine=3.0, chest=2.0, head=2.0),
                **side_arm(
                    True,
                    shoulder=(-102.0, 16.0, 24.0),
                    elbow=-92.0,
                    wrist=(22.0, 10.0, 12.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-102.0, -16.0, -24.0),
                    elbow=-92.0,
                    wrist=(22.0, -10.0, -12.0),
                ),
                **wing_pose(lift=-8.0, fold=10.0),
            },
        ),
        6: copy_pose(
            idle,
            root_up=0.05,
            rotations={
                **body(hips=2.0, spine=-2.0, chest=-1.0, head=-2.0),
                **side_arm(
                    True,
                    shoulder=(-116.0, 18.0, 44.0),
                    elbow=-58.0,
                    wrist=(26.0, 16.0, 20.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-116.0, -18.0, -44.0),
                    elbow=-58.0,
                    wrist=(26.0, -16.0, -20.0),
                ),
                **wing_pose(lift=30.0),
                **finger_pose(-12.0),
            },
        ),
        10: copy_pose(
            idle,
            rotations={
                **body(hips=0.0, spine=1.0, chest=1.0, head=0.0),
                **wing_pose(lift=12.0),
            },
        ),
        14: idle,
    }


def aim_gadget_poses(baseline):
    def charge(micro=0.0):
        return copy_pose(
            mina_idle_poses(baseline)[0],
            root_up=-0.08,
            rotations={
                **body(hips=-3.0, spine=4.0, chest=2.0, head=4.0, yaw=micro),
                **side_arm(
                    True,
                    shoulder=(-98.0, 12.0, 24.0),
                    elbow=-105.0,
                    wrist=(28.0, 18.0, 10.0),
                ),
                **side_arm(
                    False,
                    shoulder=(-98.0, -12.0, -24.0),
                    elbow=-105.0,
                    wrist=(28.0, -18.0, -10.0),
                ),
                **wing_pose(lift=-10.0, fold=10.0),
                **finger_pose(18.0),
            },
        )

    return {0: charge(), 30: charge(2.0), 60: charge()}


POSE_BUILDERS = {
    "idle": mina_idle_poses,
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


def apply_pose(armature, data):
    for name, values in data["rotations"].items():
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = values
    for name, values in data["locations"].items():
        armature.pose.bones[name].location = values
    for name, values in data["scales"].items():
        armature.pose.bones[name].scale = values


def key_pose(armature, action, frame, data):
    apply_pose(armature, data)
    for bone in armature.pose.bones:
        bone.keyframe_insert("location", frame=frame)
        bone.keyframe_insert("rotation_euler", frame=frame)
        bone.keyframe_insert("scale", frame=frame)


def author_clip(clip):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    scene = bpy.context.scene
    armature = source_armature()
    diagnostic = json.loads(DIAGNOSTIC.read_text(encoding="utf-8"))
    expected_bones = {item["name"] for item in diagnostic["bones"]}
    actual_bones = {bone.name for bone in armature.data.bones}
    if actual_bones != expected_bones:
        raise RuntimeError(f"{clip}: live rig bone set changed")
    baseline = capture_baseline(armature)

    scene.render.fps = FPS
    scene.frame_start = 0
    scene.frame_end = FRAME_ENDS[clip]
    armature.animation_data_clear()
    clear_actions()
    action = bpy.data.actions.new(ACTION_NAMES[clip])
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    expected_end = FRAME_ENDS[clip]
    poses = resample_poses(POSE_BUILDERS[clip](baseline), expected_end)
    if min(poses) != 0 or max(poses) != expected_end:
        raise RuntimeError(f"{clip}: pose frames do not cover 0..{expected_end}")
    for frame in sorted(poses):
        key_pose(armature, action, frame, poses[frame])
    smooth_action(action)
    scene.frame_set(0)

    scene.name = f"fairy_mina_{clip}"
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
        "hips_s local X/Z locked; hips_s local Y is Blender world-up; waterball_s locked"
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
    requested = os.environ.get("FAIRY_MINA_CLIP_FILTER")
    clips = [requested] if requested else list(ACTION_NAMES)
    unknown = [clip for clip in clips if clip not in ACTION_NAMES]
    if unknown:
        raise RuntimeError(f"unknown Fairy Mina clip filter: {unknown}")
    if any(clip not in POSE_BUILDERS for clip in clips):
        missing = [clip for clip in clips if clip not in POSE_BUILDERS]
        raise RuntimeError(f"pose builders not implemented yet: {missing}")
    report = [author_clip(clip) for clip in clips]
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
