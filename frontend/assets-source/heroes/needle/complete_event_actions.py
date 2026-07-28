"""Author the event Actions that the original Shadow asset did not contain."""

import math
import os

import bpy
from mathutils import Euler

BLEND_PATH = os.path.join(os.path.dirname(__file__), "needle.blend")
GLB_PATH = os.path.normpath(
    os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "..",
        "public",
        "assets",
        "heroes",
        "needle",
        "needle.glb",
    )
)


def find_bone(armature, patterns):
    for pattern in patterns:
        for bone in armature.pose.bones:
            if pattern in bone.name.casefold():
                return bone
    return None


def rig_parts(armature):
    return {
        "root": find_bone(armature, ["root", "hips", "pelvis"]),
        "hips": find_bone(armature, ["hips", "pelvis"]),
        "spine": find_bone(armature, ["spine", "chest"]),
        "head": find_bone(armature, ["head"]),
        "la": find_bone(armature, ["leftarm", "l_shoulder", "upperarm_l", "arm_l"]),
        "ra": find_bone(armature, ["rightarm", "r_shoulder", "upperarm_r", "arm_r"]),
        "lf": find_bone(armature, ["leftforearm", "l_elbow", "lowerarm_l"]),
        "rf": find_bone(armature, ["rightforearm", "r_elbow", "lowerarm_r"]),
        "ll": find_bone(armature, ["leftupleg", "l_upperleg", "thigh_l"]),
        "rl": find_bone(armature, ["rightupleg", "r_upperleg", "thigh_r"]),
    }


def reset_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key(part, frame, rotation=(0, 0, 0), location=None):
    if part is None:
        return
    part.rotation_euler = Euler(tuple(math.radians(value) for value in rotation), "XYZ")
    part.keyframe_insert("rotation_euler", frame=frame, group=part.name)
    if location is not None:
        part.location = location
        part.keyframe_insert("location", frame=frame, group=part.name)


def create_action(armature, parts, name, end_frame, poses):
    existing = bpy.data.actions.get(name)
    if existing:
        bpy.data.actions.remove(existing, do_unlink=True)
    reset_pose(armature)
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    armature.animation_data_create()
    armature.animation_data.action = action
    for frame, pose in poses:
        reset_pose(armature)
        for part_name, transform in pose.items():
            key(
                parts[part_name],
                frame,
                transform[0],
                transform[1] if len(transform) > 1 else None,
            )
    action.frame_start = 1
    action.frame_end = end_frame
    return action


armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
parts = rig_parts(armature)

create_action(
    armature,
    parts,
    "AimSuper",
    30,
    [
        (
            1,
            {
                "hips": ((-8, 0, 0),),
                "spine": ((12, 0, 0),),
                "la": ((-88, -18, -46),),
                "ra": ((-88, 18, 46),),
                "lf": ((-72, 0, 0),),
                "rf": ((-72, 0, 0),),
            },
        ),
        (
            15,
            {
                "hips": ((-18, 0, 0),),
                "spine": ((28, 0, 0),),
                "head": ((-8, 0, 0),),
                "la": ((-132, -28, -66),),
                "ra": ((-132, 28, 66),),
                "lf": ((-102, 0, 0),),
                "rf": ((-102, 0, 0),),
            },
        ),
        (
            30,
            {
                "hips": ((-8, 0, 0),),
                "spine": ((12, 0, 0),),
                "la": ((-88, -18, -46),),
                "ra": ((-88, 18, 46),),
                "lf": ((-72, 0, 0),),
                "rf": ((-72, 0, 0),),
            },
        ),
    ],
)

create_action(
    armature,
    parts,
    "Victory",
    72,
    [
        (1, {"spine": ((0, 0, 0),), "la": ((-18, 0, -12),), "ra": ((-18, 0, 12),)}),
        (
            14,
            {
                "root": ((0, 0, 0), (0, 0, -0.10)),
                "hips": ((18, 0, 0),),
                "spine": ((-24, 0, 0),),
                "la": ((24, 0, -28),),
                "ra": ((24, 0, 28),),
            },
        ),
        (
            28,
            {
                "root": ((0, 0, 160), (0, 0, 0.34)),
                "hips": ((-20, 0, 0),),
                "spine": ((30, 0, 0),),
                "la": ((-148, -18, -52),),
                "ra": ((-148, 18, 52),),
                "ll": ((16, 0, 0),),
                "rl": ((-16, 0, 0),),
            },
        ),
        (
            44,
            {
                "root": ((0, 0, 340), (0, 0, 0.08)),
                "spine": ((12, 0, 0),),
                "la": ((-126, -10, -38),),
                "ra": ((-126, 10, 38),),
            },
        ),
        (
            58,
            {
                "root": ((0, 0, 360), (0, 0, 0)),
                "hips": ((-6, 0, 0),),
                "spine": ((18, 0, 0),),
                "la": ((-118, -12, -34),),
                "ra": ((-118, 12, 34),),
            },
        ),
        (
            72,
            {
                "root": ((0, 0, 360), (0, 0, 0)),
                "spine": ((10, 0, 0),),
                "la": ((-112, -10, -30),),
                "ra": ((-112, 10, 30),),
            },
        ),
    ],
)

defeat = create_action(
    armature,
    parts,
    "Defeat",
    60,
    [
        (1, {"spine": ((0, 0, 0),), "head": ((0, 0, 0),)}),
        (
            9,
            {
                "hips": ((-12, 0, -8),),
                "spine": ((-28, 0, -18),),
                "head": ((16, 0, 10),),
                "la": ((18, 0, -20),),
                "ra": ((-52, 0, 28),),
            },
        ),
        (
            24,
            {
                "root": ((18, 0, 0), (0, 0, -0.08)),
                "hips": ((18, 0, 10),),
                "spine": ((34, 0, 22),),
                "head": ((28, 0, -12),),
                "la": ((34, 0, -12),),
                "ra": ((38, 0, 16),),
                "ll": ((-28, 0, 0),),
                "rl": ((-34, 0, 0),),
            },
        ),
        (
            42,
            {
                "root": ((30, 0, 0), (0, 0, -0.20)),
                "hips": ((28, 0, 12),),
                "spine": ((46, 0, 24),),
                "head": ((42, 0, -14),),
                "la": ((42, 0, -8),),
                "ra": ((46, 0, 12),),
                "ll": ((-42, 0, 0),),
                "rl": ((-46, 0, 0),),
            },
        ),
        (
            60,
            {
                "root": ((34, 0, 0), (0, 0, -0.24)),
                "hips": ((30, 0, 12),),
                "spine": ((50, 0, 24),),
                "head": ((48, 0, -14),),
                "la": ((46, 0, -8),),
                "ra": ((50, 0, 12),),
                "ll": ((-46, 0, 0),),
                "rl": ((-50, 0, 0),),
            },
        ),
    ],
)

armature.animation_data.action = defeat
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
bpy.ops.export_scene.gltf(
    filepath=GLB_PATH,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_skins=True,
    export_morph=True,
    export_yup=True,
    export_extras=True,
)
print(
    "SHADOW_EVENT_ACTIONS_COMPLETED", sorted(action.name for action in bpy.data.actions)
)
