"""Author the 80 hero event scenes with explicit frame-by-frame pose keys.

The previous scene pack only copied existing Actions. This pass keeps those
Actions as a starting pose, then writes authored pose keys on every frame of
each event. The motion is deliberately rig-agnostic but uses the real bone
chains discovered in each hero rig, so the result remains editable in Blender
and exports as ordinary glTF animation tracks.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion, Vector

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import hero_skill_spec

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
MANIFEST = Path(__file__).with_name("hero_animation_scene_manifest.json")

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
}

# The focused scenes must be based on the real Actions shipped beside each
# hero.  The master .blend files intentionally contain placeholder Actions for
# runtime names, but those placeholders are not choreography.
SOURCE_CLIP_FILES = {
    "idle": "idle",
    "run": "run",
    "attack": "attack",
    "super": "super",
    "aim": "aim",
    "aim-super": "aim-super",
    "death": "defeat",
    "spawn": "spawn",
    "victory": "victory",
}

SOURCE_ACTION_NAMES = {
    "idle": "Idle",
    "run": "Run",
    "attack": "Attack",
    "super": "Super",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "death": "Defeat",
    "spawn": "Spawn",
    "victory": "Victory",
}

HERO_FRAMES = {
    "needle": {
        "idle": 120,
        "run": 12,
        "attack": 24,
        "super": 42,
        "aim": 24,
        "aim-super": 24,
        "hit": 12,
        "death": 50,
        "spawn": 30,
        "victory": 90,
    },
    "mandy": {
        "idle": 120,
        "run": 10,
        "attack": 28,
        "super": 55,
        "aim": 24,
        "aim-super": 24,
        "hit": 12,
        "death": 45,
        "spawn": 30,
        "victory": 90,
    },
    "fairy-mina": {
        "idle": 100,
        "run": 8,
        "attack": 24,
        "super": 48,
        "aim": 24,
        "aim-super": 24,
        "hit": 15,
        "death": 45,
        "spawn": 30,
        "victory": 75,
    },
    "brock-zeus": {
        "idle": 80,
        "run": 12,
        "attack": 24,
        "super": 40,
        "aim": 24,
        "aim-super": 24,
        "hit": 12,
        "death": 40,
        "spawn": 30,
        "victory": 90,
    },
    "kaze": {
        "idle": 100,
        "run": 8,
        "attack": 26,
        "super": 34,
        "aim": 24,
        "aim-super": 24,
        "hit": 9,
        "death": 35,
        "spawn": 30,
        "victory": 75,
    },
    "wukong-mico": {
        "idle": 110,
        "run": 10,
        "attack": 40,
        "super": 110,
        "aim": 24,
        "aim-super": 24,
        "hit": 15,
        "death": 45,
        "spawn": 30,
        "victory": 90,
    },
    "persephone-lumi": {
        "idle": 100,
        "run": 10,
        "attack": 35,
        "super": 40,
        "aim": 24,
        "aim-super": 24,
        "hit": 12,
        "death": 42,
        "spawn": 30,
        "victory": 90,
    },
}

# Keep the long-form body choreography on the same event clocks used by the
# skill contract.  The locomotion/event timings above remain hero-specific,
# while attack/super/gadget clips use the semantic frame counts and markers.
for _hero, _skill_frames in hero_skill_spec.FRAME_ENDS.items():
    if _hero not in HERO_FRAMES:
        continue
    for _clip, _frame_count in _skill_frames.items():
        if _clip in HERO_FRAMES[_hero]:
            HERO_FRAMES[_hero][_clip] = _frame_count

GADGET_FRAMES = {
    "needle": 24,
    "mandy": 58,
    "fairy-mina": 34,
    "brock-zeus": 40,
    "kaze": 48,
    "wukong-mico": 68,
    "persephone-lumi": 30,
}


def fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def smooth_action(action):
    """Keep explicit per-frame keys while making every segment fluid."""
    for curve in fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        curve.update()


def action_by_name(name: str):
    matches = [
        action
        for action in bpy.data.actions
        if action.name.casefold().split(".")[0] == name.casefold()
    ]
    if not matches:
        raise RuntimeError(f"missing authored Action {name!r}")
    return next(
        (action for action in matches if action.name.casefold() == name.casefold()),
        matches[0],
    )


def import_source_action(path: Path, action_name: str):
    """Import one real source Action without importing its source scene."""
    with bpy.data.libraries.load(os.fspath(path), link=False) as (data_from, data_to):
        candidates = [
            name
            for name in data_from.actions
            if name.casefold() == action_name.casefold()
            or name.casefold().split(".")[0] == action_name.casefold()
        ]
        if not candidates:
            raise RuntimeError(f"{path}: missing source Action {action_name!r}")
        data_to.actions = [candidates[0]]
    imported = next((action for action in data_to.actions if action is not None), None)
    if imported is None:
        raise RuntimeError(f"{path}: source Action import returned nothing")
    return imported


def action_frame_range(action):
    points = [
        point.co[0] for curve in fcurves(action) for point in curve.keyframe_points
    ]
    if not points:
        raise RuntimeError(f"{action.name}: source Action has no keyframes")
    return float(min(points)), float(max(points))


def capture_pose(armature):
    """Capture the evaluated local pose, including non-rotation channels."""
    captured = {}
    for bone in armature.pose.bones:
        item = {
            "rotation_mode": bone.rotation_mode,
            "location": bone.location.copy(),
            "scale": bone.scale.copy(),
        }
        if bone.rotation_mode == "QUATERNION":
            item["rotation_quaternion"] = bone.rotation_quaternion.copy()
        elif bone.rotation_mode == "AXIS_ANGLE":
            item["rotation_axis_angle"] = tuple(bone.rotation_axis_angle)
        else:
            item["rotation_euler"] = bone.rotation_euler.copy()
        captured[bone.name] = item
    return captured


def pose_quaternion(item):
    if item["rotation_mode"] == "QUATERNION":
        return item["rotation_quaternion"].copy()
    if item["rotation_mode"] == "AXIS_ANGLE":
        return Quaternion(item["rotation_axis_angle"])
    return item["rotation_euler"].to_quaternion()


def write_pose_quaternion(item, value):
    """Store a quaternion back in the capture's original rotation mode."""
    mode = item["rotation_mode"]
    if mode == "QUATERNION":
        item["rotation_quaternion"] = value
    elif mode == "AXIS_ANGLE":
        angle, axis = value.to_axis_angle()
        item["rotation_axis_angle"] = (angle, axis.x, axis.y, axis.z)
    else:
        item["rotation_euler"] = value.to_euler(mode)


def limit_frame_rotation_delta(captured, previous, max_degrees=32.0):
    """Prevent a source clip's one-frame Euler/rig snap from reaching GLB.

    Several legacy Actions contain a large shoulder turn over one source frame.
    Sampling them at 30 fps preserves that discontinuity unless the evaluated
    pose is gently advanced over subsequent frames.  Quaternion slerp keeps
    the shortest arc and leaves every ordinary frame untouched.
    """
    limit = math.radians(max_degrees)
    for name, item in captured.items():
        current = pose_quaternion(item)
        prior_record = previous.get(name)
        prior = (
            prior_record["quaternion"]
            if isinstance(prior_record, dict)
            else prior_record
        )
        if prior is not None:
            delta = prior.rotation_difference(current)
            if delta.angle > limit:
                current = prior.slerp(current, limit / delta.angle)
                write_pose_quaternion(item, current)
        if item["rotation_mode"] not in {"QUATERNION", "AXIS_ANGLE"}:
            previous_euler = (
                prior_record.get("euler") if isinstance(prior_record, dict) else None
            )
            if previous_euler is not None:
                values = [item["rotation_euler"][index] for index in range(3)]
                for index, value in enumerate(values):
                    while value - previous_euler[index] > math.pi:
                        value -= math.tau
                    while value - previous_euler[index] < -math.pi:
                        value += math.tau
                    values[index] = value
                item["rotation_euler"] = Euler(values, item["rotation_mode"])
            # Some rigs use a non-XYZ Euler order whose equivalent Euler
            # representation still crosses a wrap after the shortest-arc
            # clamp. Promote only that bone to Quaternion; keeping ordinary
            # bones in their source mode lets glTF retain their authored keys.
            if (
                prior is not None
                and prior.rotation_difference(pose_quaternion(item)).angle
                > limit * 1.05
            ):
                item["rotation_mode"] = "QUATERNION"
                item["rotation_quaternion"] = current
        previous[name] = {
            "quaternion": current.copy(),
            "euler": (
                item["rotation_euler"].copy()
                if item["rotation_mode"] not in {"QUATERNION", "AXIS_ANGLE"}
                else None
            ),
        }


def promote_captured_rotations_to_quaternion(captured):
    """Avoid Euler wrap jumps when the baked action is evaluated by glTF."""
    for item in captured.values():
        quaternion = pose_quaternion(item)
        item["rotation_mode"] = "QUATERNION"
        item["rotation_quaternion"] = quaternion


