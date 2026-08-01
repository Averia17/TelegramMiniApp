"""Author the three gameplay skill clips from a stable, rig-aware baseline.

The first skill pass reused each hero's source Attack/Super action and added
large, generic Euler offsets.  That is unsafe across rigs: the same local axis
can bend a shoulder sideways on one character and forward on another, while
the source action can also contain root/prop tracks that fight the generated
pose.  This pass intentionally uses the hero's real idle pose as a neutral
baseline, writes every pose bone on every frame, and only adds restrained
gesture deltas to semantic body chains.  Bone-parented weapons therefore stay
with the wrist that owns them.
"""

from __future__ import annotations

import argparse
import importlib
import json
import math
import os
import re
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import author_frame_by_frame_animation_scenes as authoring
import hero_skill_spec as skill_spec

authoring = importlib.reload(authoring)
ROOT = authoring.ROOT
SOURCE = authoring.SOURCE
MANIFEST = authoring.MANIFEST

METHOD = "rig_aware_idle_baseline_explicit_frame_keys_v3_detailed_skill_spec"


def master_path(hero: str) -> Path:
    # Mandy has both a compatibility copy and the NLA master; the compatibility
    # copy is the same character scene expected by the rest of the pipeline.
    return SOURCE / hero / f"{hero}.blend"


def side_marker(name: str, side: str) -> bool:
    lower = name.casefold()
    marker = side.casefold()
    return (
        lower.startswith(marker + "_")
        or lower.startswith(marker + ".")
        or lower.endswith("_" + marker)
        or lower.endswith("." + marker)
        or f"_{marker}_" in lower
        or f".{marker}." in lower
    )


def choose(names: list[str], side: str | None, words: tuple[str, ...]) -> str | None:
    candidates = []
    for name in names:
        token = authoring.token(name)
        if side is not None and not side_marker(name, side):
            continue
        if not any(word in token for word in words):
            continue
        score = sum(token == word for word in words) * 20
        score += sum(token.startswith(word) for word in words) * 4
        score += len(name) / 1000.0
        candidates.append((score, name))
    return max(candidates)[1] if candidates else None


def rig_groups(armature):
    names = [bone.name for bone in armature.pose.bones]
    groups = {
        "root": authoring.pick(armature.pose.bones, "rootJoint", "root", "Root"),
        "hips": authoring.pick(armature.pose.bones, "hips", "pelvis", "Hips"),
        "spine_lower": authoring.pick(
            armature.pose.bones, "spinelower", "spinemid", "spine", "Spine"
        ),
        "spine_upper": authoring.pick(
            armature.pose.bones, "spineupper", "chest", "Chest"
        ),
        "neck": authoring.pick(armature.pose.bones, "neck"),
        "head": authoring.pick(armature.pose.bones, "head"),
    }
    for side in ("L", "R"):
        groups[f"{side}_shoulder"] = choose(names, side, ("shoulder", "clavicle"))
        groups[f"{side}_elbow"] = choose(names, side, ("elbow", "upperarm", "arm"))
        groups[f"{side}_wrist"] = choose(names, side, ("wrist", "hand", "forearm"))
        groups[f"{side}_upper_leg"] = choose(names, side, ("upperleg", "thigh"))
        groups[f"{side}_knee"] = choose(names, side, ("lowerleg", "knee", "shin"))
        groups[f"{side}_ankle"] = choose(names, side, ("ankle", "foot", "toe"))
    groups["fingers_by_side"] = {}
    for side in ("L", "R"):
        groups["fingers_by_side"][side] = {
            finger: [
                name
                for name in names
                if side_marker(name, side) and finger in authoring.token(name)
            ]
            for finger in ("index", "middle", "ring", "pinky", "thumb")
        }
    groups["wings"] = [name for name in names if "wing" in authoring.token(name)]
    groups["special"] = [
        name
        for name in names
        if any(
            token in authoring.token(name)
            for token in ("weapon", "blade", "staff", "mic", "cloud", "orb", "totem")
        )
    ]
    return groups


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def ease(value: float) -> float:
    # Cubic ease-in/out keeps adjacent explicit frame keys continuous without
    # introducing a sharp velocity change at a hold or release.
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def deg(value: float) -> float:
    return math.radians(value)


