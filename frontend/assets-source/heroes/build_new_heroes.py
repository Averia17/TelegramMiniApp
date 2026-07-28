import math
import os

import bpy
from mathutils import Euler, Vector

PROJECT = r"C:\Users\User\PycharmProjects\TelegramMiniApp"
FPS = 30
HEROES = {
    "fairy-mina": (
        "source/mina_fairy_geo.fbx",
        "textures/mina_fairy_tex_highres.png",
        "fairy",
    ),
    "brock-zeus": (
        "source/brock_zeus_t-pose.fbx",
        "textures/brock_zeus_tex.png",
        "gunner",
    ),
    "kaze": (
        "source/nested/Model/kaze_geisha_geo.fbx",
        "textures/kaze_geisha_tex_highres.png",
        "assassin",
    ),
    "wukong-mico": (
        "source/nested/Model/mico_wukong_geo.fbx",
        "textures/mico_wukong_tex_highres.png",
        "jumper",
    ),
    "damian": (
        "source/nested/Model/damian_geo.fbx",
        "textures/damian_tex_highres.png",
        "mage",
    ),
    "persephone-lumi": (
        "source/nested/Model/lumi_erebus_geo.fbx",
        "textures/lumi_erebus_tex_highres.png",
        "controller",
    ),
}


def first_bone(armature, patterns):
    for pattern in patterns:
        for bone in armature.pose.bones:
            if pattern in bone.name.lower():
                return bone


def rig_parts(armature):
    return {
        "root": first_bone(armature, ["root", "hips", "pelvis"]),
        "hips": first_bone(armature, ["hips", "pelvis"]),
        "spine": first_bone(armature, ["spine_upper", "spine", "chest"]),
        "chest": first_bone(armature, ["chest", "spine_upper", "spine"]),
        "head": first_bone(armature, ["head"]),
        "la": first_bone(armature, ["l_shoulder", "leftarm", "upperarm_l", "arm_l"]),
        "ra": first_bone(armature, ["r_shoulder", "rightarm", "upperarm_r", "arm_r"]),
        "lf": first_bone(armature, ["l_elbow", "leftforearm", "lowerarm_l"]),
        "rf": first_bone(armature, ["r_elbow", "rightforearm", "lowerarm_r"]),
        "lw": first_bone(armature, ["l_wrist", "lefthand", "hand_l"]),
        "rw": first_bone(armature, ["r_wrist", "righthand", "hand_r"]),
        "ll": first_bone(armature, ["l_upperleg", "leftupleg", "thigh_l"]),
        "rl": first_bone(armature, ["r_upperleg", "rightupleg", "thigh_r"]),
        "wing_l": first_bone(armature, ["wing_l", "l_wing", "leftwing"]),
        "wing_r": first_bone(armature, ["wing_r", "r_wing", "rightwing"]),
        "weapon_l": first_bone(armature, ["l_weapon_s", "l_gunbone", "l_weapon"]),
        "weapon_r": first_bone(armature, ["r_side_a_weapon", "r_weapon_s", "r_weapon"]),
        "weapon_center": first_bone(armature, ["waterball_s", "blade_s"]),
        "microphone": first_bone(armature, ["c_mic_s", "mic_handel", "l_gunbone"]),
        "speaker": first_bone(armature, ["c_speaker_0_s", "lobby_speaker_0_s"]),
    }