def import_source_rig(path: Path, scene):
    """Load only the source armature so actions can be retargeted from its rest pose."""
    with bpy.data.libraries.load(os.fspath(path), link=False) as (data_from, data_to):
        armature_names = [
            name
            for name in data_from.objects
            if name.casefold().endswith("rig") or "armature" in name.casefold()
        ]
        if not armature_names:
            raise RuntimeError(f"{path}: source armature not found")
        data_to.objects = [armature_names[0]]
    source_rig = next(
        (obj for obj in data_to.objects if obj is not None and obj.type == "ARMATURE"),
        None,
    )
    if source_rig is None:
        raise RuntimeError(f"{path}: source armature import returned nothing")
    scene.collection.objects.link(source_rig)
    source_rig.hide_render = True
    source_rig.hide_viewport = True
    return source_rig


def retarget_pose(source_pose, source_rest, master_rest):
    """Transfer source motion deltas onto the master rig's rest pose.

    Some legacy source rigs have a different local rest orientation from the
    runtime master (Needle is the known case). Copying source Euler values
    directly makes the exported hero fold over. Retargeting the delta between
    source rest and source animation preserves the motion while keeping the
    master mesh upright and its sockets in their authored locations.
    """
    result = {}
    for name, target in master_rest.items():
        source = source_pose.get(name)
        source_base = source_rest.get(name)
        item = {
            "rotation_mode": target["rotation_mode"],
            "location": target["location"].copy(),
            "scale": target["scale"].copy(),
        }
        if source is not None and source_base is not None:
            source_delta = (
                pose_quaternion(source) @ pose_quaternion(source_base).inverted()
            )
            target_rotation = pose_quaternion(target) @ source_delta
            item["location"] += source["location"] - source_base["location"]
            for axis in range(3):
                if abs(float(source_base["scale"][axis])) > 1e-6:
                    item["scale"][axis] *= (
                        source["scale"][axis] / source_base["scale"][axis]
                    )
        else:
            target_rotation = pose_quaternion(target)
        if item["rotation_mode"] == "QUATERNION":
            item["rotation_quaternion"] = target_rotation
        elif item["rotation_mode"] == "AXIS_ANGLE":
            angle, axis = target_rotation.to_axis_angle()
            item["rotation_axis_angle"] = (angle, axis.x, axis.y, axis.z)
        else:
            item["rotation_euler"] = target_rotation.to_euler(item["rotation_mode"])
        result[name] = item
    return result


def action_channel_bones(action):
    rotation = set()
    location = set()
    scale = set()
    marker = 'pose.bones["'
    for curve in fcurves(action):
        if marker not in curve.data_path:
            continue
        name = curve.data_path.split(marker, 1)[1].split('"]', 1)[0]
        if ".rotation_" in curve.data_path:
            rotation.add(name)
        elif curve.data_path.endswith(".location"):
            location.add(name)
        elif curve.data_path.endswith(".scale"):
            scale.add(name)
    return rotation, location, scale


def key_captured_pose(
    armature, captured, frame, rotation_bones, location_bones, scale_bones
):
    for name, item in captured.items():
        bone = armature.pose.bones.get(name)
        if not bone:
            continue
        if name in location_bones:
            bone.location = item["location"]
            bone.keyframe_insert(data_path="location", frame=frame, group=name)
        if name in scale_bones:
            bone.scale = item["scale"]
            bone.keyframe_insert(data_path="scale", frame=frame, group=name)
        if name not in rotation_bones:
            continue
        if item["rotation_mode"] == "QUATERNION":
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = item["rotation_quaternion"]
            bone.keyframe_insert(
                data_path="rotation_quaternion", frame=frame, group=name
            )
        elif item["rotation_mode"] == "AXIS_ANGLE":
            bone.rotation_mode = "AXIS_ANGLE"
            bone.rotation_axis_angle = item["rotation_axis_angle"]
            bone.keyframe_insert(
                data_path="rotation_axis_angle", frame=frame, group=name
            )
        else:
            bone.rotation_mode = item["rotation_mode"]
            bone.rotation_euler = item["rotation_euler"]
            bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)


def apply_small_supplemental_pose(hero, clip, t, groups, captured):
    """Add only restrained event accents where the source clip is missing."""
    pose = {}
    if clip == "hit":
        recoil = 1.0 - smoothstep(t)
        add_pose(pose, groups["hips"], deg(-4.0 * recoil), deg(2.0 * recoil), 0)
        add_pose(pose, groups["spine_lower"], deg(7.0 * recoil), deg(2.0 * recoil), 0)
        add_pose(pose, groups["spine_upper"], deg(4.0 * recoil), 0, deg(-2.0 * recoil))
        add_pose(pose, groups["head"], deg(3.0 * recoil), deg(2.0 * recoil), 0)
        for side in ("L", "R"):
            add_pose(pose, groups[f"{side}_shoulder"], deg(5.0 * recoil), 0, 0)
            add_pose(pose, groups[f"{side}_elbow"], deg(-4.0 * recoil), 0, 0)
    elif clip == "gadget":
        charge = smoothstep(t / 0.28)
        release = smoothstep((t - 0.42) / 0.24)
        settle = smoothstep((t - 0.72) / 0.28)
        pulse = charge * (1.0 - release) + release * (1.0 - settle)
        add_pose(pose, groups["hips"], deg(3.5 * pulse), deg(-2.0 * pulse), 0)
        add_pose(pose, groups["spine_lower"], deg(-5.0 * pulse), deg(3.0 * pulse), 0)
        add_pose(pose, groups["spine_upper"], deg(-3.0 * pulse), deg(4.0 * pulse), 0)
        add_pose(pose, groups["head"], deg(-2.0 * pulse), deg(-3.0 * pulse), 0)
        for side, sign in (("L", -1), ("R", 1)):
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(-10.0 * pulse),
                deg(sign * 3.0 * pulse),
                deg(sign * 2.0 * pulse),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(8.0 * pulse),
                0,
                deg(sign * 2.0 * pulse),
            )
            add_pose(pose, groups[f"{side}_wrist"], deg(-4.0 * pulse), 0, 0)
    for name, delta in pose.items():
        item = captured.get(name)
        if not item:
            continue
        if item["rotation_mode"] == "QUATERNION":
            item["rotation_quaternion"] = (
                item["rotation_quaternion"] @ Euler(delta, "XYZ").to_quaternion()
            )
        elif item["rotation_mode"] == "AXIS_ANGLE":
            item["rotation_mode"] = "QUATERNION"
            item["rotation_quaternion"] = (
                Euler(item["rotation_axis_angle"][1:4], "XYZ").to_quaternion()
                @ Euler(delta, "XYZ").to_quaternion()
            )
        else:
            item["rotation_euler"] = Euler(
                tuple(item["rotation_euler"][i] + delta[i] for i in range(3)),
                item["rotation_mode"],
            )


def phase(t, start, end):
    """A delayed, eased phase used for overlapping body parts."""
    if end <= start:
        return 1.0 if t >= end else 0.0
    return smoothstep((t - start) / (end - start))


def delayed_sine(t, delay, period=1.0):
    return math.sin(max(0.0, t - delay) / max(period, 1e-6) * math.tau)


def add_delta(pose, name, x=0.0, y=0.0, z=0.0):
    if name:
        add_pose(pose, name, deg(x), deg(y), deg(z))


def add_hand_wave(pose, groups, side, t, start, end, amount=10.0):
    """Close/open individual fingers with a visible proximal-to-distal wave."""
    names = groups.get(f"{side}_finger_wave", [])
    for index, name in enumerate(names):
        if name:
            begin = start + index * 0.012
            finish = min(end, begin + max(0.06, (end - start) * 0.38))
            add_delta(pose, name, amount * phase(t, begin, finish), 0, 0)


def add_captured_location(captured, name, x=0.0, y=0.0, z=0.0, touched=None):
    if not name or name not in captured:
        return
    captured[name]["location"] += Vector((x, y, z))
    if touched is not None:
        touched.add(name)


def add_captured_scale(captured, name, x=0.0, y=0.0, z=0.0, touched=None):
    if not name or name not in captured:
        return
    captured[name]["scale"] = Vector(captured[name]["scale"]) + Vector((x, y, z))
    if touched is not None:
        touched.add(name)