def add_pose(
    result: dict[str, tuple[float, float, float]], name: str | None, x=0.0, y=0.0, z=0.0
):
    if not name:
        return
    old = result.get(name, (0.0, 0.0, 0.0))
    result[name] = (old[0] + x, old[1] + y, old[2] + z)


PRIMARY_HANDS = {
    "needle": "R",
    "mandy": "L",
    "fairy-mina": "R",
    "brock-zeus": "R",
    "kaze": "BOTH",
    "wukong-mico": "L",
    # Damian's authored attack and the attached microphone are left-handed.
    "damian": "L",
    "persephone-lumi": "BOTH",
}


def skill_pose(hero: str, clip: str, frame: int, end: int, groups: dict) -> dict:
    """Return small, semantic local rotations for one explicit frame."""
    if hero in skill_spec.FRAME_ENDS and clip in skill_spec.FRAME_ENDS[hero]:
        return skill_spec.profile_pose(hero, clip, frame, groups)
    t = (frame - 1) / max(1.0, float(end - 1))
    pose: dict[str, tuple[float, float, float]] = {}
    primary = PRIMARY_HANDS.get(hero, "R")
    hands = (
        ("L", "R") if primary == "BOTH" else (primary, "L" if primary == "R" else "R")
    )

    if clip == "attack":
        anticipation = ease(t / 0.28)
        strike = ease((t - 0.28) / 0.18)
        recover = ease((t - 0.46) / 0.42)
        wind = anticipation * (1.0 - strike)
        hit = strike * (1.0 - recover)
        settle = 1.0 - recover
        add_pose(pose, groups["hips"], deg(1.8 * wind - 1.0 * hit), deg(-1.5 * wind), 0)
        add_pose(
            pose,
            groups["spine_lower"],
            deg(-3.0 * wind + 2.0 * hit),
            deg(-2.5 * wind),
            0,
        )
        add_pose(
            pose,
            groups["spine_upper"],
            deg(-2.0 * wind + 1.5 * hit),
            deg(-2.0 * wind),
            0,
        )
        add_pose(pose, groups["head"], deg(1.5 * wind - 1.0 * hit), deg(-2.0 * wind), 0)
        for side in hands:
            strength = 1.0 if primary == "BOTH" or side == primary else 0.48
            sign = -1.0 if side == "L" else 1.0
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(strength * (-8.0 * wind + 12.0 * hit)),
                deg(sign * strength * 2.5 * wind),
                deg(sign * strength * 2.0 * hit),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(strength * (7.0 * wind - 13.0 * hit)),
                0,
                deg(sign * strength * 2.0 * hit),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(strength * (-3.0 * wind + 8.0 * hit)),
                deg(sign * strength * 1.5 * hit),
                0,
            )
        # Keep the recovery visibly connected to the held prop rather than
        # snapping the wrist back in a single frame.
        if settle > 0:
            for side in hands:
                if primary == "BOTH" or side == primary:
                    add_pose(pose, groups[f"{side}_wrist"], deg(-2.0 * settle), 0, 0)

    elif clip == "super":
        charge = ease(t / 0.30)
        reach = ease((t - 0.28) / 0.22)
        recover = ease((t - 0.56) / 0.44)
        low = charge * (1.0 - reach)
        contact = reach * (1.0 - recover)
        lift = (1.0 - recover) * ease((t - 0.40) / 0.34)
        add_pose(
            pose, groups["hips"], deg(2.5 * low - 1.0 * lift), deg(-1.5 * contact), 0
        )
        add_pose(
            pose,
            groups["spine_lower"],
            deg(-4.0 * low + 3.0 * lift),
            deg(-2.0 * contact),
            0,
        )
        add_pose(
            pose,
            groups["spine_upper"],
            deg(-2.5 * low + 2.0 * lift),
            deg(-2.5 * contact),
            0,
        )
        add_pose(
            pose, groups["head"], deg(2.0 * low - 1.5 * lift), deg(-2.0 * contact), 0
        )
        for side in hands:
            strength = 1.0 if primary == "BOTH" or side == primary else 0.72
            sign = -1.0 if side == "L" else 1.0
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(strength * (7.0 * low - 15.0 * contact - 5.0 * lift)),
                deg(sign * strength * 3.0 * contact),
                deg(sign * strength * 2.0 * contact),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(strength * (-5.0 * low + 12.0 * contact)),
                0,
                deg(sign * strength * 2.0 * contact),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(strength * (-2.0 * low + 9.0 * contact + 2.0 * lift)),
                deg(sign * strength * 1.5 * contact),
                0,
            )

    elif clip == "gadget":
        charge = ease(t / 0.25)
        release = ease((t - 0.34) / 0.20)
        settle = ease((t - 0.60) / 0.40)
        pulse = charge * (1.0 - release) + release * (1.0 - settle)
        add_pose(pose, groups["hips"], deg(1.8 * pulse), deg(-1.0 * pulse), 0)
        add_pose(pose, groups["spine_lower"], deg(-3.0 * pulse), deg(2.0 * pulse), 0)
        add_pose(pose, groups["spine_upper"], deg(-2.0 * pulse), deg(2.5 * pulse), 0)
        add_pose(pose, groups["head"], deg(-1.5 * pulse), deg(-2.0 * pulse), 0)
        for side in hands:
            strength = 1.0 if primary == "BOTH" or side == primary else 0.48
            sign = -1.0 if side == "L" else 1.0
            add_pose(
                pose,
                groups[f"{side}_shoulder"],
                deg(strength * (-7.0 * pulse)),
                deg(sign * strength * 2.0 * pulse),
                deg(sign * strength * 1.5 * pulse),
            )
            add_pose(
                pose,
                groups[f"{side}_elbow"],
                deg(strength * 6.0 * pulse),
                0,
                deg(sign * strength * 1.5 * pulse),
            )
            add_pose(
                pose,
                groups[f"{side}_wrist"],
                deg(strength * (-3.0 * pulse)),
                deg(sign * strength * 1.0 * pulse),
                0,
            )

    return pose


