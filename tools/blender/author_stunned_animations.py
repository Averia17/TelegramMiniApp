"""Author the shared, loop-safe Stunned Action in every hero master.

The existing hero Actions remain the source of truth for the authored moves.
This script only adds/rebuilds the 30-frame Stunned Action, using the hero's
own idle as a deterministic base pose and applying small, named bone accents.
It also records muted NLA strips for every canonical clip so the master scene
has an explicit clip track inventory without changing the ACTIONS exporter.
"""

from __future__ import annotations

import math
import os
import re
import sys
from pathlib import Path

import bpy
from mathutils import Quaternion

SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from hero_animation_contract import ALL_HEROES, actions_for, master_path

FPS = 30
STUNNED_START = 1
STUNNED_END = 30
STUNNED_FRAMES = (1, 5, 10, 13, 16, 19, 22, 25, 30)
STUNNED_REVISION = "stunned-brawl-readable-v1"


def find_armature():
    return next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )


def bone_names(armature):
    return [bone.name for bone in armature.data.bones]


def pick(names, *patterns):
    for pattern in patterns:
        regex = re.compile(pattern, re.IGNORECASE)
        for name in names:
            if regex.fullmatch(name):
                return name
    return None


def pick_all(names, *patterns):
    regexes = [re.compile(pattern, re.IGNORECASE) for pattern in patterns]
    return [name for name in names if any(regex.fullmatch(name) for regex in regexes)]


def resolve_rig(armature):
    names = bone_names(armature)
    left = {
        "shoulder": pick(
            names, r"L_(?:Shoulder|shoulder)(?:_\d+)?", r"L_Clavicle(?:_\d+)?"
        ),
        "elbow": pick(names, r"L_(?:Elbow|elbow)(?:_\d+)?"),
        "wrist": pick(names, r"L_(?:Hand|hand|Wrist|wrist)(?:_\d+)?"),
        "leg": pick(
            names, r"L_(?:Hip|hip|upperLeg)(?:_s)?(?:_\d+)?", r"L_upperLeg_s(?:_\d+)?"
        ),
        "knee": pick(
            names, r"L_(?:Knee|knee|lowerLeg)(?:_s)?(?:_\d+)?", r"L_lowerLeg_s(?:_\d+)?"
        ),
    }
    right = {
        "shoulder": pick(
            names, r"R_(?:Shoulder|shoulder)(?:_\d+)?", r"R_Clavicle(?:_\d+)?"
        ),
        "elbow": pick(names, r"R_(?:Elbow|elbow)(?:_\d+)?"),
        "wrist": pick(names, r"R_(?:Hand|hand|Wrist|wrist)(?:_\d+)?"),
        "leg": pick(
            names, r"R_(?:Hip|hip|upperLeg)(?:_s)?(?:_\d+)?", r"R_upperLeg_s(?:_\d+)?"
        ),
        "knee": pick(
            names, r"R_(?:Knee|knee|lowerLeg)(?:_s)?(?:_\d+)?", r"R_lowerLeg_s(?:_\d+)?"
        ),
    }
    return {
        "root": pick(names, r"Root", r"_rootJoint", r"hips_s"),
        "body": pick_all(
            names,
            r"Chest",
            r"chest_s(?:_\d+)?",
            r"Spine",
            r"spine_(?:lower|mid|middle|upper)_s(?:\d+|_\d+)?",
            r"spine_mid(?:_lower|_upper)?_s",
        ),
        "head": pick(names, r"Head", r"head_s(?:_\d+)?"),
        "neck": pick(names, r"Neck", r"neck_s(?:_\d+)?"),
        "left": left,
        "right": right,
        "wings": pick_all(names, r"[LR]_wing_(?:up|down)_s"),
        "tail": pick_all(names, r"Tail_\d+_s"),
        "flower": pick(names, r"Flower"),
        "fans": pick_all(names, r"[LR]_(?:weapon|side_[AB]_weapon)_s"),
        "cloud": pick_all(names, r"Cloud_\d+_s"),
        "bottle": pick(names, r"bottle_s"),
        "board": pick(names, r"skateboard_s"),
        "staff": pick_all(names, r"[LR]_weapon(?:_top)?_s", r"MIC_Handel_s"),
    }