def apply_choreography(hero, clip, t, groups, captured):
    """Add authored, body-part-specific overlap on top of the real source Action.

    The source Actions remain the motion authority. This layer supplies the
    deliberate timing language from the animation brief: mass moves first,
    joints follow, then hands/fingers/secondary props settle after the stop.
    Every affected channel is still baked on every frame by ``author_scene``.
    """
    pose = {}
    location_bones = set()
    scale_bones = set()
    hips = groups.get("hips")
    spine = groups.get("spine_lower")
    chest = groups.get("spine_upper")
    head = groups.get("head")
    neck = groups.get("neck")

    def arm(side, shoulder=0.0, elbow=0.0, wrist=0.0, sign=1.0):
        add_delta(
            pose, groups.get(f"{side}_shoulder"), shoulder, 0, sign * shoulder * 0.18
        )
        add_delta(pose, groups.get(f"{side}_elbow"), elbow, 0, sign * elbow * 0.08)
        add_delta(pose, groups.get(f"{side}_wrist"), wrist, 0, sign * wrist * 0.12)

    if clip == "idle":
        breath = math.sin(t * math.tau)
        sway = math.sin(t * math.tau * 0.5)
        add_delta(pose, hips, 0, 2.0 * sway, 1.0 * sway)
        add_delta(pose, spine, 2.5 * sway, 0, -1.5 * sway)
        add_delta(pose, chest, -2.0 * breath, 0.8 * breath, 0)
        add_captured_scale(
            captured, chest, 0.02 * breath, 0.02 * breath, 0.02 * breath, scale_bones
        )
        # The head leads the body by roughly four frames; the hands settle
        # after the shoulders instead of mirroring them on the same frame.
        gaze = delayed_sine(t, 0.035, 0.62)
        add_delta(pose, neck, 0, 3.0 * gaze, 0)
        add_delta(pose, head, 0, 7.0 * gaze, 1.0 * gaze)
        arm("L", 2.5 * sway, 1.0 * sway, 1.5 * delayed_sine(t, 0.03, 0.5), -1)
        arm("R", -2.5 * sway, -1.0 * sway, -1.5 * delayed_sine(t, 0.03, 0.5), 1)
        if hero == "needle":
            add_delta(
                pose,
                groups.get("special_primary"),
                0,
                0,
                4.0 * delayed_sine(t, 0.05, 0.8),
            )
        if hero in {"fairy-mina", "kaze", "persephone-lumi"}:
            add_hand_wave(pose, groups, "R", t, 0.12, 0.5, 6.0)
            add_hand_wave(pose, groups, "L", t, 0.24, 0.62, 5.0)

    elif clip == "run":
        stride = math.sin(t * math.tau)
        add_captured_location(
            captured, hips, 0, 0, 0.02 * math.sin(t * math.tau * 2), location_bones
        )
        add_delta(pose, hips, 0, 2.0 * stride, 1.5 * stride)
        add_delta(pose, spine, 8.0, -2.0 * stride, 0)
        add_delta(pose, chest, -3.0, 0, 2.0 * stride)
        arm("L", -18.0 * stride, 12.0 * stride, 7.0 * delayed_sine(t, 0.06, 1.0), 1)
        arm("R", 18.0 * stride, -12.0 * stride, -7.0 * delayed_sine(t, 0.06, 1.0), -1)
        add_delta(pose, head, 0, -2.0 * stride, 0)
        for index, name in enumerate(groups.get("secondary", [])):
            add_delta(pose, name, 3.0 * delayed_sine(t, 0.10 + index * 0.01, 1.0), 0, 0)

    elif clip == "attack":
        # Each hero has a different attack story.  Keep the timing in frame
        # space so the same authoring code remains readable at 30 fps while
        # the actual bone order is staggered shoulder -> elbow -> wrist ->
        # fingers.  The old generic attack made every hero look like a head-
        # first mannequin gesture and did not match the brief.
        attack_frames = max(1.0, float(HERO_FRAMES[hero]["attack"] - 1))
        frame_phase = lambda start, end: phase(
            t, start / attack_frames, end / attack_frames
        )

        if hero == "needle":
            wind = frame_phase(1, 8)
            release = frame_phase(8, 14)
            recover = frame_phase(14, 22)
            add_delta(pose, hips, 20.0 * wind - 18.0 * release, 28.0 * wind, 0)
            add_delta(pose, spine, -8.0 * wind + 10.0 * release, 20.0 * wind, 0)
            arm(
                "R",
                -42.0 * wind + 64.0 * release,
                24.0 * frame_phase(3, 10) - 28.0 * frame_phase(10, 17),
                -18.0 * frame_phase(5, 12) + 15.0 * frame_phase(12, 19),
                1,
            )
            arm(
                "L",
                12.0 * wind - 10.0 * release,
                -10.0 * wind,
                6.0 * frame_phase(10, 18),
                -1,
            )
            add_delta(pose, head, 0, 8.0 * frame_phase(1, 5) - 3.0 * recover, 0)
            add_hand_wave(
                pose, groups, "R", t, 10.0 / attack_frames, 18.0 / attack_frames, 10.0
            )

        elif hero == "mandy":
            wind = frame_phase(1, 10)
            swing = frame_phase(10, 18)
            follow = frame_phase(18, 28)
            # Mandy's staff strike is an upper-body beat. Keep the pelvis
            # grounded so the authored swing cannot rotate a leg into the air.
            add_delta(
                pose,
                hips,
                8.0 * wind - 12.0 * swing + 2.0 * follow,
                10.0 * wind - 6.0 * swing,
                0,
            )
            add_delta(
                pose, spine, -8.0 * wind + 16.0 * swing, 26.0 * wind - 12.0 * swing, 0
            )
            arm(
                "R",
                -46.0 * wind + 52.0 * swing + 8.0 * follow,
                28.0 * frame_phase(5, 13) - 34.0 * frame_phase(13, 21),
                -15.0 * frame_phase(8, 16) + 12.0 * follow,
                1,
            )
            arm(
                "L",
                -34.0 * wind + 44.0 * swing,
                24.0 * frame_phase(6, 14) - 28.0 * frame_phase(14, 22),
                -10.0 * frame_phase(9, 18),
                -1,
            )
            add_delta(pose, head, 0, -8.0 * wind + 5.0 * follow, 0)
            add_hand_wave(
                pose, groups, "R", t, 14.0 / attack_frames, 24.0 / attack_frames, 7.0
            )
            add_hand_wave(
                pose, groups, "L", t, 15.0 / attack_frames, 25.0 / attack_frames, 6.0
            )

        elif hero == "fairy-mina":
            wind = frame_phase(1, 8)
            throw = frame_phase(8, 16)
            recover = frame_phase(16, 24)
            add_delta(
                pose, hips, -8.0 * wind + 5.0 * recover, -10.0 * wind + 14.0 * throw, 0
            )
            add_delta(pose, spine, -10.0 * wind + 16.0 * throw, -8.0 * wind, 0)
            arm(
                "R",
                -38.0 * wind + 70.0 * throw - 12.0 * recover,
                22.0 * frame_phase(4, 11) - 32.0 * frame_phase(11, 18),
                -18.0 * frame_phase(6, 13) + 14.0 * recover,
                1,
            )
            arm(
                "L",
                14.0 * wind - 18.0 * throw,
                -12.0 * wind,
                8.0 * frame_phase(12, 20),
                -1,
            )
            add_delta(pose, head, 0, 8.0 * frame_phase(1, 6) - 4.0 * recover, 0)
            for index, name in enumerate(groups.get("wings", [])):
                add_delta(
                    pose,
                    name,
                    12.0 * wind - 16.0 * throw + 8.0 * recover,
                    0,
                    (-1 if index % 2 else 1) * 8.0 * throw,
                )
            add_hand_wave(
                pose, groups, "R", t, 10.0 / attack_frames, 20.0 / attack_frames, 8.0
            )

        elif hero == "brock-zeus":
            raise_phase = frame_phase(1, 7)
            fire = frame_phase(7, 12)
            recoil = frame_phase(12, 18)
            add_delta(
                pose,
                hips,
                8.0 * raise_phase - 12.0 * fire + 4.0 * recoil,
                -12.0 * raise_phase,
                0,
            )
            add_delta(
                pose, spine, -8.0 * raise_phase + 14.0 * fire, -10.0 * raise_phase, 0
            )
            arm(
                "R",
                -52.0 * raise_phase + 62.0 * fire - 18.0 * recoil,
                30.0 * raise_phase - 36.0 * fire,
                -18.0 * frame_phase(6, 11) + 10.0 * recoil,
                1,
            )
            arm(
                "L",
                -24.0 * raise_phase + 18.0 * fire,
                16.0 * raise_phase - 12.0 * recoil,
                6.0 * recoil,
                -1,
            )
            add_delta(pose, head, 0, -8.0 * frame_phase(1, 6) + 4.0 * recoil, 0)
            add_hand_wave(
                pose, groups, "R", t, 9.0 / attack_frames, 16.0 / attack_frames, 5.0
            )

        elif hero == "kaze":
            # Four distinct beats from the brief: right diagonal, left
            # diagonal, a held 0.4 s pause, then the cross/X strike.
            right_wind = frame_phase(1, 6)
            right_hit = frame_phase(6, 10)
            left_wind = frame_phase(10, 14)
            left_hit = frame_phase(14, 18)
            pause = frame_phase(18, 26) * (1.0 - frame_phase(22, 26))
            cross = frame_phase(22, 27)
            recover = frame_phase(27, 38)
            add_captured_location(
                captured,
                hips,
                0,
                0,
                -0.025 * (right_hit + left_hit) + 0.03 * recover,
                location_bones,
            )
            add_delta(
                pose,
                hips,
                18.0 * right_wind
                - 16.0 * right_hit
                + 14.0 * left_wind
                - 12.0 * left_hit,
                24.0 * right_wind - 18.0 * left_hit,
                0,
            )
            add_delta(
                pose,
                spine,
                -16.0 * right_wind
                + 12.0 * right_hit
                - 14.0 * left_wind
                + 12.0 * left_hit,
                18.0 * right_wind - 16.0 * left_hit,
                0,
            )
            arm(
                "R",
                -58.0 * right_wind + 72.0 * right_hit - 40.0 * cross,
                32.0 * frame_phase(3, 8) - 38.0 * frame_phase(8, 13) + 24.0 * cross,
                -22.0 * frame_phase(5, 10) + 16.0 * frame_phase(10, 15) - 18.0 * cross,
                1,
            )
            arm(
                "L",
                -42.0 * left_wind + 68.0 * left_hit - 40.0 * cross,
                28.0 * frame_phase(11, 16) - 36.0 * frame_phase(16, 21) + 24.0 * cross,
                -18.0 * frame_phase(13, 18) + 16.0 * frame_phase(18, 23) + 18.0 * cross,
                -1,
            )
            add_delta(
                pose, head, 0, 10.0 * frame_phase(1, 5) - 8.0 * frame_phase(22, 29), 0
            )
            add_hand_wave(
                pose, groups, "R", t, 7.0 / attack_frames, 14.0 / attack_frames, 8.0
            )
            add_hand_wave(
                pose, groups, "L", t, 15.0 / attack_frames, 24.0 / attack_frames, 8.0
            )
            for index, name in enumerate(groups.get("special", [])):
                add_delta(
                    pose,
                    name,
                    22.0 * (right_hit + left_hit + cross),
                    0,
                    (index % 2 - 0.5) * 10.0 * cross,
                )

        elif hero == "wukong-mico":
            wind = frame_phase(1, 12)
            hit = frame_phase(12, 22)
            follow = frame_phase(22, 32)
            recover = frame_phase(32, 40)
            add_delta(
                pose,
                hips,
                18.0 * wind - 34.0 * hit + 8.0 * recover,
                30.0 * wind - 20.0 * hit,
                0,
            )
            add_delta(
                pose, spine, -10.0 * wind + 18.0 * hit, 28.0 * wind - 20.0 * hit, 0
            )
            arm(
                "R",
                -54.0 * wind + 76.0 * hit - 24.0 * follow,
                30.0 * frame_phase(5, 14) - 36.0 * frame_phase(14, 24),
                -20.0 * frame_phase(8, 18) + 18.0 * follow,
                1,
            )
            arm(
                "L",
                18.0 * wind - 32.0 * hit,
                -16.0 * wind + 24.0 * hit,
                12.0 * frame_phase(12, 25),
                -1,
            )
            add_delta(pose, head, 0, -10.0 * wind + 5.0 * recover, 0)
            add_hand_wave(
                pose, groups, "R", t, 15.0 / attack_frames, 30.0 / attack_frames, 9.0
            )
            for index, name in enumerate(groups.get("special", [])):
                add_delta(
                    pose,
                    name,
                    26.0 * frame_phase(10, 30),
                    0,
                    18.0 * math.sin(t * math.tau * 2.0 + index),
                )

        elif hero == "persephone-lumi":
            form = frame_phase(1, 10)
            release = frame_phase(10, 16)
            hold = frame_phase(16, 26)
            recover = frame_phase(26, 35)
            add_delta(
                pose,
                hips,
                -8.0 * form + 5.0 * recover,
                -12.0 * form + 10.0 * release,
                0,
            )
            add_delta(pose, spine, -10.0 * form + 14.0 * release, -8.0 * form, 0)
            arm(
                "R",
                -42.0 * form + 68.0 * release - 20.0 * recover,
                22.0 * frame_phase(5, 12) - 32.0 * frame_phase(12, 19),
                -18.0 * frame_phase(8, 15) + 12.0 * recover,
                1,
            )
            arm("L", 16.0 * form - 12.0 * release, -12.0 * form, 6.0 * hold, -1)
            add_delta(pose, head, 0, 8.0 * frame_phase(1, 7) - 4.0 * recover, 0)
            add_hand_wave(
                pose, groups, "R", t, 11.0 / attack_frames, 23.0 / attack_frames, 8.0
            )
            for index, name in enumerate(groups.get("ribbons", [])):
                add_delta(
                    pose,
                    name,
                    10.0
                    * phase(
                        t, (16 + index) / attack_frames, (26 + index) / attack_frames
                    ),
                    0,
                    0,
                )

        else:
            anticipation = phase(t, 0.00, 0.25)
            throw = phase(t, 0.25, 0.58)
            settle = 1.0 - phase(t, 0.58, 1.0)
            arm(
                "R",
                -38.0 * anticipation + 56.0 * throw + 5.0 * settle,
                28.0 * phase(t, 0.08, 0.35) - 34.0 * phase(t, 0.34, 0.68),
                -14.0 * phase(t, 0.17, 0.48) + 18.0 * phase(t, 0.48, 0.76),
                1,
            )
            arm(
                "L",
                16.0 * anticipation - 10.0 * throw,
                -12.0 * anticipation,
                7.0 * phase(t, 0.24, 0.62),
                -1,
            )
            add_delta(
                pose,
                hips,
                14.0 * anticipation - 22.0 * throw + 4.0 * settle,
                -8.0 * throw,
                0,
            )
            add_delta(
                pose,
                spine,
                -8.0 * anticipation + 12.0 * throw,
                -10.0 * throw,
                4.0 * throw,
            )
            add_delta(
                pose,
                chest,
                -4.0 * anticipation + 8.0 * throw,
                -5.0 * throw,
                2.0 * throw,
            )
            add_delta(pose, head, 0, -6.0 * phase(t, 0.0, 0.22) + 2.0 * settle, 0)
            add_hand_wave(pose, groups, "R", t, 0.34, 0.70, 8.0)

    elif clip == "super":
        crouch = phase(t, 0.00, 0.33)
        hold = phase(t, 0.25, 0.57) * (1.0 - phase(t, 0.57, 0.66))
        rise = phase(t, 0.57, 0.81)
        settle = 1.0 - phase(t, 0.81, 1.0)
        add_captured_location(
            captured, hips, 0, 0, -0.15 * crouch + 0.20 * rise, location_bones
        )
        add_delta(pose, hips, 18.0 * crouch - 8.0 * rise, -8.0 * crouch, 0)
        add_delta(pose, spine, -28.0 * crouch + 34.0 * rise, -8.0 * hold, 0)
        add_delta(pose, chest, -15.0 * crouch + 14.0 * rise, -5.0 * hold, 0)
        arm(
            "R",
            -30.0 * crouch + 68.0 * rise,
            24.0 * crouch - 30.0 * rise,
            -18.0 * crouch + 42.0 * rise,
            1,
        )
        arm("L", 18.0 * crouch + 28.0 * rise, -12.0 * crouch, 8.0 * rise, -1)
        add_delta(pose, head, -12.0 * crouch + 14.0 * rise, -6.0 * hold, 0)
        add_hand_wave(pose, groups, "R", t, 0.34, 0.46, 10.0)
        add_hand_wave(pose, groups, "R", t, 0.72, 0.86, 12.0)
        for index, name in enumerate(groups.get("secondary", [])):
            add_delta(
                pose,
                name,
                18.0 * phase(t, 0.66 + index * 0.01, 0.86 + index * 0.01),
                0,
                8.0 * settle,
            )

    elif clip == "aim":
        add_delta(pose, hips, 3.0, -2.0, 0)
        add_delta(pose, spine, -10.0, -10.0, 0)
        arm("R", -38.0, 12.0, -6.0, 1)
        arm("L", 16.0, -8.0, 5.0, -1)
        add_delta(pose, head, -2.0, -14.0, 0)
        add_hand_wave(pose, groups, "R", t, 0.12, 0.34, 4.0)

    elif clip == "aim-super":
        add_delta(pose, hips, 10.0, -6.0, 0)
        add_delta(pose, spine, -30.0, -12.0, 0)
        arm("R", -58.0, 20.0, -12.0, 1)
        arm("L", 24.0, -14.0, 8.0, -1)
        add_delta(pose, head, -12.0, -8.0, 0)
        add_hand_wave(pose, groups, "R", t, 0.05, 0.30, 7.0)

    elif clip == "hit":
        impact = 1.0 - phase(t, 0.16, 0.70)
        recover = phase(t, 0.28, 0.95)
        add_captured_location(
            captured, hips, -0.10 * impact + 0.04 * recover, 0, 0, location_bones
        )
        add_delta(pose, hips, -8.0 * impact + 3.0 * recover, 8.0 * impact, 0)
        add_delta(pose, spine, 18.0 * impact - 6.0 * recover, 8.0 * impact, 0)
        add_delta(pose, chest, 10.0 * impact - 4.0 * recover, 0, -5.0 * impact)
        add_delta(pose, head, 18.0 * impact - 8.0 * recover, 6.0 * impact, 0)
        arm("L", 20.0 * impact, -12.0 * impact, -8.0 * recover, -1)
        arm("R", 16.0 * impact, -10.0 * impact, -5.0 * recover, 1)

    elif clip == "death":
        fall = phase(t, 0.0, 0.55)
        rest = phase(t, 0.55, 1.0)
        add_captured_location(captured, hips, 0, 0, -0.20 * fall, location_bones)
        add_delta(pose, hips, 36.0 * fall, 18.0 * fall, -10.0 * fall)
        add_delta(pose, spine, 28.0 * fall, 14.0 * fall, -8.0 * fall)
        add_delta(pose, chest, 20.0 * fall, 0, -10.0 * fall)
        arm(
            "R",
            28.0 * phase(t, 0.0, 0.20) - 32.0 * phase(t, 0.20, 0.55),
            -40.0 * fall,
            18.0 * rest,
            1,
        )
        arm("L", 18.0 * fall, -32.0 * fall, 14.0 * rest, -1)
        add_delta(pose, head, 20.0 * fall, 14.0 * fall, 0)
        add_hand_wave(pose, groups, "R", t, 0.60, 0.95, -10.0)

    elif clip == "spawn":
        unfold = phase(t, 0.20, 0.78)
        add_captured_location(captured, hips, 0, 0, 0.30 * unfold, location_bones)
        add_delta(pose, hips, 24.0 * (1.0 - unfold), 0, 0)
        add_delta(pose, spine, -55.0 * (1.0 - unfold), 0, 0)
        add_delta(pose, chest, -24.0 * (1.0 - unfold), 0, 0)
        arm(
            "L",
            22.0 * (1.0 - phase(t, 0.36, 0.72)),
            -22.0 * (1.0 - phase(t, 0.40, 0.76)),
            8.0 * phase(t, 0.56, 0.86),
            -1,
        )
        arm(
            "R",
            22.0 * (1.0 - phase(t, 0.32, 0.68)),
            -22.0 * (1.0 - phase(t, 0.36, 0.72)),
            8.0 * phase(t, 0.52, 0.82),
            1,
        )
        add_delta(pose, head, -18.0 * (1.0 - phase(t, 0.48, 0.82)), 0, 0)
        add_hand_wave(pose, groups, "L", t, 0.62, 0.88, -9.0)
        add_hand_wave(pose, groups, "R", t, 0.58, 0.84, -9.0)

    elif clip == "victory":
        lift = phase(t, 0.0, 0.30) * (1.0 - phase(t, 0.76, 1.0))
        bounce = math.sin(t * math.tau * 2.0) * (1.0 - phase(t, 0.82, 1.0))
        add_delta(pose, hips, -5.0 * bounce, 0, 0)
        add_delta(pose, spine, 4.0 * bounce, 0, 0)
        arm(
            "R",
            -30.0 * lift,
            28.0 * phase(t, 0.18, 0.46),
            -14.0 * phase(t, 0.35, 0.60),
            1,
        )
        arm("L", 8.0 * lift, -5.0 * lift, 4.0 * lift, -1)
        add_delta(pose, head, -8.0 * lift + 3.0 * phase(t, 0.30, 0.55), 8.0 * lift, 0)
        add_hand_wave(pose, groups, "R", t, 0.65, 0.88, 11.0)

    # Hero-specific secondary parts follow after the primary body. Their
    # offset is intentionally small and phase-shifted so they never teleport.
    secondary_amount = {
        "idle": 3,
        "run": 6,
        "attack": 12,
        "super": 18,
        "aim": 4,
        "aim-super": 6,
        "hit": 8,
        "death": 12,
        "spawn": 10,
        "victory": 14,
    }.get(clip, 8)
    for index, name in enumerate(groups.get("secondary", [])):
        add_delta(
            pose,
            name,
            secondary_amount * delayed_sine(t, 0.08 + index * 0.01, 0.9),
            0,
            secondary_amount * 0.4 * delayed_sine(t, 0.10 + index * 0.01, 0.9),
        )

    # Per-hero signature parts. This is deliberately data-light: the source
    # Action supplies the silhouette, while these accents supply character.
    if hero == "fairy-mina":
        for index, name in enumerate(groups.get("wings", [])):
            add_delta(
                pose, name, 14.0 * delayed_sine(t, 0.04 + index * 0.018, 0.28), 0, 0
            )
    elif hero == "kaze":
        add_delta(
            pose,
            groups.get("special_primary"),
            0,
            0,
            10.0 * delayed_sine(t, 0.06, 0.65),
        )
    elif hero == "wukong-mico":
        add_delta(pose, groups.get("tail"), 8.0 * delayed_sine(t, 0.10, 0.8), 0, 0)
    elif hero == "persephone-lumi":
        for index, name in enumerate(groups.get("ribbons", [])):
            add_delta(
                pose, name, 8.0 * delayed_sine(t, 0.10 + index * 0.02, 0.75), 0, 0
            )

    rotation_bones = apply_captured_pose_delta(captured, pose)
    return rotation_bones, location_bones, scale_bones