def capture_rotations(armature):
    result = {}
    for bone in armature.pose.bones:
        if bone.rotation_mode == "QUATERNION":
            rotation = bone.rotation_quaternion.copy()
        elif bone.rotation_mode == "AXIS_ANGLE":
            rotation = Quaternion(
                (
                    bone.rotation_axis_angle[1],
                    bone.rotation_axis_angle[2],
                    bone.rotation_axis_angle[3],
                ),
                bone.rotation_axis_angle[0],
            )
        else:
            rotation = bone.rotation_euler.to_quaternion()
        result[bone.name] = rotation
    return result


def set_rotation(bone, rotation: Quaternion):
    # One uniform rotation channel type avoids Euler-order differences between
    # the eight rigs and exports cleanly as glTF quaternion tracks.
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = rotation
    bone.location = (0.0, 0.0, 0.0)
    bone.scale = (1.0, 1.0, 1.0)


def apply_pose(armature, baseline, pose):
    for bone in armature.pose.bones:
        set_rotation(bone, baseline[bone.name])
    for name, delta in pose.items():
        bone = armature.pose.bones.get(name)
        if bone is not None:
            set_rotation(bone, baseline[name] @ Euler(delta, "XYZ").to_quaternion())


def key_rotations(armature, frame: int):
    for bone in armature.pose.bones:
        bone.keyframe_insert(
            data_path="rotation_quaternion", frame=frame, group=bone.name
        )


def remove_existing_action(name: str):
    for action in list(bpy.data.actions):
        if action.name.casefold().split(".")[0] != name.casefold():
            continue
        if action.users == 0:
            bpy.data.actions.remove(action)
        else:
            # The master may keep a source action referenced by an NLA strip.
            # Keep that strip valid, but free the canonical runtime name for
            # the newly-authored action.
            action.name = f"__SOURCE__{name}__{len(bpy.data.actions)}"