def reset(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def key(part, frame, rotation=(0, 0, 0), location=None):
    if not part:
        return
    part.rotation_euler = Euler(tuple(math.radians(v) for v in rotation), "XYZ")
    part.keyframe_insert("rotation_euler", frame=frame, group=part.name)
    if location is not None:
        part.location = location
        part.keyframe_insert("location", frame=frame, group=part.name)


def action(armature, parts, name, end, poses):
    reset(armature)
    result = bpy.data.actions.new(name)
    result.use_fake_user = True
    armature.animation_data.action = result
    for frame, values in poses:
        for part_name, transform in values.items():
            key(
                parts.get(part_name),
                frame,
                transform[0],
                transform[1] if len(transform) > 1 else None,
            )
    result.frame_start, result.frame_end = 1, end


def attach_equipment_bones(armature, slug):
    links = {
        "kaze": (
            ("L_weapon_s", "L_wrist_s"),
            ("R_side_A_weapon_s", "R_wrist_s"),
        ),
        "wukong-mico": (("MIC_Handel_s", "L_wrist_s"),),
        "damian": (
            ("C_mic_s", "L_wrist_s"),
            ("C_speaker_0_s", "R_wrist_s"),
        ),
        "persephone-lumi": (("R_weapon_s", "R_wrist_s"),),
    }
    requested = links.get(slug, ())
    if not requested:
        return
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for equipment_name, wrist_name in requested:
        equipment = armature.data.edit_bones.get(equipment_name)
        wrist = armature.data.edit_bones.get(wrist_name)
        if not equipment or not wrist or equipment == wrist:
            continue
        equipment_matrix = equipment.matrix.copy()
        equipment.parent = wrist
        equipment.use_connect = False
        equipment.matrix = equipment_matrix
    bpy.ops.object.mode_set(mode="OBJECT")


def rigid_attach_equipment(armature, slug):
    attachments = {
        "wukong-mico": (("HeroAttachment_Staff", "L_wrist_s"),),
        "damian": (
            ("HeroAttachment_Microphone", "L_wrist_s"),
            ("HeroAttachment_Speaker", "R_wrist_s"),
        ),
        "persephone-lumi": (("HeroAttachment_WeaponHeld", "R_wrist_s"),),
    }
    for object_name, wrist_name in attachments.get(slug, ()):
        obj = next(
            (
                item
                for item in bpy.context.scene.objects
                if item.type == "MESH" and item.name.startswith(object_name)
            ),
            None,
        )
        wrist = armature.pose.bones.get(wrist_name)
        if not obj or not wrist:
            continue
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        center = sum(corners, Vector()) / len(corners)
        wrist_world = armature.matrix_world @ wrist.matrix.translation
        world = obj.matrix_world.copy()
        world.translation += wrist_world - center
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()
        obj.parent = armature
        obj.parent_type = "BONE"
        obj.parent_bone = wrist_name
        obj.matrix_world = world


def animations(armature, archetype):
    armature.animation_data_create()
    p = rig_parts(armature)
    hover = 0.10 if archetype in {"fairy", "mage"} else 0.035
    action(
        armature,
        p,
        "Idle",
        60,
        [
            (1, {"root": ((0, 0, -2), (0, 0, 0)), "spine": ((2, 0, -2),)}),
            (
                30,
                {
                    "root": ((0, 0, 2), (0, 0, hover)),
                    "spine": ((-2, 0, 2),),
                    "wing_l": ((0, 12, 0),),
                    "wing_r": ((0, -12, 0),),
                },
            ),
            (60, {"root": ((0, 0, -2), (0, 0, 0)), "spine": ((2, 0, -2),)}),
        ],
    )
    action(
        armature,
        p,
        "Run",
        24,
        [
            (
                1,
                {
                    "root": ((10, 0, 0), (0, 0, 0)),
                    "ll": ((30, 0, 0),),
                    "rl": ((-30, 0, 0),),
                    "la": ((-25, 0, -8),),
                    "ra": ((25, 0, 8),),
                },
            ),
            (
                7,
                {
                    "root": ((8, 0, 0), (0, 0, 0.08)),
                    "ll": ((0, 0, 0),),
                    "rl": ((0, 0, 0),),
                },
            ),
            (
                13,
                {
                    "root": ((10, 0, 0), (0, 0, 0)),
                    "ll": ((-30, 0, 0),),
                    "rl": ((30, 0, 0),),
                    "la": ((25, 0, -8),),
                    "ra": ((-25, 0, 8),),
                },
            ),
            (19, {"root": ((8, 0, 0), (0, 0, 0.08))}),
            (
                24,
                {
                    "root": ((10, 0, 0), (0, 0, 0)),
                    "ll": ((30, 0, 0),),
                    "rl": ((-30, 0, 0),),
                },
            ),
        ],
    )
    aim = {
        "spine": ((-6, 12, 0),),
        "chest": ((-3, 18, 0),),
        "la": ((-54, -8, -30),),
        "lf": ((-58, 0, 0),),
        "lw": ((12, -12, -8),),
        "ra": ((-68, 12, 34),),
        "rf": ((-72, 0, 0),),
        "rw": ((18, 10, 12),),
    }
    aim_pulse = {
        **aim,
        "spine": ((-8, 15, 0),),
        "chest": ((-4, 22, 0),),
        "lw": ((18, -18, -12),),
        "rw": ((24, 16, 18),),
    }
    action(armature, p, "Aim", 30, [(1, aim), (15, aim_pulse), (30, aim)])
    super_aim = {
        "hips": ((-10, 0, 0),),
        "spine": ((16, 0, 0),),
        "chest": ((10, 0, 0),),
        "la": ((-112, -12, -38),),
        "lf": ((-74, 0, 0),),
        "lw": ((24, -18, -18),),
        "ra": ((-112, 12, 38),),
        "rf": ((-74, 0, 0),),
        "rw": ((24, 18, 18),),
        "ll": ((18, 0, 0),),
        "rl": ((18, 0, 0),),
    }
    super_charge = {
        **super_aim,
        "spine": ((24, 0, 0),),
        "chest": ((18, 0, 0),),
        "la": ((-126, -18, -48),),
        "ra": ((-126, 18, 48),),
    }
    action(
        armature,
        p,
        "AimSuper",
        30,
        [(1, super_aim), (15, super_charge), (30, super_aim)],
    )
    attack_mid = {
        "spine": ((0, -24, 0),),
        "la": ((-75, 10, -48),),
        "ra": ((-75, -10, 48),),
        "lf": ((-55, 0, 0),),
        "rf": ((-55, 0, 0),),
    }
    if archetype == "gunner":
        # Brock commands the cloud instead of merely twitching one arm:
        # crouched charge, raised hand, sharp downward cast, impact hold,
        # then a broad recoil that sells the lightning's force.
        action(
            armature,
            p,
            "Attack",
            26,
            [
                (
                    1,
                    {
                        "spine": ((-4, 8, 0),),
                        "chest": ((-2, 12, 0),),
                        "la": ((-42, -8, -28),),
                        "lf": ((-46, 0, 0),),
                        "ra": ((-54, 12, 34),),
                        "rf": ((-58, 0, 0),),
                    },
                ),
                (
                    6,
                    {
                        "spine": ((-15, -28, -8),),
                        "chest": ((-12, -38, -10),),
                        "head": ((0, 18, 0),),
                        "la": ((-72, -20, -54),),
                        "lf": ((-82, 0, 0),),
                        "ra": ((-112, 34, 62),),
                        "rf": ((-98, 8, 0),),
                        "rw": ((38, 18, 32),),
                    },
                ),
                (
                    9,
                    {
                        "spine": ((-18, -36, -10),),
                        "chest": ((-14, -48, -12),),
                        "head": ((0, 24, 0),),
                        "la": ((-82, -24, -62),),
                        "lf": ((-92, 0, 0),),
                        "ra": ((-132, 42, 72),),
                        "rf": ((-112, 12, 0),),
                        "rw": ((52, 26, 44),),
                    },
                ),
                (
                    12,
                    {
                        "spine": ((10, 38, 12),),
                        "chest": ((8, 54, 14),),
                        "head": ((0, -18, 0),),
                        "la": ((-46, 24, 30),),
                        "lf": ((-34, 0, 0),),
                        "ra": ((-42, -40, -58),),
                        "rf": ((-20, -12, 0),),
                        "rw": ((-56, -30, -62),),
                    },
                ),
                (
                    14,
                    {
                        "spine": ((13, 46, 15),),
                        "chest": ((10, 64, 18),),
                        "head": ((0, -24, 0),),
                        "la": ((-38, 30, 38),),
                        "lf": ((-26, 0, 0),),
                        "ra": ((-30, -48, -68),),
                        "rf": ((-12, -16, 0),),
                        "rw": ((-68, -38, -76),),
                    },
                ),
                (
                    19,
                    {
                        "spine": ((5, 24, 7),),
                        "chest": ((4, 34, 9),),
                        "la": ((-38, 12, 12),),
                        "lf": ((-42, 0, 0),),
                        "ra": ((-48, -20, -32),),
                        "rf": ((-34, 0, 0),),
                        "rw": ((-28, -16, -34),),
                    },
                ),
                (
                    26,
                    {
                        "spine": ((-4, 8, 0),),
                        "chest": ((-2, 12, 0),),
                        "la": ((-42, -8, -28),),
                        "lf": ((-46, 0, 0),),
                        "ra": ((-54, 12, 34),),
                        "rf": ((-58, 0, 0),),
                    },
                ),
            ],
        )
    elif archetype == "fairy":
        # Fairy Mina winds the orb behind her shoulder, holds the charge,
        # then snaps the full torso and wrist into a clear forward release.
        action(
            armature,
            p,
            "Attack",
            26,
            [
                (
                    1,
                    {
                        "spine": ((-5, 10, 0),),
                        "chest": ((-3, 14, 0),),
                        "ra": ((-58, 8, 24),),
                        "rf": ((-48, 0, 0),),
                        "rw": ((12, 0, -8),),
                    },
                ),
                (
                    6,
                    {
                        "spine": ((-12, -34, -8),),
                        "chest": ((-8, -46, -10),),
                        "head": ((0, 18, 0),),
                        "ra": ((-34, 38, 70),),
                        "rf": ((-112, 12, 0),),
                        "rw": ((42, 24, 32),),
                        "la": ((-38, -18, -54),),
                        "lf": ((-66, 0, 0),),
                        "wing_l": ((0, 30, -12),),
                        "wing_r": ((0, -30, 12),),
                    },
                ),
                (
                    8,
                    {
                        "spine": ((-14, -40, -10),),
                        "chest": ((-10, -54, -12),),
                        "head": ((0, 22, 0),),
                        "ra": ((-28, 44, 78),),
                        "rf": ((-122, 16, 0),),
                        "rw": ((52, 32, 42),),
                        "la": ((-32, -22, -62),),
                        "lf": ((-72, 0, 0),),
                        "wing_l": ((0, 38, -15),),
                        "wing_r": ((0, -38, 15),),
                    },
                ),
                (
                    11,
                    {
                        "spine": ((7, 42, 10),),
                        "chest": ((5, 58, 13),),
                        "head": ((0, -16, 0),),
                        "ra": ((-118, -34, -62),),
                        "rf": ((-18, -10, 0),),
                        "rw": ((-46, -30, -54),),
                        "la": ((-88, 26, 36),),
                        "lf": ((-24, 0, 0),),
                        "wing_l": ((0, -20, 18),),
                        "wing_r": ((0, 20, -18),),
                    },
                ),
                (
                    13,
                    {
                        "spine": ((9, 48, 13),),
                        "chest": ((7, 66, 16),),
                        "head": ((0, -20, 0),),
                        "ra": ((-126, -40, -70),),
                        "rf": ((-10, -14, 0),),
                        "rw": ((-58, -38, -68),),
                        "la": ((-96, 30, 42),),
                        "lf": ((-18, 0, 0),),
                        "wing_l": ((0, -28, 22),),
                        "wing_r": ((0, 28, -22),),
                    },
                ),
                (
                    18,
                    {
                        "spine": ((3, 26, 6),),
                        "chest": ((2, 34, 8),),
                        "ra": ((-102, -22, -44),),
                        "rf": ((-30, 0, 0),),
                        "rw": ((-24, -16, -28),),
                        "la": ((-72, 12, 18),),
                        "lf": ((-38, 0, 0),),
                    },
                ),
                (
                    26,
                    {
                        "spine": ((-5, 10, 0),),
                        "chest": ((-3, 14, 0),),
                        "ra": ((-58, 8, 24),),
                        "rf": ((-48, 0, 0),),
                        "rw": ((12, 0, -8),),
                    },
                ),
            ],
        )
    elif archetype == "assassin":
        action(
            armature,
            p,
            "Attack",
            24,
            [
                (1, aim),
                (
                    5,
                    {
                        "hips": ((-10, -24, -8),),
                        "spine": ((-16, -42, -12),),
                        "la": ((-42, 34, -74),),
                        "lf": ((-104, 0, 0),),
                        "lw": ((48, -26, -42),),
                        "ra": ((-42, -34, 74),),
                        "rf": ((-104, 0, 0),),
                        "rw": ((48, 26, 42),),
                    },
                ),
                (
                    8,
                    {
                        "hips": ((8, 34, 10),),
                        "spine": ((12, 58, 16),),
                        "la": ((-126, -30, 52),),
                        "lf": ((-22, 0, 0),),
                        "lw": ((-42, 24, 38),),
                        "ra": ((-126, 30, -52),),
                        "rf": ((-22, 0, 0),),
                        "rw": ((-42, -24, -38),),
                    },
                ),
                (
                    11,
                    {
                        "hips": ((12, -30, -12),),
                        "spine": ((18, -52, -18),),
                        "la": ((-118, 34, -48),),
                        "lf": ((-28, 0, 0),),
                        "ra": ((-118, -34, 48),),
                        "rf": ((-28, 0, 0),),
                    },
                ),
                (
                    17,
                    {
                        "spine": ((6, 26, 8),),
                        "la": ((-88, -12, 28),),
                        "ra": ((-88, 12, -28),),
                        "lf": ((-54, 0, 0),),
                        "rf": ((-54, 0, 0),),
                    },
                ),
                (24, aim),
            ],
        )
    elif archetype == "jumper":
        action(
            armature,
            p,
            "Attack",
            26,
            [
                (1, aim),
                (
                    6,
                    {
                        "hips": ((-14, -26, 0),),
                        "spine": ((-20, -42, -10),),
                        "la": ((-36, 30, -66),),
                        "lf": ((-96, 0, 0),),
                        "lw": ((44, -24, -36),),
                        "ra": ((-42, -12, 28),),
                        "rf": ((-56, 0, 0),),
                    },
                ),
                (
                    10,
                    {
                        "hips": ((20, 34, 0),),
                        "spine": ((28, 52, 14),),
                        "la": ((-134, -28, 48),),
                        "lf": ((-18, 0, 0),),
                        "lw": ((-38, 20, 32),),
                    },
                ),
                (
                    13,
                    {
                        "hips": ((28, -18, 0),),
                        "spine": ((36, -34, -16),),
                        "la": ((-122, 36, -58),),
                        "lf": ((-24, 0, 0),),
                        "lw": ((52, -30, -48),),
                    },
                ),
                (
                    19,
                    {
                        "spine": ((12, 22, 6),),
                        "la": ((-92, -10, 24),),
                        "lf": ((-48, 0, 0),),
                    },
                ),
                (26, aim),
            ],
        )
    elif archetype == "mage":
        action(
            armature,
            p,
            "Attack",
            28,
            [
                (1, aim),
                (
                    7,
                    {
                        "hips": ((-12, -24, -8),),
                        "spine": ((-18, -40, -12),),
                        "la": ((-48, 26, -54),),
                        "lf": ((-92, 0, 0),),
                        "lw": ((38, -22, -34),),
                        "ra": ((-118, -18, 48),),
                        "rf": ((-98, 0, 0),),
                        "rw": ((42, 18, 34),),
                    },
                ),
                (
                    11,
                    {
                        "hips": ((10, 34, 10),),
                        "spine": ((16, 56, 16),),
                        "la": ((-128, -26, 46),),
                        "lf": ((-18, 0, 0),),
                        "ra": ((-136, 30, -62),),
                        "rf": ((-14, 0, 0),),
                    },
                ),
                (
                    14,
                    {
                        "spine": ((22, 64, 20),),
                        "la": ((-138, -34, 58),),
                        "ra": ((-144, 38, -72),),
                    },
                ),
                (
                    18,
                    {
                        "spine": ((8, 34, 10),),
                        "la": ((-108, -12, 28),),
                        "ra": ((-114, 16, -34),),
                    },
                ),
                (28, aim),
            ],
        )
    elif archetype == "controller":
        action(
            armature,
            p,
            "Attack",
            26,
            [
                (1, aim),
                (
                    6,
                    {
                        "hips": ((-12, -30, -8),),
                        "spine": ((-18, -48, -14),),
                        "ra": ((-38, 42, 76),),
                        "rf": ((-112, 0, 0),),
                        "rw": ((52, 30, 46),),
                    },
                ),
                (
                    10,
                    {
                        "hips": ((12, 38, 12),),
                        "spine": ((18, 62, 18),),
                        "ra": ((-132, -34, -62),),
                        "rf": ((-18, 0, 0),),
                        "rw": ((-46, -28, -42),),
                    },
                ),
                (
                    13,
                    {
                        "hips": ((16, -34, -14),),
                        "spine": ((24, -56, -20),),
                        "ra": ((-124, 38, 68),),
                        "rf": ((-24, 0, 0),),
                        "rw": ((58, 34, 52),),
                    },
                ),
                (
                    19,
                    {
                        "spine": ((8, 28, 8),),
                        "ra": ((-96, -12, -28),),
                        "rf": ((-52, 0, 0),),
                    },
                ),
                (26, aim),
            ],
        )
    if archetype not in {"fairy", "gunner"}:
        pass
    action(
        armature,
        p,
        "Super",
        45,
        [
            (1, super_aim),
            (
                12,
                {
                    "root": ((0, 0, 110),),
                    "hips": ((-18, 0, 0),),
                    "spine": ((-28, -22, 0),),
                    "la": ((-142, -28, -62),),
                    "lf": ((-96, 0, 0),),
                    "lw": ((52, -30, -46),),
                    "ra": ((-142, 28, 62),),
                    "rf": ((-96, 0, 0),),
                    "rw": ((52, 30, 46),),
                    "wing_l": ((0, 42, -18),),
                    "wing_r": ((0, -42, 18),),
                },
            ),
            (
                22,
                {
                    "root": ((0, 0, 240),),
                    "hips": ((24, 0, 0),),
                    "spine": ((38, 28, 0),),
                    "la": ((-24, 46, 84),),
                    "lf": ((-18, 0, 0),),
                    "ra": ((-24, -46, -84),),
                    "rf": ((-18, 0, 0),),
                    "wing_l": ((0, -36, 28),),
                    "wing_r": ((0, 36, -28),),
                },
            ),
            (
                31,
                {
                    "root": ((0, 0, 330),),
                    "spine": ((16, 12, 0),),
                    "la": ((-92, -12, -28),),
                    "ra": ((-92, 12, 28),),
                },
            ),
            (45, super_aim),
        ],
    )
    action(
        armature,
        p,
        "Spawn",
        48,
        [
            (1, {"root": ((0, 0, 0), (0, 0, -0.35)), "spine": ((18, 0, 0),)}),
            (
                16,
                {
                    "root": ((0, 0, 150), (0, 0, 0.30)),
                    "la": ((-120, 0, -45),),
                    "ra": ((-120, 0, 45),),
                },
            ),
            (32, {"root": ((0, 0, 300), (0, 0, 0.12)), "spine": ((-12, 0, 0),)}),
            (48, {"root": ((0, 0, 360), (0, 0, 0))}),
        ],
    )
    action(
        armature,
        p,
        "Victory",
        72,
        [
            (1, {"spine": ((0, 0, 0),)}),
            (
                24,
                {
                    "root": ((0, 0, 180), (0, 0, 0.28)),
                    "la": ((-125, 0, -45),),
                    "ra": ((-125, 0, 45),),
                },
            ),
            (48, {"root": ((0, 0, 360), (0, 0, 0.10)), "spine": ((-12, 0, 0),)}),
            (72, {"root": ((0, 0, 720), (0, 0, 0))}),
        ],
    )
    action(
        armature,
        p,
        "Defeat",
        60,
        [
            (1, {"spine": ((0, 0, 0),)}),
            (
                30,
                {
                    "root": ((35, 0, 0), (0, 0, -0.18)),
                    "spine": ((28, 0, 0),),
                    "head": ((30, 0, 0),),
                    "la": ((25, 0, -15),),
                    "ra": ((25, 0, 15),),
                },
            ),
            (
                60,
                {
                    "root": ((42, 0, 0), (0, 0, -0.22)),
                    "spine": ((35, 0, 0),),
                    "head": ((38, 0, 0),),
                },
            ),
        ],
    )
    armature.animation_data.action = bpy.data.actions["Idle"]


def build(slug, model_rel, texture_rel, archetype):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = os.path.join(PROJECT, "frontend", "assets-source", "heroes", slug)
    bpy.ops.import_scene.fbx(filepath=os.path.join(source, model_rel), use_anim=False)
    for obj in list(bpy.context.scene.objects):
        if obj.type in {"CAMERA", "LIGHT"} or (
            obj.name == "Cube" and obj.type == "MESH"
        ):
            bpy.data.objects.remove(obj, do_unlink=True)
    attachment_names = {
        "brock-zeus": (("cloud", "HeroAttachment_Cloud", "attack-cloud"),),
        "wukong-mico": (("mic_geo", "HeroAttachment_Staff", "melee-weapon-left"),),
        "kaze": (("menu_geo", "HeroAttachment_FansHeld", "held-weapons"),),
        "damian": (
            ("speaker_geo", "HeroAttachment_Speaker", "throwable-weapon"),
            ("mic_geo", "HeroAttachment_Microphone", "held-weapon"),
        ),
        "persephone-lumi": (
            ("weapon2", "HeroAttachment_WeaponHeld", "melee-weapon-right"),
        ),
    }
    redundant_weapon_patterns = {
        "fairy-mina": ("waterball",),
        "kaze": ("blades01", "blades02"),
        "wukong-mico": ("cloud_geo",),
        "damian": ("lobby_speaker",),
        "persephone-lumi": ("weapon1",),
    }
    for obj in list(bpy.context.scene.objects):
        lowered = obj.name.lower()
        redundant_empty = (
            slug == "wukong-mico" and obj.type == "EMPTY" and "mic_geo" in lowered
        )
        if redundant_empty or any(
            pattern in lowered for pattern in redundant_weapon_patterns.get(slug, ())
        ):
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        lowered = obj.name.lower()
        for pattern, exported_name, role in attachment_names.get(slug, ()):
            if pattern in lowered:
                obj.name = exported_name
                obj["attachment_role"] = role
                break
    for obj in bpy.context.scene.objects:
        role = obj.get("attachment_role")
        if role not in {"attack-cloud", "companion-cloud"}:
            continue
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if armature is None:
        # Some advertised "T-pose" exports contain skinned geometry but omit
        # the armature object. Recreate a compact humanoid rig so the runtime
        # mixer always has initialized bones and never leaves the hero frozen.
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        corners = [
            obj.matrix_world @ Vector(c) for obj in meshes for c in obj.bound_box
        ]
        lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
        hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
        center = (lo + hi) * 0.5
        height = max(0.001, hi.z - lo.z)
        bpy.ops.object.armature_add(
            enter_editmode=True, location=(center.x, center.y, lo.z)
        )
        armature = bpy.context.object
        edit = armature.data.edit_bones
        base = edit[0]
        base.name, base.head, base.tail = "Root", (0, 0, 0), (0, 0, height * 0.18)

        def add(name, head, tail, parent=None):
            bone = edit.new(name)
            bone.head = head
            bone.tail = tail
            bone.parent = parent
            return bone

        hips = add("Hips", (0, 0, height * 0.18), (0, 0, height * 0.32), base)
        spine = add("Spine", (0, 0, height * 0.32), (0, 0, height * 0.58), hips)
        chest = add("Chest", (0, 0, height * 0.58), (0, 0, height * 0.72), spine)
        add("Head", (0, 0, height * 0.72), (0, 0, height * 0.93), chest)
        la = add(
            "L_Shoulder",
            (0, 0, height * 0.67),
            (-height * 0.24, 0, height * 0.66),
            chest,
        )
        add("L_Elbow", la.tail, (-height * 0.43, 0, height * 0.53), la)
        ra = add(
            "R_Shoulder",
            (0, 0, height * 0.67),
            (height * 0.24, 0, height * 0.66),
            chest,
        )
        add("R_Elbow", ra.tail, (height * 0.43, 0, height * 0.53), ra)
        ll = add(
            "L_UpperLeg",
            (-height * 0.09, 0, height * 0.18),
            (-height * 0.10, 0, -height * 0.15),
            hips,
        )
        add("L_LowerLeg", ll.tail, (-height * 0.10, 0, -height * 0.43), ll)
        rl = add(
            "R_UpperLeg",
            (height * 0.09, 0, height * 0.18),
            (height * 0.10, 0, -height * 0.15),
            hips,
        )
        add("R_LowerLeg", rl.tail, (height * 0.10, 0, -height * 0.43), rl)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="DESELECT")
        for mesh in meshes:
            # Brock's cloud is an independent companion prop. Auto-weighting it
            # to the synthetic humanoid rig explodes its vertices at runtime.
            if slug == "brock-zeus" and "cloud" in mesh.name.lower():
                continue
            mesh.select_set(True)
        armature.select_set(True)
        bpy.context.view_layer.objects.active = armature
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    armature.name = slug + "-rig"
    attach_equipment_bones(armature, slug)
    rigid_attach_equipment(armature, slug)
    root = bpy.data.objects.new(slug + "-root", None)
    bpy.context.scene.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root
    image = bpy.data.images.load(os.path.join(source, texture_rel), check_existing=True)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for slot in obj.material_slots:
            if not slot.material:
                continue
            slot.material.use_nodes = True
            node = slot.material.node_tree.nodes.get("Image Texture")
            if node:
                node.image = image
    bpy.context.view_layer.update()
    corners = [
        obj.matrix_world @ Vector(c)
        for obj in root.children_recursive
        if obj.type == "MESH"
        for c in obj.bound_box
    ]
    lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    scale = 2.45 / max(0.001, hi.z - lo.z)
    root.scale = (scale,) * 3
    bpy.context.view_layer.update()
    corners = [
        obj.matrix_world @ Vector(c)
        for obj in root.children_recursive
        if obj.type == "MESH"
        for c in obj.bound_box
    ]
    lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    root.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)
    animations(armature, archetype)
    output = os.path.join(
        PROJECT, "frontend", "public", "assets", "heroes", slug, slug + ".glb"
    )
    os.makedirs(os.path.dirname(output), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_yup=True,
        export_extras=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source, slug + ".blend"))
    print("BUILT", slug, len(armature.pose.bones), output)


only_hero = os.environ.get("ONLY_HERO")
for hero_slug, values in HEROES.items():
    if only_hero and hero_slug != only_hero:
        continue
    build(hero_slug, *values)
