import math
import os

import bpy
from mathutils import Euler, Matrix, Vector

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
            rotation = transform[0]
            if (
                name == "Attack"
                and frame not in {1, end}
                and part_name
                in {"hips", "spine", "chest", "la", "lf", "lw", "ra", "rf", "rw"}
            ):
                # Push anticipation/contact/follow-through while preserving the
                # entry and recovery poses used by runtime cross-fades.
                rotation = tuple(
                    max(-165, min(165, value * 1.12)) for value in rotation
                )
            key(
                parts.get(part_name),
                frame,
                rotation,
                transform[1] if len(transform) > 1 else None,
            )
    if armature.get("hero_slug") == "wukong-mico":
        # A persistent cylindrical power-grip: proximal phalanges close around
        # the shaft and distal phalanges continue the curve. Key both ends so
        # every exported Action owns the grip instead of relying on bind pose.
        grip_rotations = {
            "L_thumb_01_s": (52.935, 58.865, -50.0),
            "L_thumb_02_s": (-2.935, -28.522, 0.0),
            "L_index_01_s": (-58.737, -50.0, 0.0),
            "L_index_02_s": (-66.869, -30.02, -43.955),
            "L_middle_01_s": (-36.934, 15.408, 44.041),
            "L_middle_02_s": (57.853, -51.384, 48.616),
            "L_ring_01_s": (89.176, -26.798, 12.375),
            "L_ring_02_s": (41.681, -115.905, 47.484),
            "L_pinky_01_s": (33.54, -78.163, 58.319),
            "L_pinky_02_s": (48.729, 97.742, 50.0),
        }
        for frame in (1, end):
            for bone_name, rotation in grip_rotations.items():
                key(armature.pose.bones.get(bone_name), frame, rotation)
    elif armature.get("hero_slug") == "persephone-lumi":
        grip_rotations = {
            "R_thumb_01_s": (98.438, 64.511, 4.575),
            "R_thumb_02_s": (-41.574, 12.375, 0.0),
            "R_index_01_s": (62.253, 73.702, -46.319),
            "R_index_02_s": (116.327, -92.209, 61.844),
            "R_middle_01_s": (111.608, 52.106, 50.419),
            "R_middle_02_s": (-101.722, 8.706, 83.984),
            "R_ring_01_s": (69.467, 19.75, 85.902),
            "R_ring_02_s": (4.575, 2.998, -90.8),
            "R_pinky_01_s": (5.28, 49.295, 92.009),
            "R_pinky_02_s": (-14.509, -37.199, -106.404),
        }
        for frame in (1, end):
            for bone_name, rotation in grip_rotations.items():
                key(armature.pose.bones.get(bone_name), frame, rotation)
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


def ensure_weapon_socket_bone(armature, slug):
    if slug == "kaze":
        bpy.context.view_layer.objects.active = armature
        armature.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        for side in ("L", "R"):
            wrist = armature.data.edit_bones.get(f"{side}_wrist_s")
            if not wrist:
                continue
            socket = armature.data.edit_bones.get(f"weapon_socket_{side.casefold()}")
            if socket is None:
                socket = armature.data.edit_bones.new(
                    f"weapon_socket_{side.casefold()}"
                )
            socket.parent = wrist
            socket.use_connect = False
            socket.use_deform = False
            socket.head = wrist.head
            direction = (wrist.head - wrist.tail).normalized()
            socket.tail = wrist.head + direction * max(wrist.length * 0.18, 0.03)
        bpy.ops.object.mode_set(mode="OBJECT")
        return
    configurations = {
        "wukong-mico": (
            "L_wrist_s",
            (
                "L_thumb_01_s",
                "L_index_01_s",
                "L_middle_01_s",
                "L_ring_01_s",
                "L_pinky_01_s",
            ),
        ),
        "persephone-lumi": (
            "R_wrist_s",
            (
                "R_thumb_01_s",
                "R_index_01_s",
                "R_middle_01_s",
                "R_ring_01_s",
                "R_pinky_01_s",
            ),
        ),
    }
    configuration = configurations.get(slug)
    if not configuration:
        return
    wrist_name, grip_bones = configuration
    wrist = armature.data.bones.get(wrist_name)
    if not wrist:
        return
    grip_points = [
        armature.data.bones[name].tail_local
        for name in grip_bones
        if armature.data.bones.get(name)
    ]
    # The handle centre belongs inside the arc of the proximal phalanges, not
    # inside the palm volume. Their tails describe that arc in the bind pose.
    palm = sum(grip_points, Vector()) / len(grip_points)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_wrist = armature.data.edit_bones.get(wrist.name)
    socket = armature.data.edit_bones.get("weapon_socket_r")
    if socket is None:
        socket = armature.data.edit_bones.new("weapon_socket_r")
    socket.parent = edit_wrist
    socket.use_connect = False
    socket.use_deform = False
    socket.head = palm
    direction = (edit_wrist.tail - edit_wrist.head).normalized()
    socket.tail = palm + direction * max(edit_wrist.length * 0.18, 0.03)
    bpy.ops.object.mode_set(mode="OBJECT")