def apply_captured_pose_delta(captured, pose):
    touched = set()
    for name, delta in pose.items():
        item = captured.get(name)
        if not item:
            continue
        if item["rotation_mode"] == "QUATERNION":
            item["rotation_quaternion"] = (
                item["rotation_quaternion"] @ Euler(delta, "XYZ").to_quaternion()
            )
        elif item["rotation_mode"] == "AXIS_ANGLE":
            item["rotation_mode"] = "QUATERNION"
            item["rotation_quaternion"] = (
                Euler(item["rotation_axis_angle"][1:4], "XYZ").to_quaternion()
                @ Euler(delta, "XYZ").to_quaternion()
            )
        else:
            item["rotation_euler"] = Euler(
                tuple(item["rotation_euler"][i] + delta[i] for i in range(3)),
                item["rotation_mode"],
            )
        touched.add(name)
    return touched


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def pingpong(value: float) -> float:
    return math.sin(value * math.tau)


def deg(value: float) -> float:
    return math.radians(value)


def token(name: str) -> str:
    return "".join(ch for ch in name.casefold() if ch.isalnum())


def pick(bones, *patterns):
    patterns = [token(pattern) for pattern in patterns]
    for pattern in patterns:
        for bone in bones:
            if pattern in token(bone.name):
                return bone.name
    return None