HERO_STYLE = {
    "needle": {
        "lean": 0.20,
        "spread": 0.34,
        "bend": 0.18,
        "tremor": 0.045,
        "squash": 0.055,
    },
    "mandy": {
        "lean": 0.14,
        "spread": 0.30,
        "bend": 0.12,
        "tremor": 0.032,
        "squash": 0.045,
    },
    "fairy-mina": {
        "lean": 0.17,
        "spread": 0.42,
        "bend": 0.10,
        "tremor": 0.040,
        "squash": 0.035,
    },
    "brock-zeus": {
        "lean": 0.12,
        "spread": 0.28,
        "bend": 0.10,
        "tremor": 0.028,
        "squash": 0.040,
    },
    "kaze": {
        "lean": 0.22,
        "spread": 0.38,
        "bend": 0.22,
        "tremor": 0.055,
        "squash": 0.060,
    },
    "wukong-mico": {
        "lean": 0.24,
        "spread": 0.48,
        "bend": 0.25,
        "tremor": 0.060,
        "squash": 0.065,
    },
    "persephone-lumi": {
        "lean": 0.10,
        "spread": 0.24,
        "bend": 0.12,
        "tremor": 0.022,
        "squash": 0.035,
    },
    "katty": {
        "lean": 0.18,
        "spread": 0.40,
        "bend": 0.20,
        "tremor": 0.050,
        "squash": 0.055,
    },
}


def stage(frame):
    """Return smooth entry/hold/tremor values for a loop-safe 30f clip."""
    entry = 0.0 if frame <= 1 else min(1.0, (frame - 1) / 9.0)
    tremor = 0.0
    if 10 <= frame <= 25:
        tremor = math.sin((frame - 10) * math.pi / 3.0)
    return entry, tremor


def add_euler(base, offsets):
    result = base.copy()
    for axis, radians in offsets:
        result.rotate_axis(axis, radians)
    return result


def add_quaternion(base, offsets):
    result = base.copy()
    for axis, radians in offsets:
        axis_vector = {
            "X": (1.0, 0.0, 0.0),
            "Y": (0.0, 1.0, 0.0),
            "Z": (0.0, 0.0, 1.0),
        }[axis]
        delta = Quaternion(axis_vector, radians)
        result = delta @ result
    return result


def apply_rotation(data, mode, offsets):
    if mode == "QUATERNION":
        data["rotation_quaternion"] = add_quaternion(
            data["rotation_quaternion"], offsets
        )
    else:
        data["rotation_euler"] = add_euler(data["rotation_euler"], offsets)


def capture_pose(armature):
    result = {}
    for bone in armature.pose.bones:
        data = {
            "mode": bone.rotation_mode,
            "location": bone.location.copy(),
            "scale": bone.scale.copy(),
        }
        if bone.rotation_mode == "QUATERNION":
            data["rotation_quaternion"] = bone.rotation_quaternion.copy()
        else:
            data["rotation_euler"] = bone.rotation_euler.copy()
        result[bone.name] = data
    return result