def create_weapon_sockets(armature, slug=None):
    sockets = {}
    for side, wrist in (
        ("L", rig_parts(armature)["lw"]),
        ("R", rig_parts(armature)["rw"]),
    ):
        if not wrist:
            continue
        socket = bpy.data.objects.new(f"Socket.Weapon.{side}", None)
        bpy.context.scene.collection.objects.link(socket)
        socket["socket_role"] = f"weapon-{side.casefold()}"
        socket.parent = armature
        socket.parent_type = "BONE"
        socket.parent_bone = wrist.name
        socket_matrix = armature.matrix_world @ wrist.matrix
        use_finger_arc = (slug == "wukong-mico" and side == "L") or (
            slug == "persephone-lumi" and side == "R"
        )
        if use_finger_arc:
            # Wukong has a complete finger rig. Its wrist tail is below the
            # rendered palm, so derive the socket from the finger roots and
            # wrist head instead of guessing from a mesh bounding box.
            prefix = "L" if side == "L" else "R"
            grip_bones = [
                armature.pose.bones.get(name)
                for name in (
                    f"{prefix}_thumb_01_s",
                    f"{prefix}_index_01_s",
                    f"{prefix}_middle_01_s",
                    f"{prefix}_ring_01_s",
                    f"{prefix}_pinky_01_s",
                )
            ]
            grip_points = [
                armature.matrix_world @ bone.tail for bone in grip_bones if bone
            ]
            socket_matrix.translation = sum(grip_points, Vector()) / len(grip_points)
            socket["grip_anchor"] = "proximal-phalange-arc"
        elif slug == "kaze":
            # Kaze's exported wrist bones are reversed: head is the concealed
            # hand at the sleeve opening and tail points back toward the elbow.
            socket_matrix.translation = armature.matrix_world @ wrist.head
            socket["grip_anchor"] = "reversed-wrist-head"
        else:
            # The rendered palm normally sits at the end of the wrist bone.
            socket_matrix.translation = armature.matrix_world @ wrist.tail
            socket["grip_anchor"] = "bone-tail"
        socket.matrix_world = socket_matrix
        sockets[side] = socket
    return sockets