def rig_groups(armature):
    bones = list(armature.pose.bones)
    groups = {
        "hips": pick(bones, "hips", "pelvis", "Hips"),
        "spine_lower": pick(bones, "spinelower", "spinemid", "spine", "Chest", "Spine"),
        "spine_upper": pick(bones, "spineupper", "chest", "Chest", "Spine"),
        "neck": pick(bones, "neck"),
        "head": pick(bones, "head"),
    }
    for side, prefixes in (("L", ("l_", "left", "_l")), ("R", ("r_", "right", "_r"))):
        groups[f"{side}_shoulder"] = pick(
            bones,
            *(f"{prefix}shoulder" for prefix in prefixes),
            f"{side}_clavicle",
            f"{side}clavicle",
        )
        groups[f"{side}_elbow"] = pick(
            bones,
            *(f"{prefix}elbow" for prefix in prefixes),
            f"{side}_arm",
            f"{side}arm",
            f"{side}upperarm",
        )
        groups[f"{side}_wrist"] = pick(
            bones,
            *(f"{prefix}wrist" for prefix in prefixes),
            f"{side}_hand",
            f"{side}hand",
            f"{side}forearm",
        )
        groups[f"{side}_upper_leg"] = pick(
            bones,
            *(f"{prefix}upperleg" for prefix in prefixes),
            f"{side}_leg",
            f"{side}leg",
            f"{side}thigh",
        )
        groups[f"{side}_knee"] = pick(
            bones,
            *(f"{prefix}lowerleg" for prefix in prefixes),
            f"{side}_knee",
            f"{side}knee",
            f"{side}lowerleg",
        )
        groups[f"{side}_ankle"] = pick(
            bones,
            *(f"{prefix}ankle" for prefix in prefixes),
            f"{side}_foot",
            f"{side}foot",
            f"{side}toes",
            f"{side}toe",
        )
    groups["wings"] = [bone.name for bone in bones if "wing" in token(bone.name)]
    groups["hair"] = [
        bone.name
        for bone in bones
        if any(
            part in token(bone.name)
            for part in ("hair", "skirt", "cape", "ribbon", "tail", "beard")
        )
    ]
    groups["cloud"] = [bone.name for bone in bones if "cloud" in token(bone.name)]
    groups["fingers"] = [
        bone.name
        for bone in bones
        if any(
            part in token(bone.name)
            for part in ("finger", "thumb", "index", "middle", "pinky", "ring")
        )
    ]
    groups["special"] = [
        bone.name
        for bone in bones
        if "socket" not in token(bone.name)
        and any(
            part in token(bone.name)
            for part in (
                "flower",
                "spore",
                "waterball",
                "weapon",
                "blade",
                "pendulum",
                "mic",
                "speaker",
                "orb",
            )
        )
    ]
    # Needle's compact rig uses semantic LeftArm/LeftHand names instead of
    # shoulder/elbow/wrist chains. Keep the choreography readable without
    # inventing bones that do not exist.
    if groups["L_shoulder"] is None:
        groups["L_shoulder"] = pick(bones, "LeftArm")
    if groups["R_shoulder"] is None:
        groups["R_shoulder"] = pick(bones, "RightArm")
    if groups["L_wrist"] is None:
        groups["L_wrist"] = pick(bones, "LeftHand")
    if groups["R_wrist"] is None:
        groups["R_wrist"] = pick(bones, "RightHand")
    groups["L_finger_wave"] = [
        bone.name
        for bone in bones
        if token(bone.name).startswith("left")
        and any(
            part in token(bone.name)
            for part in ("index", "middle", "ring", "pinky", "thumb")
        )
    ]
    groups["R_finger_wave"] = [
        bone.name
        for bone in bones
        if token(bone.name).startswith("right")
        and any(
            part in token(bone.name)
            for part in ("index", "middle", "ring", "pinky", "thumb")
        )
    ]
    groups["wings"] = groups["wings"]
    groups["secondary"] = groups["hair"] + groups["wings"] + groups["cloud"]
    groups["tail"] = next(
        (bone.name for bone in bones if "tail" in token(bone.name)), None
    )
    groups["ribbons"] = [bone.name for bone in bones if "ribbon" in token(bone.name)]
    groups["special_primary"] = next(
        (bone.name for bone in bones if "flower" in token(bone.name)), None
    )
    if not groups["special_primary"]:
        groups["special_primary"] = next(iter(groups["special"]), None)
    return groups