def modified_pose(base, rig, hero, frame):
    style = HERO_STYLE[hero]
    entry, tremor = stage(frame)
    pose = {
        name: {
            key: value.copy() if hasattr(value, "copy") else value
            for key, value in data.items()
        }
        for name, data in base.items()
    }
    body_lean = style["lean"] * entry
    for name in rig["body"]:
        data = pose[name]
        apply_rotation(
            data,
            data["mode"],
            [("X", body_lean), ("Z", tremor * style["tremor"] * 0.35)],
        )
        squash = style["squash"] * (0.35 + 0.65 * entry)
        data["scale"].x *= 1.0 + squash
        data["scale"].y *= 1.0 - squash
        data["scale"].z *= 1.0 + squash

    if rig["head"]:
        data = pose[rig["head"]]
        apply_rotation(
            data,
            data["mode"],
            [("X", -body_lean * 0.65), ("Z", tremor * style["tremor"])],
        )
    if rig["neck"]:
        data = pose[rig["neck"]]
        apply_rotation(data, data["mode"], [("X", body_lean * 0.25)])

    for side_name, side_sign in (("left", -1.0), ("right", 1.0)):
        side = rig[side_name]
        if side["shoulder"]:
            data = pose[side["shoulder"]]
            apply_rotation(
                data,
                data["mode"],
                [
                    ("Z", side_sign * style["spread"] * entry),
                    ("X", tremor * style["tremor"] * side_sign),
                ],
            )
        if side["elbow"]:
            data = pose[side["elbow"]]
            apply_rotation(
                data,
                data["mode"],
                [
                    ("Z", side_sign * style["spread"] * 0.55 * entry),
                    ("X", -tremor * style["tremor"] * 0.7),
                ],
            )
        if side["wrist"]:
            data = pose[side["wrist"]]
            apply_rotation(
                data,
                data["mode"],
                [
                    ("Z", -side_sign * style["spread"] * 0.25 * entry),
                    ("Y", tremor * style["tremor"] * 0.5),
                ],
            )
        if side["leg"]:
            data = pose[side["leg"]]
            apply_rotation(
                data,
                data["mode"],
                [("X", style["bend"] * entry), ("Z", side_sign * style["bend"] * 0.18)],
            )
        if side["knee"]:
            data = pose[side["knee"]]
            apply_rotation(
                data,
                data["mode"],
                [
                    ("X", style["bend"] * 0.72 * entry),
                    ("Z", tremor * style["tremor"] * side_sign),
                ],
            )

    for index, name in enumerate(rig["wings"]):
        data = pose[name]
        apply_rotation(
            data,
            data["mode"],
            [
                ("X", math.sin(frame * math.pi / 4.0 + index) * 0.045),
                ("Z", tremor * 0.025),
            ],
        )
    for index, name in enumerate(rig["tail"]):
        data = pose[name]
        apply_rotation(
            data,
            data["mode"],
            [("Z", math.sin(frame * math.pi / 3.0 + index * 0.5) * 0.06 * entry)],
        )
    if rig["flower"]:
        data = pose[rig["flower"]]
        apply_rotation(
            data, data["mode"], [("Z", tremor * 0.16), ("X", -body_lean * 0.25)]
        )
    for index, name in enumerate(rig["fans"]):
        data = pose[name]
        apply_rotation(data, data["mode"], [("Y", tremor * (0.07 + index * 0.01))])
    for index, name in enumerate(rig["cloud"]):
        data = pose[name]
        apply_rotation(
            data, data["mode"], [("Z", math.sin(frame * math.pi / 5.0 + index) * 0.025)]
        )
    if rig["bottle"]:
        data = pose[rig["bottle"]]
        apply_rotation(data, data["mode"], [("Z", tremor * 0.08)])
    if rig["board"]:
        data = pose[rig["board"]]
        apply_rotation(data, data["mode"], [("Y", tremor * 0.05)])
    return pose


def key_pose(armature, pose, frame):
    for name, data in pose.items():
        bone = armature.pose.bones[name]
        bone.location = data["location"]
        bone.scale = data["scale"]
        if data["mode"] == "QUATERNION":
            bone.rotation_quaternion = data["rotation_quaternion"]
            bone.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=name
            )
        else:
            bone.rotation_euler = data["rotation_euler"]
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
        bone.keyframe_insert(data_path="location", frame=frame, group=name)
        bone.keyframe_insert(data_path="scale", frame=frame, group=name)