def rigid_attach_equipment(armature, slug):
    attachments = {
        "kaze": (
            ("HeroAttachment_FanLeft", "L"),
            ("HeroAttachment_FanRight", "R"),
        ),
        "wukong-mico": (("HeroAttachment_Staff", "L_wrist_s"),),
        "damian": (
            ("HeroAttachment_Microphone", "L_wrist_s"),
            ("HeroAttachment_Speaker", "R_wrist_s"),
        ),
        "persephone-lumi": (("HeroAttachment_WeaponHeld", "R_wrist_s"),),
    }
    ensure_weapon_socket_bone(armature, slug)
    sockets = create_weapon_sockets(armature, slug)
    grip_height = {
        ("kaze", "HeroAttachment_FanLeft"): 0.32,
        ("kaze", "HeroAttachment_FanRight"): 0.32,
        # The authored grip is the recessed lower handle between the end cap
        # and guard ring. Holding the central shaft ignores the prop design;
        # 10% of its longitudinal bounds lands in that narrow hand recess.
        ("wukong-mico", "HeroAttachment_Staff"): 0.10,
        ("damian", "HeroAttachment_Microphone"): 0.24,
        ("damian", "HeroAttachment_Speaker"): 0.50,
        # Persephone's mesh includes the large flower head and ribbon pieces.
        # The actual handle occupies only the bottom ~8% of the combined bounds.
        ("persephone-lumi", "HeroAttachment_WeaponHeld"): 0.08,
    }
    grip_x = {
        ("kaze", "HeroAttachment_FanLeft"): 0.35,
        ("kaze", "HeroAttachment_FanRight"): 0.35,
        ("persephone-lumi", "HeroAttachment_WeaponHeld"): 0.5,
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
        side = wrist_name if wrist_name in {"L", "R"} else wrist_name[:1]
        wrist = (
            armature.pose.bones.get(wrist_name)
            if wrist_name not in {"L", "R"}
            else rig_parts(armature)[f"{side.casefold()}w"]
        )
        socket = sockets.get(side)
        if not obj or not wrist:
            continue
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        lo = Vector(tuple(min(point[axis] for point in corners) for axis in range(3)))
        hi = Vector(tuple(max(point[axis] for point in corners) for axis in range(3)))
        fraction = grip_height.get((slug, object_name), 0.5)
        x_fraction = grip_x.get((slug, object_name), 0.5)
        grip = Vector(
            (
                lo.x + (hi.x - lo.x) * x_fraction,
                (lo.y + hi.y) * 0.5,
                lo.z + (hi.z - lo.z) * fraction,
            )
        )
        if slug == "persephone-lumi" and object_name == "HeroAttachment_WeaponHeld":
            local_lo = Vector(
                tuple(
                    min(corner[axis] for corner in obj.bound_box) for axis in range(3)
                )
            )
            local_hi = Vector(
                tuple(
                    max(corner[axis] for corner in obj.bound_box) for axis in range(3)
                )
            )
            local_size = local_hi - local_lo
            long_axis = max(range(3), key=lambda axis: local_size[axis])
            grip_local = (local_lo + local_hi) * 0.5
            grip_local[long_axis] = local_lo[long_axis] + local_size[long_axis] * 0.18
            grip = obj.matrix_world @ grip_local
        wrist_world = (
            socket.matrix_world.translation.copy()
            if socket
            else armature.matrix_world @ wrist.tail
        )
        world = obj.matrix_world.copy()
        if slug == "kaze":
            local_lo = Vector(
                tuple(
                    min(corner[axis] for corner in obj.bound_box) for axis in range(3)
                )
            )
            local_hi = Vector(
                tuple(
                    max(corner[axis] for corner in obj.bound_box) for axis in range(3)
                )
            )
            grip_local = (local_lo + local_hi) * 0.5
            grip_local.x = local_lo.x + (local_hi.x - local_lo.x) * x_fraction
            grip_local.z = local_lo.z + (local_hi.z - local_lo.z) * 0.57
            current_direction = (world.to_3x3() @ Vector((1, 0, 0))).normalized()
            target_direction = (
                armature.matrix_world.to_3x3() @ (wrist.head - wrist.tail)
            ).normalized()
            rotation_delta = current_direction.rotation_difference(target_direction)
            world = Matrix.LocRotScale(
                world.translation,
                rotation_delta @ world.to_quaternion(),
                world.to_scale(),
            )
            grip = world @ grip_local
        world.translation += wrist_world - grip
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        obj.vertex_groups.clear()
        obj["attachment_role"] = (
            "throwable-weapon"
            if slug == "damian" and "Speaker" in object_name
            else "held-weapon"
        )
        parent_target = socket or armature
        if socket:
            socket["held_visible_in_idle"] = True
        combat_pivot = None
        if slug == "wukong-mico" and object_name == "HeroAttachment_Staff" and socket:
            # A grip-centred pivot keeps the hand locked while placing the long
            # axis in the horizontal attack plane. Without it the authored wrist
            # basis sends most of the swing upward and into camera depth.
            combat_pivot = bpy.data.objects.new("WukongStaff_CombatPivot", None)
            parent_target = combat_pivot
            bpy.context.scene.collection.objects.link(parent_target)
            parent_target["attachment_pivot_role"] = "melee-swing"
            parent_target.parent = socket
            parent_target.location = (0, 0, 0)
            # Establish the pivot basis before preserving the staff's world
            # matrix. Rotating it afterwards swings the whole staff away from
            # the hand by roughly one metre.
            parent_target.rotation_euler = (math.radians(-22), 0, 0)
            bpy.context.view_layer.update()
        obj.parent = parent_target
        obj.parent_type = "OBJECT" if socket else "BONE"
        obj.parent_bone = "" if socket else wrist.name
        obj.matrix_world = world
        obj["grip_height"] = fraction
        obj["grip_x"] = x_fraction
        bpy.context.view_layer.update()
        marker = bpy.data.objects.new(f"Grip.Primary.{object_name}", None)
        bpy.context.scene.collection.objects.link(marker)
        socket_marker = slug in {"kaze", "persephone-lumi"} and socket
        marker.parent = socket if socket_marker else (combat_pivot or obj)
        marker["grip_role"] = "primary"
        if combat_pivot or socket_marker:
            marker.location = (0, 0, 0)
        else:
            marker.matrix_world = Matrix.Translation(wrist_world)


def animations(armature, archetype):
    armature.animation_data_create()
    p = rig_parts(armature)
    hover = 0.10 if archetype in {"fairy", "mage"} else 0.035
    idle_grip = {}
    if archetype == "assassin":
        # Kaze's source bind pose leaves the fan wrist behind her shoulder.
        # Pose the whole arm chain in a relaxed guard so the fan reads as held.
        idle_grip = {
            "la": ((-42, 34, -74),),
            "lf": ((-104, 0, 0),),
            "lw": ((48, -26, -42),),
            "ra": ((-42, -34, 74),),
            "rf": ((-104, 0, 0),),
            "rw": ((48, 26, 42),),
        }
    elif archetype == "controller":
        idle_grip = {
            "ra": ((-124, 38, 68),),
            "rf": ((-24, 0, 0),),
            "rw": ((58, 34, 52),),
        }
    action(
        armature,
        p,
        "Idle",
        60,
        [
            (1, {"root": ((0, 0, -2), (0, 0, 0)), "spine": ((2, 0, -2),), **idle_grip}),
            (
                30,
                {
                    "root": ((0, 0, 2), (0, 0, hover)),
                    "spine": ((-2, 0, 2),),
                    "wing_l": ((0, 12, 0),),
                    "wing_r": ((0, -12, 0),),
                    **idle_grip,
                },
            ),
            (
                60,
                {"root": ((0, 0, -2), (0, 0, 0)), "spine": ((2, 0, -2),), **idle_grip},
            ),
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
                        # Roll the palm through the horizontal contact plane so
                        # the long end sweeps toward the aim cone, not skyward.
                        "lw": ((25, 20, 32),),
                    },
                ),
                (
                    13,
                    {
                        "hips": ((28, -18, 0),),
                        "spine": ((36, -34, -16),),
                        "la": ((-122, 36, -58),),
                        "lf": ((-24, 0, 0),),
                        "lw": ((35, -30, -48),),
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
        "wukong-mico": (("mic_geo", "HeroAttachment_Staff", "held-weapon"),),
        "kaze": (("menu_geo", "HeroAttachment_FanLeft", "held-weapon"),),
        "damian": (
            ("speaker_geo", "HeroAttachment_Speaker", "throwable-weapon"),
            ("mic_geo", "HeroAttachment_Microphone", "held-weapon"),
        ),
        "persephone-lumi": (("weapon2", "HeroAttachment_WeaponHeld", "held-weapon"),),
    }
    redundant_weapon_patterns = {
        "fairy-mina": ("waterball",),
        "kaze": ("blades01", "blades02"),
        "wukong-mico": ("cloud_geo",),
        "damian": ("lobby_speaker",),
        "persephone-lumi": ("weapon1", "hide_ingame"),
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
    if slug == "kaze":
        left_fan = bpy.data.objects.get("HeroAttachment_FanLeft")
        if left_fan:
            right_fan = left_fan.copy()
            right_fan.data = left_fan.data.copy()
            right_fan.name = "HeroAttachment_FanRight"
            right_fan["attachment_role"] = "held-weapon"
            bpy.context.scene.collection.objects.link(right_fan)
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
        left_elbow = add("L_Elbow", la.tail, (-height * 0.38, 0, height * 0.57), la)
        add("L_Wrist", left_elbow.tail, (-height * 0.48, 0, height * 0.50), left_elbow)
        ra = add(
            "R_Shoulder",
            (0, 0, height * 0.67),
            (height * 0.24, 0, height * 0.66),
            chest,
        )
        right_elbow = add("R_Elbow", ra.tail, (height * 0.38, 0, height * 0.57), ra)
        add("R_Wrist", right_elbow.tail, (height * 0.48, 0, height * 0.50), right_elbow)
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
    armature["hero_slug"] = slug
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
    # Normalize the character silhouette, never the equipment reach. Including a
    # long staff here would shrink the entire hero until the weapon became short
    # again, undoing the gameplay-range authoring above.
    body_meshes = [
        obj
        for obj in root.children_recursive
        if obj.type == "MESH"
        and obj.get("attachment_role")
        not in {
            "held-weapon",
            "throwable-weapon",
            "detached-ammo",
            "companion-cloud",
        }
    ]
    corners = [
        obj.matrix_world @ Vector(c) for obj in body_meshes for c in obj.bound_box
    ]
    lo = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    hi = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    scale = 2.45 / max(0.001, hi.z - lo.z)
    root.scale = (scale,) * 3
    bpy.context.view_layer.update()
    corners = [
        obj.matrix_world @ Vector(c) for obj in body_meshes for c in obj.bound_box
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
