"""Refine excessive idle sway and head angles in canonical master Actions.

This is a targeted second-pass refinement. It samples the already-authored
Actions, reduces only the requested amplitudes, then writes the result back to
the same master scene. The runtime exporter remains packaging-only.
"""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from author_brawl_style_animation_overhaul import (
    ACTION_NAMES,
    KEYS,
    RANGES,
    action_fcurves,
    blend_pose_towards,
    capture_pose,
    clone_pose,
    ensure_nla_inventory,
    find_action,
    find_armature,
    key_pose,
    resolve_rig,
    set_metadata,
    smooth_action,
)
from hero_animation_contract import ALL_HEROES, actions_for, master_path

# Keep enough motion for personality while cutting the visible rocking. The
# value is the amount of the original idle motion that remains.
IDLE_MOTION_KEEP = {
    "needle": 0.55,
    "brock-zeus": 0.60,
    "fairy-mina": 0.70,
    "kaze": 0.72,
    "mandy": 0.80,
    "persephone-lumi": 0.82,
    "wukong-mico": 0.78,
    "katty": 0.65,
}

KATTY_HEAD_MOTION_KEEP = 0.50
KATTY_HEAD_TARGET_Z = math.radians(-2.0)


def sample_action(scene, armature, action, frame):
    armature.animation_data_create()
    armature.animation_data.action = action
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    return capture_pose(armature)


def blend_towards_neutral(pose, neutral_pose, keep):
    result = clone_pose(pose)
    blend_pose_towards(result, neutral_pose, 1.0 - keep)
    return result


def adjust_katty_head(pose, head_name, original_neutral, corrected_neutral, keep):
    if not head_name or head_name not in pose:
        return
    data = pose[head_name]
    base = original_neutral[head_name]
    target = corrected_neutral[head_name]
    if data["mode"] == "QUATERNION":
        data["rotation_quaternion"] = target["rotation_quaternion"].slerp(
            data["rotation_quaternion"], keep
        )
        return
    for index in range(3):
        data["rotation_euler"][index] = (
            target["rotation_euler"][index]
            + (data["rotation_euler"][index] - base["rotation_euler"][index]) * keep
        )


def remove_canonical_nla_tracks(armature, hero):
    mapping = actions_for(hero)
    names = set(mapping.values())
    armature.animation_data_create()
    for track in list(armature.animation_data.nla_tracks):
        if track.name in mapping or any(strip.name in names for strip in track.strips):
            armature.animation_data.nla_tracks.remove(track)


def replace_action(
    scene,
    armature,
    hero,
    clip,
    source_action,
    rig,
    original_neutral,
    corrected_neutral,
):
    start, end = RANGES.get(
        clip,
        (
            int(round(source_action.frame_range[0])),
            int(round(source_action.frame_range[1])),
        ),
    )
    key_frames = KEYS.get(clip)
    if not key_frames:
        key_frames = tuple(
            sorted(
                {
                    int(round(point.co.x))
                    for curve in action_fcurves(source_action)
                    for point in curve.keyframe_points
                }
            )
        )
    key_frames = tuple(frame for frame in key_frames if start <= frame <= end)
    if not key_frames:
        return source_action

    sampled = {
        frame: sample_action(scene, armature, source_action, frame)
        for frame in key_frames
    }
    armature.animation_data.action = None
    old_props = list(source_action.items())
    old_name = source_action.name
    bpy.data.actions.remove(source_action)
    action = bpy.data.actions.new(ACTION_NAMES.get(clip, old_name))
    action.use_fake_user = True
    set_metadata(action, hero, clip, start, end, old_props)
    armature.animation_data.action = action

    processed = {}
    for frame, pose in sampled.items():
        if hero == "katty":
            adjust_katty_head(
                pose,
                rig.get("head"),
                original_neutral,
                corrected_neutral,
                KATTY_HEAD_MOTION_KEEP,
            )
        if clip == "idle":
            pose = blend_towards_neutral(
                pose, corrected_neutral, IDLE_MOTION_KEEP[hero]
            )
        processed[frame] = pose

    for frame in key_frames:
        key_pose(armature, processed[frame], frame)
    smooth_action(action)
    return action


def refine_hero(hero):
    path = master_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = find_armature()
    if armature is None:
        raise RuntimeError(f"{hero}: missing armature")
    rig = resolve_rig(armature)
    remove_canonical_nla_tracks(armature, hero)

    idle = find_action(ACTION_NAMES["idle"])
    if idle is None:
        raise RuntimeError(f"{hero}: missing idle Action")
    original_neutral = sample_action(
        scene, armature, idle, int(round(idle.frame_range[0]))
    )
    corrected_neutral = clone_pose(original_neutral)
    if hero == "katty" and rig.get("head") in corrected_neutral:
        head = corrected_neutral[rig["head"]]
        if head["mode"] != "QUATERNION":
            head["rotation_euler"].z = KATTY_HEAD_TARGET_Z

    for clip, action_name in actions_for(hero).items():
        action = find_action(action_name)
        if action is None or clip not in RANGES:
            continue
        replace_action(
            scene,
            armature,
            hero,
            clip,
            action,
            rig,
            original_neutral,
            corrected_neutral,
        )
        print(f"REFINED {hero}/{clip}")

    ensure_nla_inventory(armature, hero)
    armature.animation_data.action = find_action(ACTION_NAMES["idle"])
    scene["brawl_angle_refinement"] = "sway-restrained-v1"
    scene.frame_set(1)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)


def main():
    requested = os.environ.get("HERO_FILTER")
    heroes = (requested,) if requested else ALL_HEROES
    if requested and requested not in ALL_HEROES:
        raise RuntimeError(f"HERO_FILTER={requested!r} is not a canonical hero")
    for hero in heroes:
        refine_hero(hero)


if __name__ == "__main__":
    main()