def add_pose(result, name, x=0.0, y=0.0, z=0.0):
    if not name:
        return
    old = result.get(name, (0.0, 0.0, 0.0))
    result[name] = (old[0] + x, old[1] + y, old[2] + z)


def event_pose(hero, clip, frame, end, groups):
    t = frame / max(1.0, float(end))
    wave = pingpong(t)
    pose = {}
    hips = groups["hips"]
    spine = groups["spine_lower"]
    chest = groups["spine_upper"]
    head = groups["head"]
    neck = groups["neck"]

    if clip == "idle":
        add_pose(pose, hips, 0, deg(1.5 * wave), 0)
        add_pose(pose, spine, deg(1.8 * wave), 0, deg(1.5 * wave))
        add_pose(pose, chest, deg(-2.2 * wave), deg(1.5 * wave), 0)
        add_pose(pose, neck, 0, deg(3.0 * wave), 0)
        add_pose(pose, head, 0, deg(-5.0 * wave), deg(1.5 * wave))
        for side, sign in (("L", -1), ("R", 1)):
            add_pose(pose, groups[f"{side}_shoulder"], 0, 0, deg(sign * 2.0 * wave))
            add_pose(pose, groups[f"{side}_wrist"], deg(sign * 2.0 * wave), 0, 0)
        if hero == "needle":
            add_pose(pose, groups["L_wrist"], deg(-5 * wave), 0, 0)
        for name in groups["wings"] + groups["hair"]:
            add_pose(pose, name, 0, 0, deg(2.5 * wave))

    elif clip == "gadget":
        # Skill-specific activation pose. Gameplay effects (projectiles,
        # zones and hit flashes) remain runtime-owned; this action supplies
        # the hero body choreography and the exact timing window.
        if hero == "needle":
            compress = 1 - smoothstep(t / 0.17)
            dash = smoothstep((t - 0.17) / 0.25)
            brake = smoothstep((t - 0.42) / 0.25)
            exit_pose = smoothstep((t - 0.67) / 0.33)
            add_pose(pose, hips, deg(18 * compress + 8 * brake), deg(-6 * dash), 0)
            add_pose(pose, spine, deg(-14 * compress + 8 * brake), deg(8 * dash), 0)
            add_pose(pose, chest, deg(-10 * compress + 5 * brake), deg(12 * dash), 0)
            for side, sign in (("L", -1), ("R", 1)):
                add_pose(
                    pose,
                    groups[f"{side}_shoulder"],
                    deg(26 * compress - 32 * dash),
                    deg(sign * 10 * dash),
                    deg(sign * 8 * dash),
                )
                add_pose(
                    pose,
                    groups[f"{side}_elbow"],
                    deg(-30 * compress + 18 * dash),
                    0,
                    deg(sign * 6 * dash),
                )
                add_pose(
                    pose, groups[f"{side}_wrist"], deg(-22 * compress + 12 * dash), 0, 0
                )
                add_pose(
                    pose,
                    groups[f"{side}_upper_leg"],
                    deg(-18 * compress + 12 * brake),
                    0,
                    deg(sign * 4 * dash),
                )
                add_pose(pose, groups[f"{side}_knee"], deg(28 * compress), 0, 0)
            add_pose(pose, head, deg(8 * compress), deg(-5 * dash), 0)
            add_pose(pose, hips, deg(-6 * exit_pose), 0, 0)
            add_pose(pose, spine, deg(6 * exit_pose), 0, 0)
        else:
            # The other heroes keep the same authored, rig-agnostic gesture
            # contract while their VFX stay in the effect/projectile layer.
            charge = smoothstep(t / 0.25)
            release = smoothstep((t - 0.32) / 0.23)
            settle = smoothstep((t - 0.62) / 0.38)
            impulse = charge * (1 - release) + release * (1 - settle)
            add_pose(pose, hips, deg(12 * impulse), deg(-8 * impulse), deg(3 * impulse))
            add_pose(
                pose, spine, deg(-12 * impulse), deg(8 * impulse), deg(4 * impulse)
            )
            add_pose(pose, chest, deg(-8 * impulse), deg(10 * impulse), 0)
            for side, sign in (("L", -1), ("R", 1)):
                add_pose(
                    pose,
                    groups[f"{side}_shoulder"],
                    deg(24 * impulse),
                    deg(sign * 12 * impulse),
                    deg(sign * 8 * impulse),
                )
                add_pose(
                    pose,
                    groups[f"{side}_elbow"],
                    deg(-28 * impulse),
                    0,
                    deg(sign * 6 * impulse),
                )
                add_pose(
                    pose,
                    groups[f"{side}_wrist"],
                    deg(-14 * impulse),
                    deg(sign * 6 * impulse),
                    0,
                )
            add_pose(pose, head, deg(-6 * impulse), deg(-8 * impulse), 0)

    elif clip == "run":
        phase = pingpong(t * 1.5)
        add_pose(pose, hips, deg(-8), deg(2.0 * phase), deg(2.5 * phase))
        add_pose(pose, spine, deg(10), deg(-2.0 * phase), 0)
        add_pose(pose, chest, deg(-5), 0, deg(2.0 * phase))
        for side, sign in (("L", 1), ("R", -1)):
            add_pose(pose, groups[f"{side}_upper_leg"], deg(sign * 24 * phase), 0, 0)
            add_pose(
                pose, groups[f"{side}_knee"], deg(-max(0, sign * 14 * phase)), 0, 0
            )
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(-sign * 18 * phase),
                0,
                deg(sign * 4),
            )
            add_pose(pose, groups[f"{side}_elbow"], deg(sign * 12 * phase), 0, 0)
        for name in groups["hair"] + groups["wings"]:
            add_pose(pose, name, deg(3 * phase), 0, deg(-4 * phase))

    elif clip == "attack":
        wind = smoothstep(t / 0.32)
        release = smoothstep((t - 0.25) / 0.28)
        recover = smoothstep((t - 0.62) / 0.38)
        impulse = wind * (1 - release) + release * (1 - recover)
        add_pose(pose, hips, deg(8 * impulse), deg(-12 * impulse), deg(4 * impulse))
        add_pose(pose, spine, deg(-12 * impulse), deg(-10 * impulse), deg(5 * impulse))
        add_pose(pose, chest, deg(-8 * impulse), deg(-16 * impulse), deg(4 * impulse))
        add_pose(
            pose,
            groups["R_shoulder"],
            deg(-38 * impulse),
            deg(-10 * impulse),
            deg(-8 * impulse),
        )
        add_pose(pose, groups["R_elbow"], deg(32 * impulse), 0, deg(8 * impulse))
        add_pose(
            pose,
            groups["R_wrist"],
            deg(-18 * impulse),
            deg(-16 * impulse),
            deg(-18 * impulse),
        )
        add_pose(
            pose,
            groups["L_shoulder"],
            deg(16 * impulse),
            deg(5 * impulse),
            deg(8 * impulse),
        )
        add_pose(pose, groups["L_elbow"], deg(-14 * impulse), 0, 0)
        add_pose(pose, head, 0, deg(-10 * impulse), 0)
        if hero in {"mandy", "needle", "persephone-lumi"}:
            add_pose(pose, groups["R_wrist"], deg(-10 * impulse), 0, deg(-12 * impulse))

    elif clip == "super":
        crouch = smoothstep(t / 0.28)
        contact = smoothstep((t - 0.22) / 0.22)
        rise = smoothstep((t - 0.40) / 0.30)
        final = smoothstep((t - 0.72) / 0.28)
        low = crouch * (1 - contact)
        reach = contact * (1 - rise)
        lift = rise * (1 - final)
        add_pose(pose, hips, deg(22 * low - 8 * lift), deg(-12 * reach), deg(5 * low))
        add_pose(
            pose, spine, deg(-18 * low + 14 * lift), deg(-8 * reach), deg(5 * reach)
        )
        add_pose(pose, chest, deg(-12 * low + 10 * lift), deg(-12 * reach), 0)
        for side, sign in (("L", -1), ("R", 1)):
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(28 * low - 48 * reach - 12 * lift),
                deg(sign * 14 * reach),
                deg(sign * 10 * reach),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(-24 * low + 34 * reach),
                0,
                deg(sign * 8 * reach),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(-20 * low + 44 * reach + 12 * lift),
                deg(sign * 8 * reach),
                0,
            )
            add_pose(pose, groups[f"{side}_upper_leg"], deg(-22 * low + 8 * lift), 0, 0)
            add_pose(pose, groups[f"{side}_knee"], deg(28 * low), 0, 0)
        add_pose(pose, head, deg(-8 * low + 8 * lift), deg(-10 * reach), 0)
        for name in groups["wings"] + groups["cloud"]:
            add_pose(pose, name, deg(18 * reach - 12 * lift), 0, deg(8 * reach))

    elif clip in {"aim", "aim-super"}:
        super_aim = clip == "aim-super"
        lift = deg(34 if super_aim else 8)
        add_pose(
            pose, hips, deg(4 if super_aim else 0), deg(-8 if super_aim else -4), 0
        )
        add_pose(
            pose, spine, deg(-8 if super_aim else -4), deg(-8 if super_aim else -12), 0
        )
        add_pose(pose, chest, deg(-4), deg(-12), 0)
        for side, sign in (("L", -1), ("R", 1)):
            add_pose(
                pose, groups[f"{side}_shoulder"], -lift, deg(sign * 8), deg(sign * 5)
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(20 if super_aim else 8),
                0,
                deg(sign * 4),
            )
            add_pose(pose, groups[f"{side}_wrist"], deg(-12), deg(sign * 4), 0)
        add_pose(pose, neck, 0, deg(-12), 0)
        add_pose(pose, head, deg(-4 if super_aim else 0), deg(-14), 0)

    elif clip == "hit":
        recoil = (1 - smoothstep(t / 0.35)) * (1 - smoothstep((t - 0.35) / 0.65))
        add_pose(pose, hips, deg(-12 * recoil), deg(14 * recoil), deg(-5 * recoil))
        add_pose(pose, spine, deg(18 * recoil), deg(12 * recoil), deg(-8 * recoil))
        add_pose(pose, chest, deg(10 * recoil), 0, deg(-8 * recoil))
        add_pose(pose, head, deg(12 * recoil), deg(8 * recoil), 0)
        for side in ("L", "R"):
            add_pose(
                pose, groups[f"{side}_shoulder"], deg(18 * recoil), 0, deg(-12 * recoil)
            )
            add_pose(pose, groups[f"{side}_elbow"], deg(-12 * recoil), 0, 0)

    elif clip == "death":
        fall = smoothstep(t / 0.65)
        fade = smoothstep((t - 0.65) / 0.35)
        add_pose(pose, hips, deg(42 * fall), deg(20 * fall), deg(-12 * fall))
        add_pose(pose, spine, deg(36 * fall), deg(12 * fall), deg(-8 * fall))
        add_pose(pose, chest, deg(28 * fall), 0, deg(-12 * fall))
        add_pose(pose, head, deg(22 * fall), deg(14 * fall), 0)
        for side, sign in (("L", -1), ("R", 1)):
            add_pose(
                pose,
                groups[f"{side}_upper_leg"],
                deg(-28 * fall),
                0,
                deg(sign * 12 * fall),
            )
            add_pose(pose, groups[f"{side}_knee"], deg(38 * fall), 0, 0)
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(30 * fall),
                0,
                deg(sign * 26 * fall),
            )
            add_pose(
                pose, groups[f"{side}_elbow"], deg(-46 * fall), 0, deg(sign * 12 * fall)
            )
        for name in groups["hair"]:
            add_pose(pose, name, deg(-12 * fade), 0, deg(8 * fade))

    elif clip == "spawn":
        rise = smoothstep(t)
        add_pose(pose, hips, deg(28 * (1 - rise)), 0, 0)
        add_pose(pose, spine, deg(-18 * (1 - rise)), 0, 0)
        add_pose(pose, chest, deg(-12 * (1 - rise)), 0, 0)
        for side in ("L", "R"):
            add_pose(pose, groups[f"{side}_upper_leg"], deg(-24 * (1 - rise)), 0, 0)
            add_pose(pose, groups[f"{side}_knee"], deg(30 * (1 - rise)), 0, 0)
            add_pose(pose, groups[f"{side}_shoulder"], deg(18 * (1 - rise)), 0, 0)
            add_pose(pose, groups[f"{side}_elbow"], deg(-22 * (1 - rise)), 0, 0)
        add_pose(pose, head, deg(-10 * (1 - rise)), 0, 0)

    elif clip == "victory":
        bounce = abs(math.sin(t * math.pi * 2.0))
        lift = smoothstep(t / 0.35) * (1 - smoothstep((t - 0.78) / 0.22))
        add_pose(pose, hips, deg(-8 * bounce), 0, 0)
        add_pose(pose, spine, deg(5 * bounce), 0, 0)
        add_pose(pose, chest, deg(-4 * bounce), 0, 0)
        for side, sign in (("L", -1), ("R", 1)):
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(-35 * lift),
                deg(sign * 10 * lift),
                deg(sign * 8 * lift),
            )
            add_pose(
                pose, groups[f"{side}_elbow"], deg(28 * lift), 0, deg(sign * 8 * lift)
            )
            add_pose(pose, groups[f"{side}_wrist"], deg(-18 * lift), 0, 0)
        add_pose(pose, head, deg(-6 * lift), deg(8 * wave), 0)
        for name in groups["wings"] + groups["cloud"]:
            add_pose(pose, name, deg(-12 * lift), 0, deg(8 * lift))

    if hero == "fairy-mina":
        for index, name in enumerate(groups["wings"]):
            add_pose(
                pose,
                name,
                0,
                0,
                deg((12 if index % 2 == 0 else -12) * math.sin(t * math.tau * 2)),
            )
    if hero == "wukong-mico":
        for index, name in enumerate(groups["cloud"] + groups["hair"]):
            add_pose(
                pose,
                name,
                0,
                deg(3 * math.sin(t * math.tau + index)),
                deg(4 * math.cos(t * math.tau + index)),
            )
    # Secondary authored props follow through on the same frame-by-frame
    # curves: Needle's flower/spore, Mina's orb, Kaze's blades, and Wukong's
    # mic/cloud rig all receive a small event-specific swing.
    special_amount = {
        "idle": 3.0,
        "run": 8.0,
        "attack": 18.0,
        "super": 26.0,
        "aim": 5.0,
        "aim-super": 9.0,
        "hit": 12.0,
        "death": 20.0,
        "spawn": 16.0,
        "victory": 22.0,
        "gadget": 20.0,
    }[clip]
    for index, name in enumerate(groups["special"]):
        add_pose(
            pose,
            name,
            0,
            deg(special_amount * math.sin(t * math.tau + index * 0.7)),
            deg(special_amount * 0.55 * math.cos(t * math.tau + index)),
        )
    return pose


