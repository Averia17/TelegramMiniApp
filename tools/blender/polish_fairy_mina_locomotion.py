"""Give Fairy Mina's idle/run clips restrained, loop-safe secondary motion."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from mathutils import Euler

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "scenes"
REVISION = 1


def d(x=0.0, y=0.0, z=0.0):
    return (math.radians(x), math.radians(y), math.radians(z))


def find_action(name: str):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name
        ),
        None,
    )


def add_rotation(bone, frame: int, offset):
    mode = (
        bone.rotation_mode
        if bone.rotation_mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
        else "XYZ"
    )
    bone.rotation_euler = Euler(
        tuple(bone.rotation_euler[index] + offset[index] for index in range(3)), mode
    )
    bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)


def polish(clip: str, profile: dict):
    path = SOURCE / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(clip)
    if armature is None or action is None:
        raise RuntimeError(f"fairy-mina/{clip}: missing armature or action")
    if scene.get("natural_locomotion_revision") == REVISION:
        print(f"SKIP fairy-mina/{clip}: locomotion revision {REVISION}")
        return

    missing = sorted(set(profile) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"fairy-mina/{clip}: missing secondary bones {missing}")

    armature.animation_data_create()
    armature.animation_data.action = action
    start, end = (int(action.frame_range[0]), int(action.frame_range[1]))
    span = max(1, end - start)
    for frame in range(start, end + 1):
        phase = (frame - start) / span
        # A full sine cycle has matching value and tangent at both loop ends.
        for bone_name, settings in profile.items():
            cycles = settings.get("cycles", 1.0)
            phase_offset = settings.get("phase", 0.0)
            amount = math.sin((phase * cycles + phase_offset) * math.tau)
            amplitude = settings["amplitude"]
            add_rotation(
                armature.pose.bones[bone_name],
                frame,
                tuple(value * amount for value in amplitude),
            )

    scene["natural_locomotion_revision"] = REVISION
    scene["natural_locomotion_pass"] = "fairy-secondary-loop"
    action["natural_locomotion_revision"] = REVISION
    action["natural_locomotion_pass"] = "fairy-secondary-loop"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"POLISHED fairy-mina/{clip}: loop-safe secondary locomotion")


PROFILES = {
    "idle": {
        "L_wing_up_s": {"amplitude": d(0, 2.0, 0)},
        "R_wing_up_s": {"amplitude": d(0, -2.0, 0)},
        "L_wing_down_s": {"amplitude": d(0, 1.2, 0), "phase": -0.08},
        "R_wing_down_s": {"amplitude": d(0, -1.2, 0), "phase": -0.08},
        "L_hair_side_1_s": {"amplitude": d(0, 0, -2.6), "phase": -0.12},
        "L_hair_side_2_s": {"amplitude": d(0, 0, -4.0), "phase": -0.2},
        "L_hair_side_3_s": {"amplitude": d(0, 0, -5.0), "phase": -0.28},
    },
    "run": {
        "L_wrist_s": {"amplitude": d(0, 0, -4.0), "cycles": 1.0},
        "R_wrist_s": {"amplitude": d(0, 0, 4.0), "phase": 0.5},
        "L_lower_elbow_0_bend_s": {"amplitude": d(0, 2.0, 0), "phase": 0.12},
        "R_lower_elbow_0_bend_s": {"amplitude": d(0, -2.0, 0), "phase": 0.62},
        "L_wing_down_s": {"amplitude": d(0, 1.5, 0), "phase": -0.1},
        "R_wing_down_s": {"amplitude": d(0, -1.5, 0), "phase": 0.4},
        "L_hair_side_2_s": {"amplitude": d(0, 0, -3.0), "phase": -0.16},
        "L_hair_side_3_s": {"amplitude": d(0, 0, -4.0), "phase": -0.24},
    },
}


for _clip, _profile in PROFILES.items():
    polish(_clip, _profile)