def smooth_action(action):
    curves = []
    if hasattr(action, "fcurves"):
        curves = list(action.fcurves)
    else:
        for layer in action.layers:
            for strip in layer.strips:
                for channelbag in getattr(strip, "channelbags", ()):
                    curves.extend(channelbag.fcurves)
    for curve in curves:
        for key in curve.keyframe_points:
            key.interpolation = "BEZIER"
            key.handle_left_type = "AUTO_CLAMPED"
            key.handle_right_type = "AUTO_CLAMPED"


def set_metadata(action, hero):
    action["hero_slug"] = hero
    action["clip_name"] = "stunned"
    action["clip_kind"] = "event"
    action["frame_start"] = STUNNED_START
    action["frame_end"] = STUNNED_END
    action["source_layout"] = "master-actions"
    action["fps"] = FPS
    action["loop"] = True
    action["cyclic"] = True
    action["loop_start"] = 10
    action["loop_end"] = 25
    action["semantic_revision"] = STUNNED_REVISION
    action["brawl_style_revision"] = "brawl-readable-v1"
    action["semantic"] = "dazed readable silhouette with restrained tremor"
    action["authoring_action_name"] = f"action_{hero.replace('-', '_')}_stunned"


def ensure_nla_inventory(armature, hero):
    armature.animation_data_create()
    action_map = actions_for(hero)
    for clip, action_name in action_map.items():
        action = bpy.data.actions.get(action_name)
        if action is None:
            continue
        for track in list(armature.animation_data.nla_tracks):
            if track.name == clip:
                armature.animation_data.nla_tracks.remove(track)
        track = armature.animation_data.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, int(round(action.frame_range[0])), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]
        strip.frame_start = action.frame_range[0]
        strip.frame_end = action.frame_range[1]
        track.mute = True
        strip.mute = True


def author_hero(hero):
    path = master_path(hero)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = find_armature()
    if armature is None:
        raise RuntimeError(f"{hero}: master has no armature")
    idle = bpy.data.actions.get("idle")
    if idle is None:
        raise RuntimeError(f"{hero}: master has no idle Action")

    rig = resolve_rig(armature)
    armature.animation_data_create()
    armature.animation_data.action = idle
    idle_start, idle_end = idle.frame_range
    idle_span = max(1.0, idle_end - idle_start)
    base_poses = {}
    for frame in STUNNED_FRAMES:
        source_frame = (
            idle_start
            + ((frame - STUNNED_START) / (STUNNED_END - STUNNED_START)) * idle_span
        )
        scene.frame_set(int(round(source_frame)))
        bpy.context.view_layer.update()
        base_poses[frame] = capture_pose(armature)

    old = bpy.data.actions.get("Stunned")
    if old is not None:
        bpy.data.actions.remove(old)
    stunned = bpy.data.actions.new("Stunned")
    stunned.use_fake_user = True
    set_metadata(stunned, hero)
    armature.animation_data.action = stunned
    for frame in STUNNED_FRAMES:
        key_pose(armature, modified_pose(base_poses[frame], rig, hero, frame), frame)
    smooth_action(stunned)
    scene.render.fps = FPS
    scene.frame_start = STUNNED_START
    scene.frame_end = STUNNED_END
    scene["stunned_semantic_revision"] = STUNNED_REVISION
    scene["stunned_loop_policy"] = "entry-and-hold; loop-safe frame 10-25"
    scene["nla_inventory_policy"] = (
        "muted master clip tracks; ACTIONS export remains canonical"
    )
    ensure_nla_inventory(armature, hero)
    armature.animation_data.action = idle
    scene.frame_set(int(round(idle_start)))
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(
        f"AUTHORED {hero} Stunned bones={len(armature.pose.bones)} rig={armature.name}"
    )


def main():
    requested = os.environ.get("HERO_FILTER")
    heroes = (requested,) if requested else ALL_HEROES
    if requested and requested not in ALL_HEROES:
        raise RuntimeError(f"HERO_FILTER={requested!r} is not a canonical hero")
    for hero in heroes:
        author_hero(hero)


if __name__ == "__main__":
    main()