def finalize_action_name(action, canonical_name: str, hero: str, clip: str):
    """Remove canonical-name collisions before the focused scene is saved."""
    for existing in list(bpy.data.actions):
        if existing == action:
            continue
        if existing.name.casefold().split(".")[0] != canonical_name.casefold():
            continue
        if existing.users == 0:
            bpy.data.actions.remove(existing)
        else:
            existing.name = f"__SOURCE__{hero}_{clip}_{len(bpy.data.actions)}"
    action.name = canonical_name
    return action


def author_scene(hero: str, clip: str, target: Path):
    bpy.ops.wm.open_mainfile(filepath=os.fspath(master_path(hero)))
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    armature.animation_data_create()
    idle_path = SOURCE / hero / "animations" / "idle.blend"
    idle_action = authoring.import_source_action(idle_path, "Idle")
    armature.animation_data.action = idle_action
    idle_start, _idle_end = authoring.action_frame_range(idle_action)
    scene.frame_set(int(idle_start))
    baseline = capture_rotations(armature)
    action_name = {"attack": "Attack", "super": "super", "gadget": "Gadget"}[clip]
    remove_existing_action(action_name)
    action = bpy.data.actions.new(f"__AUTHORED__{hero}_{clip}")
    armature.animation_data.action = action
    end = skill_spec.FRAME_ENDS[hero][clip]
    groups = rig_groups(armature)
    for frame in range(1, end + 1):
        scene.frame_set(frame)
        apply_pose(armature, baseline, skill_pose(hero, clip, frame, end, groups))
        key_rotations(armature, frame)
    authoring.smooth_action(action)
    action = finalize_action_name(action, action_name, hero, clip)
    armature.animation_data.action = action
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = end
    scene.frame_set(1)
    scene.name = f"{hero}_{clip}_authored"
    scene["hero_slug"] = hero
    scene["clip_name"] = action_name
    scene["clip_kind"] = "ability"
    scene["frame_start"] = 1
    scene["frame_end"] = end
    scene["fps"] = 30
    scene["authoring_status"] = "AUTHORED_FRAME_BY_FRAME"
    scene["authoring_method"] = METHOD
    scene["source_of_truth"] = (
        f"{idle_path.relative_to(ROOT)}::Idle baseline + semantic skill pose"
    )
    root_motion_meters = (
        {"needle": {"gadget": 8.0}, "kaze": {"super": 12.0}}
        .get(hero, {})
        .get(clip, 0.0)
    )
    skill_event_frames = json.dumps(
        skill_spec.EVENT_FRAMES[hero][clip], ensure_ascii=False, sort_keys=True
    )
    scene["root_motion_contract"] = (
        "gameplay_root_stays_grounded; root_motion_meters_in_event_metadata"
    )
    scene["root_motion_meters"] = root_motion_meters
    scene["skill_event_frames"] = skill_event_frames
    target.parent.mkdir(parents=True, exist_ok=True)
    for backup in (Path(f"{target}1"), Path(f"{target}@")):
        if backup.exists():
            backup.unlink()
    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(target), check_existing=False, copy=True
    )
    return {
        "hero": hero,
        "clip": clip,
        "frame_end": end,
        "action": action_name,
        "file": str(target.relative_to(ROOT)),
        "method": METHOD,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hero", default="*")
    parser.add_argument("--clips", nargs="+", default=["attack", "super", "gadget"])
    forwarded = (
        sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    )
    args = parser.parse_args(forwarded)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    heroes = manifest["heroes"] if args.hero == "*" else [args.hero]
    report = []
    for hero in heroes:
        for clip in args.clips:
            report.append(
                author_scene(hero, clip, SOURCE / hero / "scenes" / f"{clip}.blend")
            )
    out = ROOT / "artifacts" / "hero-skill-animation-scene-pack-v2.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        json.dumps(
            {"scenes": len(report), "output": os.fspath(out), "method": METHOD},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
