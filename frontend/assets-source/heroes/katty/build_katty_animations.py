"""Build Katty's authored animation GLB from the canonical static export.

Run inside Blender.  The script deliberately rebuilds from the checked-in GLB
so the result is reproducible even when no interactive .blend file is open.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"C:\Users\User\PycharmProjects\TelegramMiniApp")
SOURCE_GLB = ROOT / "frontend/public/assets/heroes/output_heroes/katty_base.glb"
SOURCE_BLEND = ROOT / "frontend/assets-source/heroes/katty/katty.blend"
OUTPUT_GLB = ROOT / "frontend/public/assets/heroes/output_heroes/katty_base.glb"
FPS = 30


def clear_and_import() -> bpy.types.Object:
    (
        bpy.ops.object.mode_set(mode="OBJECT")
        if bpy.context.object and bpy.context.object.mode != "OBJECT"
        else None
    )
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLB))
    # SOURCE_GLB is also the runtime output.  On subsequent builds it already
    # contains the previous clips, so discard imported animation data before
    # authoring.  This keeps reruns idempotent (no Aim.001/idle.001 drift).
    for obj in bpy.context.scene.objects:
        if obj.animation_data:
            obj.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    armature.name = "Root"
    bpy.context.scene.render.fps = FPS
    return armature


ARM = clear_and_import()
BONES = ARM.pose.bones
SCENE = bpy.context.scene

# The source spray can is skinned to bottle_s, but that bone is parented to the
# chest on the character's left.  Build a stable right-wrist-relative offset.
_wrist_rest = ARM.data.bones["R_wrist_s"].matrix_local.copy()
_bottle_rest = ARM.data.bones["bottle_s"].matrix_local.copy()
_desired_bottle = _bottle_rest.copy()
# Place the can's body inside the palm, not merely near the wrist.  The donor
# rig stores bottle_s on the chest, so this offset is the actual authored grip.
_desired_bottle.translation = ARM.data.bones["R_wrist_s"].tail_local + Vector(
    (-0.50, -0.70, -1.12)
)
BOTTLE_FROM_WRIST = _wrist_rest.inverted() @ _desired_bottle
BOTTLE_SCALE = 0.95

RIGHT_GRIP = {
    "R_index_01_s": {"rot": (18, 0, 0)},
    "R_index_02_s": {"rot": (40, 0, 0)},
    "R_middle_01_s": {"rot": (26, 0, 0)},
    "R_middle_02_s": {"rot": (48, 0, 0)},
    "R_ring_01_s": {"rot": (30, 0, 0)},
    "R_ring_02_s": {"rot": (52, 0, 0)},
    "R_pinky_01_s": {"rot": (34, 0, 0)},
    "R_pinky_02_s": {"rot": (56, 0, 0)},
    "R_thumb_01_s": {"rot": (18, 0, -12)},
    "R_thumb_02_s": {"rot": (28, 0, -8)},
}
LEFT_RELAXED = {
    "L_index_01_s": {"rot": (24, 0, 0)},
    "L_index_02_s": {"rot": (34, 0, 0)},
    "L_middle_01_s": {"rot": (28, 0, 0)},
    "L_middle_02_s": {"rot": (40, 0, 0)},
    "L_ring_01_s": {"rot": (32, 0, 0)},
    "L_ring_02_s": {"rot": (44, 0, 0)},
    "L_pinky_01_s": {"rot": (36, 0, 0)},
    "L_pinky_02_s": {"rot": (48, 0, 0)},
    "L_thumb_01_s": {"rot": (35, 0, 15)},
    "L_thumb_02_s": {"rot": (45, 0, 8)},
}
RIGHT_OPEN = {name: {"rot": (0, 0, 0)} for name in RIGHT_GRIP}
DEFAULT_HANDS = {**RIGHT_GRIP, **LEFT_RELAXED, "L_wrist_s": {"rot": (-32, 0, 0)}}


def reset_pose() -> None:
    for bone in BONES:
        bone.rotation_mode = "XYZ"
        bone.location = (0.0, 0.0, 0.0)
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    ARM.location = (0.0, 0.0, 0.0)
    ARM.rotation_euler = (0.0, 0.0, 0.0)
    ARM.scale = (1.0, 1.0, 1.0)


def apply_pose(pose: dict[str, dict[str, tuple[float, float, float]]]) -> None:
    for name, values in pose.items():
        bone = BONES.get(name)
        if not bone:
            continue
        if "loc" in values:
            bone.location = values["loc"]
        if "rot" in values:
            bone.rotation_euler = tuple(math.radians(value) for value in values["rot"])
        if "scale" in values:
            bone.scale = values["scale"]


def key_bone(bone: bpy.types.PoseBone, frame: int) -> None:
    bone.keyframe_insert("location", frame=frame, group=bone.name)
    bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
    bone.keyframe_insert("scale", frame=frame, group=bone.name)


def bind_bottle_to_hand(frame: int, release: Matrix | None = None) -> None:
    bpy.context.view_layer.update()
    bottle = BONES["bottle_s"]
    target = (
        release
        if release is not None
        else BONES["R_wrist_s"].matrix @ BOTTLE_FROM_WRIST
    )
    # Assign the wrist-relative position/rotation first. Blender decomposes a
    # pose-bone matrix and can normalize its scale during assignment, so the
    # prop scale must be authored explicitly on the pose bone afterwards.
    bottle.matrix = target
    bottle.scale = (BOTTLE_SCALE, BOTTLE_SCALE, BOTTLE_SCALE)
    bottle.rotation_mode = "XYZ"
    key_bone(bottle, frame)
    key_bone(BONES["bottle_valve_01_s"], frame)


def loose_bottle(
    location: tuple[float, float, float], rotation=(0.0, 0.0, 0.0)
) -> Matrix:
    matrix = _bottle_rest.copy()
    matrix.translation = Vector(location)
    for axis, angle in zip(("X", "Y", "Z"), rotation):
        matrix = Matrix.Rotation(math.radians(angle), 4, axis) @ matrix
    matrix.translation = Vector(location)
    return matrix


def solve_right_arm(target_location: tuple[float, float, float]) -> None:
    """Solve then bake a three-bone IK pose; no constraint is left in export."""
    target = bpy.data.objects.new("__KattyIKTarget", None)
    pole = bpy.data.objects.new("__KattyIKPole", None)
    bpy.context.collection.objects.link(target)
    bpy.context.collection.objects.link(pole)
    target.location = target_location
    pole.location = (-4.0, -3.0, 7.5)
    wrist = BONES["R_wrist_s"]
    constraint = wrist.constraints.new("IK")
    constraint.target = target
    constraint.pole_target = pole
    constraint.chain_count = 3
    bpy.context.view_layer.update()
    names = ("R_shoulder_s", "R_elbow_s", "R_wrist_s")
    solved = {name: BONES[name].matrix.copy() for name in names}
    wrist.constraints.remove(constraint)
    bpy.data.objects.remove(target, do_unlink=True)
    bpy.data.objects.remove(pole, do_unlink=True)
    for name in names:
        BONES[name].matrix = solved[name]
    bpy.context.view_layer.update()


def get_fcurves(action: bpy.types.Action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def author_action(
    name: str,
    end: int,
    poses: dict[int, dict[str, dict[str, tuple[float, float, float]]]],
    *,
    linear: bool = False,
    bottle_release: dict[int, Matrix] | None = None,
    right_arm_targets: dict[int, tuple[float, float, float]] | None = None,
) -> bpy.types.Action:
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    ARM.animation_data_create()
    ARM.animation_data.action = action
    for frame in sorted(poses):
        SCENE.frame_set(frame)
        reset_pose()
        apply_pose(DEFAULT_HANDS)
        apply_pose(poses[frame])
        for bone_name in (*DEFAULT_HANDS, *poses[frame]):
            bone = BONES.get(bone_name)
            if bone:
                key_bone(bone, frame)
        if frame in (right_arm_targets or {}):
            solve_right_arm(right_arm_targets[frame])
            for bone_name in ("R_shoulder_s", "R_elbow_s", "R_wrist_s"):
                key_bone(BONES[bone_name], frame)
        bind_bottle_to_hand(frame, (bottle_release or {}).get(frame))
    for curve in get_fcurves(action):
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    action["frame_end"] = end
    return action


def locomotion_actions() -> None:
    idle_base = {
        "R_shoulder_s": {"rot": (-8, 5, -24)},
        "R_elbow_s": {"rot": (4, 0, -58)},
        "R_wrist_s": {"rot": (0, 5, 8)},
    }
    author_action(
        "idle",
        120,
        {
            1: {
                **idle_base,
                "hips_s": {"loc": (-0.08, 0, 0), "rot": (0, 0, -2)},
                "spine_mid_s": {"rot": (1, 0, 2)},
                "head_s": {"rot": (0, 0, -6)},
            },
            30: {
                **idle_base,
                "R_elbow_s": {"rot": (4, 0, -72)},
                "R_wrist_s": {"rot": (0, 8, 14)},
                "spine_mid_s": {"scale": (1.02, 1.02, 1.02)},
            },
            40: {
                **idle_base,
                "R_elbow_s": {"rot": (4, 0, -50)},
                "R_wrist_s": {"rot": (0, -8, 2)},
            },
            60: {
                **idle_base,
                "hips_s": {"loc": (0.08, 0, 0), "rot": (0, 0, 2)},
                "head_s": {"rot": (0, 0, 7)},
                "L_shoulder_s": {"rot": (0, -8, 20)},
                "L_elbow_s": {"rot": (0, 0, 65)},
            },
            70: {
                **idle_base,
                "L_shoulder_s": {"rot": (-8, -12, 38)},
                "L_elbow_s": {"rot": (0, 0, 92)},
                "L_wrist_s": {"rot": (-20, 0, -15)},
            },
            82: {
                **idle_base,
                "hips_s": {"loc": (0.05, 0, 0)},
                "L_shoulder_s": {"rot": (0, 0, 10)},
                "L_elbow_s": {"rot": (0, 0, 25)},
                "head_s": {"rot": (0, 0, 4)},
            },
            120: {
                **idle_base,
                "hips_s": {"loc": (-0.08, 0, 0), "rot": (0, 0, -2)},
                "spine_mid_s": {"rot": (1, 0, 2)},
                "head_s": {"rot": (0, 0, -6)},
            },
        },
    )

    run_a = {
        "hips_s": {"loc": (0, -0.02, 0.03), "rot": (0, 0, 3)},
        "spine_lower_s": {"rot": (18, 0, -5)},
        "L_upperLeg_s": {"rot": (34, 0, 0)},
        "L_lowerLeg_s": {"rot": (-52, 0, 0)},
        "R_upperLeg_s": {"rot": (-30, 0, 0)},
        "R_lowerLeg_s": {"rot": (-12, 0, 0)},
        "R_shoulder_s": {"rot": (-22, 0, -20)},
        "R_elbow_s": {"rot": (5, 0, -55)},
        "L_shoulder_s": {"rot": (22, 0, 18)},
        "L_elbow_s": {"rot": (0, 0, 42)},
    }
    run_b = {
        "hips_s": {"loc": (0, 0.02, -0.04), "rot": (0, 0, -3)},
        "spine_lower_s": {"rot": (20, 0, 5)},
        "L_upperLeg_s": {"rot": (-30, 0, 0)},
        "L_lowerLeg_s": {"rot": (-12, 0, 0)},
        "R_upperLeg_s": {"rot": (34, 0, 0)},
        "R_lowerLeg_s": {"rot": (-52, 0, 0)},
        "R_shoulder_s": {"rot": (18, 0, -18)},
        "R_elbow_s": {"rot": (5, 0, -48)},
        "L_shoulder_s": {"rot": (-24, 0, 18)},
        "L_elbow_s": {"rot": (0, 0, 48)},
    }
    author_action(
        "run", 24, {1: run_a, 7: run_b, 13: run_b, 19: run_a, 24: run_a}, linear=False
    )


def aim_actions() -> None:
    aim = {
        "hips_s": {"loc": (0, 0, -0.05)},
        "spine_lower_s": {"rot": (15, 0, -10)},
        "R_clavicle_s": {"rot": (0, -8, 6)},
        "R_shoulder_s": {"rot": (0, -10, 70)},
        "R_elbow_s": {"rot": (0, -8, -10)},
        "R_wrist_s": {"rot": (0, -10, -3)},
        "L_shoulder_s": {"rot": (0, 12, -48)},
        "L_elbow_s": {"rot": (0, 0, 58)},
        "head_s": {"rot": (6, 0, -8)},
    }
    author_action(
        "Aim", 30, {1: aim, 15: {**aim, "spine_mid_s": {"rot": (1, 0, 1)}}, 30: aim}
    )
    aim_super = {
        "hips_s": {"rot": (-8, 0, 5)},
        "spine_lower_s": {"rot": (-10, 0, -12)},
        "R_shoulder_s": {"rot": (42, 8, -38)},
        "R_elbow_s": {"rot": (0, 0, -68)},
        "R_wrist_s": {"rot": (8, 0, 12)},
        "L_shoulder_s": {"rot": (-70, 0, 25)},
        "L_elbow_s": {"rot": (0, 0, -12)},
        "head_s": {"rot": (-4, 0, -6)},
    }
    author_action(
        "AimSuper",
        30,
        {
            1: aim_super,
            15: {**aim_super, "head_s": {"rot": (-2, 0, -4)}},
            30: aim_super,
        },
    )


def attack_action() -> None:
    neutral = {
        "R_shoulder_s": {"rot": (-12, 0, -28)},
        "R_elbow_s": {"rot": (0, 0, -58)},
        "R_wrist_s": {"rot": (0, 4, 8)},
        "L_shoulder_s": {"rot": (0, 0, 8)},
    }
    recoil = lambda strength: {
        **neutral,
        "hips_s": {"rot": (0, 0, strength * 2.2)},
        "spine_lower_s": {"rot": (0, 0, strength * 5)},
        "R_shoulder_s": {"rot": (-4, -strength * 6, 60 + strength * 8)},
        "R_elbow_s": {"rot": (0, -strength * 4, -14 + strength * 2)},
        "R_wrist_s": {"rot": (0, -12, -8 - strength * 3)},
        "L_shoulder_s": {"rot": (12, 0, 18 + strength * 3)},
        "head_s": {"rot": (-strength * 2, 0, -3)},
    }
    windup = lambda strength: {
        **neutral,
        "hips_s": {"rot": (0, 0, -strength * 2)},
        "spine_lower_s": {"rot": (0, 0, -strength * 4)},
        "R_shoulder_s": {"rot": (4, strength * 8, 24 + strength * 4)},
        "R_elbow_s": {"rot": (0, 0, -58)},
    }
    author_action(
        "Attack",
        36,
        {
            1: neutral,
            5: windup(1),
            7: recoil(1),
            9: neutral,
            11: windup(1.15),
            13: recoil(1.15),
            15: neutral,
            17: windup(1.3),
            19: recoil(1.5),
            22: {**neutral, "R_wrist_s": {"rot": (0, 8, 16)}},
            26: neutral,
            36: neutral,
        },
    )


def super_action() -> None:
    ready = {
        "hips_s": {"loc": (0, 0, -0.08), "rot": (0, 0, -10)},
        "spine_lower_s": {"rot": (15, 0, -16)},
        "R_shoulder_s": {"rot": (42, 8, -42)},
        "R_elbow_s": {"rot": (0, 0, -70)},
        "R_wrist_s": {"rot": (8, 0, 14)},
        "L_shoulder_s": {"rot": (-58, 0, 28)},
        "L_elbow_s": {"rot": (0, 0, -12)},
        "head_s": {"rot": (-4, 0, -5)},
    }
    throw = {
        "hips_s": {"rot": (0, 0, 16)},
        "spine_lower_s": {"rot": (-10, 0, 18)},
        "R_shoulder_s": {"rot": (-8, -14, 82)},
        "R_elbow_s": {"rot": (0, -8, -2)},
        "R_wrist_s": {"rot": (0, -18, -20)},
        "L_shoulder_s": {"rot": (25, 0, -12)},
        "head_s": {"rot": (-6, 0, 8)},
    }
    settle = {
        "hips_s": {"rot": (0, 0, 4)},
        "spine_lower_s": {"rot": (-3, 0, 5)},
        "R_shoulder_s": {"rot": (-35, 0, -12)},
        "R_elbow_s": {"rot": (0, 0, -22)},
        "head_s": {"rot": (5, 0, 4)},
    }
    author_action(
        "super",
        42,
        {
            1: ready,
            10: ready,
            14: {**ready, "R_shoulder_s": {"rot": (-12, 0, -34)}},
            16: {**throw, **RIGHT_OPEN},
            18: {**throw, **RIGHT_OPEN},
            22: {**settle, **RIGHT_OPEN},
            30: settle,
            42: {},
        },
        bottle_release={
            18: loose_bottle((-3.0, -1.0, 8.4), (15, 0, 20)),
            22: loose_bottle((-3.6, -1.5, 9.7), (80, 0, 110)),
            30: loose_bottle((-4.2, -2.0, 4.6), (170, 0, 210)),
            42: loose_bottle((-4.2, -2.0, 0.8), (90, 0, 260)),
        },
    )


def gadget_action() -> None:
    crouch = {
        "hips_s": {"loc": (0, 0, -0.10)},
        "spine_lower_s": {"rot": (30, 0, 0)},
        "L_upperLeg_s": {"rot": (28, 0, 0)},
        "R_upperLeg_s": {"rot": (28, 0, 0)},
        "L_lowerLeg_s": {"rot": (-55, 0, 0)},
        "R_lowerLeg_s": {"rot": (-55, 0, 0)},
        "R_shoulder_s": {"rot": (-18, 0, -34)},
        "R_elbow_s": {"rot": (0, 0, -72)},
        "L_shoulder_s": {"rot": (-16, 0, 34)},
        "L_elbow_s": {"rot": (0, 0, 72)},
    }
    flight = {
        "hips_s": {"loc": (0, -0.35, 0.18)},
        "spine_lower_s": {"rot": (62, 0, 0)},
        "R_upperLeg_s": {"rot": (52, 0, 0)},
        "R_lowerLeg_s": {"rot": (-70, 0, 0)},
        "L_upperLeg_s": {"rot": (-38, 0, 0)},
        "L_lowerLeg_s": {"rot": (-18, 0, 0)},
        "R_shoulder_s": {"rot": (0, 0, -72)},
        "R_elbow_s": {"rot": (0, 0, -18)},
        "L_shoulder_s": {"rot": (0, 0, 72)},
        "L_elbow_s": {"rot": (0, 0, 18)},
        "head_s": {"rot": (-18, 0, 0)},
    }
    land = {
        **crouch,
        "hips_s": {"loc": (0, -0.15, -0.06)},
        "spine_lower_s": {"rot": (18, 0, 0)},
    }
    author_action(
        "Gadget",
        30,
        {1: crouch, 5: crouch, 9: flight, 14: flight, 18: land, 22: land, 30: {}},
    )


def reaction_actions() -> None:
    hit = {
        "hips_s": {"loc": (0, 0.12, 0)},
        "spine_lower_s": {"rot": (-20, 0, 0)},
        "R_shoulder_s": {"rot": (24, 0, -44)},
        "R_elbow_s": {"rot": (0, 0, -34)},
        "L_shoulder_s": {"rot": (18, 0, 52)},
        "L_elbow_s": {"rot": (0, 0, 12)},
        "head_s": {"rot": (-18, 0, 0)},
    }
    author_action(
        "hit",
        16,
        {1: {}, 4: hit, 8: {**hit, "head_s": {"rot": (16, 0, 0)}}, 12: {}, 16: {}},
    )

    collapse = {
        "hips_s": {"loc": (0, 0, -0.35), "rot": (20, 0, 20)},
        "spine_lower_s": {"rot": (38, 0, 18)},
        "L_upperLeg_s": {"rot": (34, 0, 8)},
        "R_upperLeg_s": {"rot": (30, 0, -8)},
        "L_lowerLeg_s": {"rot": (-68, 0, 0)},
        "R_lowerLeg_s": {"rot": (-62, 0, 0)},
        "R_shoulder_s": {"rot": (-34, 0, -30)},
        "R_elbow_s": {"rot": (0, 0, -70)},
        "L_shoulder_s": {"rot": (-18, 0, 48)},
        "head_s": {"rot": (-25, 0, 12)},
    }
    fallen = {
        "hips_s": {"loc": (1.2, 0, -2.9), "rot": (78, 0, 54)},
        "spine_lower_s": {"rot": (48, 0, 26)},
        "spine_mid_s": {"rot": (18, 0, 18)},
        "L_upperLeg_s": {"rot": (48, 8, 12)},
        "R_upperLeg_s": {"rot": (-18, -10, -20)},
        "L_lowerLeg_s": {"rot": (-78, 0, 0)},
        "R_lowerLeg_s": {"rot": (-38, 0, 0)},
        "R_shoulder_s": {"rot": (38, 0, -72)},
        "R_elbow_s": {"rot": (0, 0, -16)},
        "L_shoulder_s": {"rot": (-28, 0, 86)},
        "L_elbow_s": {"rot": (0, 0, 22)},
        "head_s": {"rot": (28, 0, 30)},
    }
    author_action(
        "death",
        50,
        {
            1: {},
            12: collapse,
            20: {**collapse, **RIGHT_OPEN, "head_s": {"rot": (12, 0, 22)}},
            28: {**fallen, **RIGHT_OPEN},
            50: {**fallen, **RIGHT_OPEN},
        },
        bottle_release={
            20: loose_bottle((-2.4, -0.5, 4.0), (35, 0, 20)),
            24: loose_bottle((-1.0, -0.8, 1.0), (88, 0, 95)),
            28: loose_bottle((0.2, -0.8, 0.55), (92, 0, 150)),
            50: loose_bottle((0.2, -0.8, 0.55), (92, 0, 150)),
        },
    )


def spawn_action() -> None:
    crouch = {
        "hips_s": {"loc": (0, 0, -0.32)},
        "spine_lower_s": {"rot": (42, 0, 0)},
        "L_upperLeg_s": {"rot": (45, 0, 0)},
        "R_upperLeg_s": {"rot": (45, 0, 0)},
        "L_lowerLeg_s": {"rot": (-82, 0, 0)},
        "R_lowerLeg_s": {"rot": (-82, 0, 0)},
        "R_shoulder_s": {"rot": (-12, 0, -28)},
        "R_elbow_s": {"rot": (0, 0, -64)},
        "L_shoulder_s": {"rot": (22, 0, 34)},
        "L_elbow_s": {"rot": (0, 0, 48)},
        "head_s": {"rot": (28, 0, 0)},
    }
    stand = {
        "R_shoulder_s": {"rot": (-8, 4, -24)},
        "R_elbow_s": {"rot": (4, 0, -58)},
        "R_wrist_s": {"rot": (0, 5, 8)},
        "head_s": {"rot": (-4, 0, 0)},
    }
    author_action(
        "Spawn",
        40,
        {
            1: crouch,
            12: crouch,
            18: {
                **crouch,
                "hips_s": {"loc": (0, 0, -0.12)},
                "spine_lower_s": {"rot": (18, 0, 0)},
            },
            22: stand,
            25: {
                **stand,
                "R_elbow_s": {"rot": (4, 0, -74)},
                "R_wrist_s": {"rot": (0, 12, 16)},
            },
            28: {
                **stand,
                "R_elbow_s": {"rot": (4, 0, -48)},
                "R_wrist_s": {"rot": (0, -10, 0)},
            },
            30: stand,
            40: stand,
        },
    )


def victory_action() -> None:
    proud = {
        "hips_s": {"loc": (-0.08, 0, 0), "rot": (0, 0, -5)},
        "spine_lower_s": {"rot": (-5, 0, 4)},
        "R_upperLeg_s": {"rot": (-8, 0, 4)},
        "R_lowerLeg_s": {"rot": (-8, 0, 0)},
        "L_shoulder_s": {"rot": (0, 0, 42)},
        "L_elbow_s": {"rot": (0, 0, 78)},
        "head_s": {"rot": (-4, 0, -3)},
    }
    write = lambda x, y, z: {
        **proud,
        "R_shoulder_s": {"rot": (-8 + y, -10, 54 + x)},
        "R_elbow_s": {"rot": (0, -5, -18 + z)},
        "R_wrist_s": {"rot": (0, -12 + y, x)},
        "head_s": {"rot": (-6, 0, x * 0.35)},
    }
    author_action(
        "Victory",
        55,
        {
            1: {
                "hips_s": {"loc": (-0.12, 0, 0), "rot": (0, 0, -8)},
                "spine_lower_s": {"rot": (0, 0, 8)},
            },
            5: {
                "hips_s": {"loc": (0.12, 0, 0), "rot": (0, 0, 8)},
                "spine_lower_s": {"rot": (0, 0, -8)},
                "head_s": {"rot": (5, 0, 0)},
            },
            9: {
                "hips_s": {"loc": (-0.12, 0, 0), "rot": (0, 0, -8)},
                "spine_lower_s": {"rot": (0, 0, 8)},
            },
            15: proud,
            30: proud,
            33: write(-18, 5, 0),
            36: write(10, -4, 8),
            39: write(-4, 8, -4),
            42: write(16, -5, 10),
            45: write(-12, 6, -2),
            48: write(12, 0, 6),
            50: write(0, 2, 0),
            55: proud,
        },
        right_arm_targets={
            33: (-2.7, -1.0, 8.8),
            36: (-1.1, -1.0, 10.0),
            39: (-2.5, -1.0, 9.7),
            42: (-1.0, -1.0, 8.9),
            45: (-2.7, -1.0, 9.2),
            48: (-1.0, -1.0, 9.9),
            50: (-1.8, -1.0, 8.8),
        },
    )


locomotion_actions()
aim_actions()
attack_action()
super_action()
gadget_action()
reaction_actions()
spawn_action()
victory_action()

SCENE.frame_start = 1
SCENE.frame_end = 120
SCENE.frame_set(1)
ARM.animation_data.action = bpy.data.actions["idle"]
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))

bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT_GLB),
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_force_sampling=True,
    export_frame_range=False,
    export_skins=True,
    export_morph=True,
    export_apply=False,
)
print(f"KATTY_BUILD_OK actions={sorted(action.name for action in bpy.data.actions)}")