def copy_action_for_authoring(source):
    base = source.copy()
    base.name = f"__BASE__{source.name}"
    authored = source.copy()
    authored.name = source.name.split(".")[0]
    bpy.data.actions.remove(source)
    return base, authored


def canonicalize_authored_action(authored, canonical_name):
    """Give the focused scene one stable Action name, even with Blender suffixes."""
    for action in list(bpy.data.actions):
        if action == authored:
            continue
        if action.name.casefold().split(".")[0] != canonical_name.casefold():
            continue
        if action.users == 0:
            bpy.data.actions.remove(action)
    authored.name = canonical_name
    return authored


def read_base_pose(armature, names):
    result = {}
    for name in names:
        bone = armature.pose.bones.get(name)
        if not bone:
            continue
        if bone.rotation_mode == "QUATERNION":
            result[name] = (bone.rotation_mode, bone.rotation_quaternion.copy())
        elif bone.rotation_mode == "AXIS_ANGLE":
            result[name] = (bone.rotation_mode, tuple(bone.rotation_axis_angle))
        else:
            result[name] = (bone.rotation_mode, bone.rotation_euler.copy())
    return result


def apply_delta(armature, base_pose, pose):
    for name, delta in pose.items():
        bone = armature.pose.bones.get(name)
        original = base_pose.get(name)
        if not bone or not original:
            continue
        mode, value = original
        delta_euler = Euler(delta, "XYZ")
        if mode == "QUATERNION":
            bone.rotation_mode = mode
            bone.rotation_quaternion = value @ delta_euler.to_quaternion()
            bone.keyframe_insert(
                data_path="rotation_quaternion",
                frame=bpy.context.scene.frame_current,
                group=bone.name,
            )
        elif mode == "AXIS_ANGLE":
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = (
                Euler(value[1:4], "XYZ").to_quaternion() @ delta_euler.to_quaternion()
            )
            bone.keyframe_insert(
                data_path="rotation_quaternion",
                frame=bpy.context.scene.frame_current,
                group=bone.name,
            )
        else:
            bone.rotation_mode = mode
            bone.rotation_euler = Euler(
                (value.x + delta[0], value.y + delta[1], value.z + delta[2]), mode
            )
            bone.keyframe_insert(
                data_path="rotation_euler",
                frame=bpy.context.scene.frame_current,
                group=bone.name,
            )


