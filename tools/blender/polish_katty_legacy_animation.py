"""Polish Katty's legacy all-actions blend and publish its runtime GLB."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "katty" / "katty.blend"
OUTPUT = (
    ROOT
    / "frontend"
    / "public"
    / "assets"
    / "heroes"
    / "output_heroes"
    / "katty_base.glb"
)
SCRIPT_DIR = Path(__file__).resolve().parent
if os.fspath(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, os.fspath(SCRIPT_DIR))

from export_runtime_heroes_from_scenes import export_gltf
from polish_skill_secondary_motion import d, key_rotation, secondary_offset

REVISION = 1
SKILL_PROFILES = {
    "Attack": {
        "head_s": d(4, 0, -3),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -3),
        "R_wrist_s": d(0, 0, 3),
        "L_ankle_s": d(1.5, 0, -1),
        "R_ankle_s": d(1.5, 0, 1),
        "L_hair_02_s": d(4, 0, -5),
        "R_hair_02_s": d(4, 0, 5),
    },
    "super": {
        "head_s": d(4, 0, -3),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -4),
        "R_wrist_s": d(0, 0, 4),
        "L_ankle_s": d(2, 0, -1),
        "R_ankle_s": d(2, 0, 1),
        "L_hair_02_s": d(5, 0, -6),
        "R_hair_02_s": d(5, 0, 6),
    },
    "Gadget": {
        "head_s": d(4, 0, -3),
        "L_elbow_s": d(0, 2, -2),
        "R_elbow_s": d(0, -2, 2),
        "L_wrist_s": d(0, 0, -3),
        "R_wrist_s": d(0, 0, 3),
        "L_ankle_s": d(1.5, 0, -1),
        "R_ankle_s": d(1.5, 0, 1),
        "L_hair_02_s": d(4, 0, -5),
        "R_hair_02_s": d(4, 0, 5),
    },
}
LOCOMOTION_PROFILES = {
    "idle": {
        "head_s": d(1.5, 0, -2),
        "L_wrist_s": d(0, 0, -2),
        "R_wrist_s": d(0, 0, 2),
        "L_ankle_s": d(1, 0, -1),
        "R_ankle_s": d(1, 0, 1),
        "L_hair_02_s": d(0, 0, -3),
        "R_hair_02_s": d(0, 0, 3),
    },
    "run": {
        "L_wrist_s": d(0, 0, -4),
        "R_wrist_s": d(0, 0, 4),
        "L_ankle_s": d(2, 0, -1),
        "R_ankle_s": d(2, 0, 1),
        "L_toes_s": d(1.5, 0, -1),
        "R_toes_s": d(1.5, 0, 1),
        "L_hair_02_s": d(0, 0, -4),
        "R_hair_02_s": d(0, 0, 4),
    },
}


def find_action(name: str):
    return next((action for action in bpy.data.actions if action.name == name), None)


def polish_action(armature, action, profile, skill: bool):
    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = int(action.frame_range[0]), int(action.frame_range[1])
    release = int(action.get("release_frame", start + max(1, (end - start) // 3)))
    follow = int(action.get("follow_through_frame", end - 2))
    for frame in range(start, end + 1):
        if skill:
            offset_scale = secondary_offset(
                frame, start, end, release, follow, (1.0, 1.0, 1.0), 1.0
            )
            for name, amplitude in profile.items():
                key_rotation(
                    armature.pose.bones[name],
                    frame,
                    tuple(value * offset_scale[i] for i, value in enumerate(amplitude)),
                )
        else:
            phase = (frame - start) / max(1, end - start)
            amount = math.sin(phase * math.tau)
            for name, amplitude in profile.items():
                key_rotation(
                    armature.pose.bones[name],
                    frame,
                    tuple(value * amount for value in amplitude),
                )
    action["katty_natural_motion_revision"] = REVISION
    action["katty_natural_motion_pass"] = "legacy-end-effector-follow-through"


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE))
    armature = bpy.data.objects.get("Root")
    character = bpy.data.objects.get("CHARACTER")
    if armature is None or character is None:
        raise RuntimeError("katty: missing Root armature or CHARACTER parent")

    character.rotation_euler[1] = math.pi
    character["katty_orientation_revision"] = REVISION
    for action_name, profile in SKILL_PROFILES.items():
        action = find_action(action_name)
        if action is None:
            raise RuntimeError(f"katty: missing skill action {action_name}")
        polish_action(armature, action, profile, skill=True)
    for action_name, profile in LOCOMOTION_PROFILES.items():
        action = find_action(action_name)
        if action is None:
            raise RuntimeError(f"katty: missing locomotion action {action_name}")
        polish_action(armature, action, profile, skill=False)

    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(SOURCE), check_existing=False)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix(".tmp.glb")
    export_gltf(
        filepath=os.fspath(temp),
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_skins=True,
        export_yup=True,
        export_extras=True,
        use_selection=False,
    )
    try:
        temp.replace(OUTPUT)
        print(f"EXPORTED katty: {OUTPUT}")
    except PermissionError:
        print(f"EXPORTED katty: {temp} (finalize after Blender exits)")


if __name__ == "__main__":
    main()
