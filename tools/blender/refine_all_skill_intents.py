"""Add a restrained semantic beat to every non-refined focused skill scene."""

from __future__ import annotations

import importlib.util
import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
SPEC_PATH = Path(__file__).with_name("hero_skill_animation_semantics.json")
AUTHOR_PATH = Path(__file__).with_name("author_skill_animation_semantics.py")
INTENTS = {
    "mandy": {"attack": "strike", "super": "wave_release", "gadget": "stance_lock"},
    "kaze": {"attack": "slash_2", "super": "dash_impact", "gadget": "vanish"},
    "wukong-mico": {"attack": "staff_impact", "super": "vortex_open", "gadget": "armor_lock"},
    "needle": {"attack": "spore_release", "super": "root_plant", "gadget": "heal_tick"},
    "fairy-mina": {"attack": "star_fan", "super": "cocoon_follow", "gadget": "repel"},
    "persephone-lumi": {"attack": "orb_cast", "super": "root_rise", "gadget": "garden_burst"},
    "brock-zeus": {"attack": "thunder_fire", "super": "strike_3", "gadget": "cable_prime"},
}
ACTION_NAMES = {"attack": "Attack", "super": "super", "gadget": "Gadget"}


def load_author_module():
    spec = importlib.util.spec_from_file_location("skill_author", AUTHOR_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def find_action(name):
    return next((action for action in bpy.data.actions if action.name.casefold().split(".")[0] == name.casefold()), None)


def add_offset(bone, offset):
    if bone.rotation_mode == "QUATERNION":
        bone.rotation_quaternion = bone.rotation_quaternion @ Euler(offset, "XYZ").to_quaternion()
        return "rotation_quaternion"
    mode = bone.rotation_mode if bone.rotation_mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"} else "XYZ"
    bone.rotation_euler = Euler(tuple(bone.rotation_euler[i] + offset[i] for i in range(3)), mode)
    return "rotation_euler"


def author(hero, clip, contract, intent, module):
    path = SOURCE / hero / "scenes" / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    if scene.get("readability_revision", 0) >= 2:
        marker = scene.timeline_markers.get(intent)
        if marker is None:
            scene.timeline_markers.new(intent, frame=contract["release"])
            bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
            print(f"MARKED {hero}/{clip}")
        else:
            print(f"SKIP {hero}/{clip}: already refined")
        return
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(ACTION_NAMES[clip])
    if armature is None or action is None:
        raise RuntimeError(f"{hero}/{clip}: missing armature or action")
    armature.animation_data_create()
    armature.animation_data.action = action
    accents = module.ACCENTS[hero][clip]
    bones = set().union(*(pose.keys() for pose in accents.values()))
    start, end = contract["frames"][0], contract["frames"][-1]
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        offsets = module.sampled_offsets(contract, accents, frame)
        for bone_name, offset in offsets.items():
            bone = armature.pose.bones[bone_name]
            scaled = tuple(value * 0.18 for value in offset)
            path_name = add_offset(bone, scaled)
            bone.keyframe_insert(path_name, frame=frame, group=bone_name)
    scene.timeline_markers.new(intent, frame=contract["release"])
    scene["readability_revision"] = 2
    scene["semantic_intent"] = intent
    scene["authoring_status"] = "semantic-authored-intent-refined"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"REFINED {hero}/{clip}: {intent}")


def main():
    module = load_author_module()
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    for hero, clips in INTENTS.items():
        for clip, intent in clips.items():
            author(hero, clip, spec["heroes"][hero][clip], intent, module)


if __name__ == "__main__":
    main()