def author_scene(hero, clip, master, target):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    source_clip = clip if clip in SOURCE_CLIP_FILES else "idle"
    source_path = (
        SOURCE / hero / "animations" / f"{SOURCE_CLIP_FILES[source_clip]}.blend"
    )
    source = import_source_action(source_path, SOURCE_ACTION_NAMES[source_clip])
    base = source
    base.name = f"__BASE_SOURCE__{hero}_{clip}"
    source_rig = None
    source_rest = None
    master_rest = None
    if hero == "needle":
        source_rig = import_source_rig(source_path, scene)
        source_rig.animation_data_create()
        source_rig.animation_data.action = None
        armature.animation_data_create()
        armature.animation_data.action = None
        scene.frame_set(1)
        source_rest = capture_pose(source_rig)
        master_rest = capture_pose(armature)
    authored = bpy.data.actions.new(ACTION_NAMES[clip])
    authored = canonicalize_authored_action(authored, ACTION_NAMES[clip])
    armature.animation_data_create()
    groups = rig_groups(armature)
    end = GADGET_FRAMES[hero] if clip == "gadget" else HERO_FRAMES[hero][clip]
    source_start, source_end = action_frame_range(base)
    source_rotation, source_location, source_scale = action_channel_bones(base)
    # A head scale track is never part of the attack language in the brief.
    # Some legacy Needle source Actions contain a neutral-looking head scale
    # channel; carrying it into glTF makes debugging suggest a head swell when
    # the intended beat is a hand/body gesture. Keep head and neck scale at
    # their authored rest values and animate them only through rotation.
    source_scale = {
        name
        for name in source_scale
        if clip == "idle"
        and not any(token in name.casefold() for token in ("head", "neck"))
    }
    extra_rotation = {
        name
        for value in groups.values()
        for name in (value if isinstance(value, list) else [value])
        if name and name in {bone.name for bone in armature.pose.bones}
    }
    extra_location = {groups.get("hips")} - {None}
    # Scale is reserved for the breathing language in Idle. Skill/event
    # clips must preserve the character's authored proportions; otherwise a
    # spine scale can visually read as a swelling head or torso.
    extra_scale = ({groups.get("spine_upper")} - {None}) if clip == "idle" else set()
    previous_pose = {}
    for frame in range(1, end + 1):
        normalized = (frame - 1) / max(1.0, float(end - 1))
        source_frame = source_start + normalized * (source_end - source_start)
        source_floor = math.floor(source_frame)
        if source_rig is not None:
            source_rig.animation_data.action = base
            armature.animation_data.action = None
            scene.frame_set(int(source_floor), subframe=source_frame - source_floor)
            captured = retarget_pose(capture_pose(source_rig), source_rest, master_rest)
        else:
            armature.animation_data.action = base
            scene.frame_set(int(source_floor), subframe=source_frame - source_floor)
            captured = capture_pose(armature)
        armature.animation_data.action = authored
        if os.environ.get("DISABLE_CHOREOGRAPHY"):
            frame_rotation, frame_location, frame_scale = set(), set(), set()
        else:
            frame_rotation, frame_location, frame_scale = apply_choreography(
                hero, clip, normalized, groups, captured
            )
        limit_frame_rotation_delta(captured, previous_pose)
        promote_captured_rotations_to_quaternion(captured)
        extra_rotation.update(frame_rotation)
        extra_location.update(frame_location)
        extra_scale.update(frame_scale)
        key_captured_pose(
            armature,
            captured,
            frame,
            source_rotation | extra_rotation,
            source_location | extra_location,
            source_scale | extra_scale,
        )
    bpy.data.actions.remove(base)
    if source_rig is not None:
        source_data = source_rig.data
        bpy.data.objects.remove(source_rig, do_unlink=True)
        if source_data.users == 0:
            bpy.data.armatures.remove(source_data)
    smooth_action(authored)
    armature.animation_data.action = authored
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = end
    scene.frame_set(1)
    scene.name = f"{hero}_{clip}_authored"
    scene["hero_slug"] = hero
    scene["clip_name"] = ACTION_NAMES[clip]
    scene["clip_kind"] = "event"
    scene["frame_start"] = 1
    scene["frame_end"] = end
    scene["fps"] = 30
    scene["authoring_status"] = "AUTHORED_FRAME_BY_FRAME"
    scene["authoring_method"] = "real_source_action_retimed_and_baked_every_frame"
    scene["skill_event_frames"] = json.dumps(
        hero_skill_spec.EVENT_FRAMES.get(hero, {}).get(clip, {}),
        ensure_ascii=False,
        sort_keys=True,
    )
    scene["source_of_truth"] = (
        f"{source_path.relative_to(ROOT)}::{SOURCE_ACTION_NAMES[source_clip]}"
    )
    scene["root_motion_contract"] = (
        "visual_event_motion_only; gameplay_root_stays_grounded"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    # Remove only the generated backup beside this exact focused scene. A
    # stale `.blend1`/`.blend@` makes Blender's Windows save path abort before
    # the newly authored scene is written.
    for backup in (Path(f"{target}1"), Path(f"{target}@")):
        if backup.exists():
            backup.unlink()
    # `copy=True` writes the focused scene without rotating another backup.
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=True
    )
    return {
        "hero": hero,
        "clip": clip,
        "action": ACTION_NAMES[clip],
        "frame_start": 1,
        "frame_end": end,
        "fps": 30,
        "authored_keyframes": end,
        "touched_bones": len(source_rotation | extra_rotation),
        "source_clip": source_clip,
        "source_frame_start": source_start,
        "source_frame_end": source_end,
        "file": str(target.relative_to(ROOT)),
    }


def author_gadget_scene(hero, master, target):
    result = author_scene(hero, "gadget", master, target)
    bpy.context.scene["clip_name"] = "Gadget"
    bpy.context.scene["clip_kind"] = "ability"
    bpy.context.scene["source_of_truth"] = f"skill-spec::{hero}::gadget + idle source"
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=True
    )
    return result


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    report = []
    requested_hero = os.environ.get("HERO_FILTER")
    heroes = [
        hero
        for hero in manifest["heroes"]
        if not requested_hero or hero == requested_hero
    ]
    if requested_hero and not heroes:
        raise RuntimeError(
            f"HERO_FILTER={requested_hero!r} is not in the scene manifest"
        )
    for hero in heroes:
        master = SOURCE / hero / f"{hero}.blend"
        for clip in manifest["event_clips"]:
            report.append(
                author_scene(
                    hero, clip, master, SOURCE / hero / "scenes" / f"{clip}.blend"
                )
            )
        report.append(
            author_gadget_scene(hero, master, SOURCE / hero / "scenes" / "gadget.blend")
        )
    out = ROOT / "artifacts" / "hero-animation-scene-pack.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "scenes": len(report),
                "total_authored_keys": sum(
                    item["authored_keyframes"] for item in report
                ),
                "output": str(out),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
