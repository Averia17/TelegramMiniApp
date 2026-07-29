import math
import os

import bpy
from mathutils import Euler, Matrix, Vector

BLEND_PATH = r"C:\Users\User\PycharmProjects\TelegramMiniApp\frontend\assets-source\heroes\mandy\mandy.blend"
GLB_PATH = r"C:\Users\User\PycharmProjects\TelegramMiniApp\frontend\public\assets\heroes\mandy\mandy.glb"
SOURCE_FBX_PATH = r"C:\Users\User\PycharmProjects\TelegramMiniApp\frontend\assets-source\heroes\mandy\original\source\Hanbok Mandy.fbx"
FPS = 30


def find_armature():
    return next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")


def reset_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.location = (0, 0, 0)
        bone.rotation_euler = Euler((0, 0, 0), "XYZ")
        bone.scale = (1, 1, 1)


def key_bone(armature, bone_name, frame, rotation=None, location=None, scale=None):
    bone = armature.pose.bones.get(bone_name)
    if not bone:
        return
    if rotation is not None:
        # Keep Euler values on the nearest equivalent branch. Large multi-axis
        # swings otherwise jump through ±180° between adjacent contact keys.
        compatible_rotation = Euler(rotation, "XYZ")
        compatible_rotation.make_compatible(bone.rotation_euler)
        bone.rotation_euler = compatible_rotation
        bone.keyframe_insert("rotation_euler", frame=frame, group=bone_name)
    if location is not None:
        bone.location = location
        bone.keyframe_insert("location", frame=frame, group=bone_name)
    if scale is not None:
        bone.scale = scale
        bone.keyframe_insert("scale", frame=frame, group=bone_name)


def create_action(armature, name, end_frame, keys, cyclic=False):
    reset_pose(armature)
    action = bpy.data.actions.get(name) or bpy.data.actions.new(name)
    action.use_fake_user = True
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = action
    for frame, poses in keys:
        # The source mesh has fully rigged fingers, but its menu pose leaves
        # them spread open.  Keep the weapon hand wrapped around the staff in
        # every action instead of merely parenting the staff beside an open
        # palm.
        grip_pose = {
            "L_middle_01_s_048": rot(x=111.173, y=-16.369, z=50.0),
            "L_middle_02_s_049": rot(x=34.875, y=-1.004, z=100.0),
            "L_index_01_s_050": rot(x=75.016, y=-44.852, z=47.484),
            "L_index_02_s_051": rot(x=90.844, y=-50.0, z=42.458),
            "L_thumb_01_s_052": rot(x=-50.0, y=-53.948, z=-50.23),
            "L_thumb_02_s_053": rot(x=23.44, y=47.845, z=0.23),
            "L_ring_01_s_054": rot(x=82.842, y=29.955, z=-50.419),
            "L_ring_02_s_055": rot(x=78.261, y=47.902, z=-48.525),
            "L_pinky_01_s_056": rot(x=103.121, y=22.73, z=-54.575),
            "L_pinky_02_s_057": rot(x=47.522, y=67.414, z=-58.319),
            "R_middle_01_s_065": rot(x=-58),
            "R_middle_02_s_066": rot(x=-72),
            "R_index_01_s_067": rot(x=-54),
            "R_index_02_s_068": rot(x=-68),
            "R_thumb_01_s_069": rot(x=-32, z=24),
            "R_thumb_02_s_070": rot(x=-42),
            "R_ring_01_s_071": rot(x=-62),
            "R_ring_02_s_072": rot(x=-74),
            "R_pinky_01_s_073": rot(x=-66),
            "R_pinky_02_s_074": rot(x=-76),
        }
        keyed_pose = {**grip_pose, **poses}
        for bone_name, channels in keyed_pose.items():
            keyed_channels = channels
            if (
                name == "Attack"
                and frame not in {1, end_frame}
                and any(
                    token in bone_name.casefold()
                    for token in (
                        "hips",
                        "spine",
                        "chest",
                        "shoulder",
                        "elbow",
                        "wrist",
                    )
                )
                and channels.get("rotation") is not None
            ):
                keyed_channels = {
                    **channels,
                    "rotation": tuple(
                        max(math.radians(-165), min(math.radians(165), value * 1.12))
                        for value in channels["rotation"]
                    ),
                }
            key_bone(armature, bone_name, frame, **keyed_channels)
    action.frame_start = 1
    action.frame_end = end_frame
    # Clamped Bezier handles keep held poses stable without the wild Euler
    # overshoot that made multi-axis arm swings fold through the body.
    curves = list(getattr(action, "fcurves", []))
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
    return action


def pose(**bones):
    return bones


def rot(x=0, y=0, z=0, location=None):
    value = {"rotation": tuple(math.radians(v) for v in (x, y, z))}
    if location is not None:
        value["location"] = location
    return value


def prepare_scene():
    bpy.context.scene.render.fps = FPS
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 60

    for obj in list(bpy.context.scene.objects):
        if obj.name == "Icosphere" or obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    armature = find_armature()
    armature.name = "MandyRig"
    armature.data.name = "MandyRig"

    for obj in list(bpy.context.scene.objects):
        material_names = (
            {slot.material.name for slot in obj.material_slots if slot.material}
            if obj.type == "MESH"
            else set()
        )
        if obj.type == "MESH" and any(
            name.startswith("MandyStaff") for name in material_names
        ):
            bpy.data.objects.remove(obj, do_unlink=True)

    root = bpy.data.objects.get("MandyRoot")
    if root is None:
        root = bpy.data.objects.new("MandyRoot", None)
        bpy.context.scene.collection.objects.link(root)
    root.scale = (1, 1, 1)
    root.location = (0, 0, 0)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent = root

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.name = obj.data.name.replace("_001", "")
        obj.data.name = obj.name
        obj.hide_render = False
        for slot in obj.material_slots:
            material = slot.material
            if not material:
                continue
            material.use_nodes = True
            material.diffuse_color[3] = 1
            material.surface_render_method = "DITHERED"

    create_staff(armature)
    ensure_weapon_socket(armature)

    bpy.context.view_layer.update()
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in root.children_recursive
        if obj.type == "MESH" and not obj.name.startswith("MandyStaff")
        for corner in obj.bound_box
    ]
    minimum = Vector(
        tuple(min(point[index] for point in corners) for index in range(3))
    )
    maximum = Vector(
        tuple(max(point[index] for point in corners) for index in range(3))
    )
    current_height = maximum.z - minimum.z
    scale = 2.45 / max(current_height, 0.0001)
    root.scale = (scale, scale, scale)
    bpy.context.view_layer.update()
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in root.children_recursive
        if obj.type == "MESH" and not obj.name.startswith("MandyStaff")
        for corner in obj.bound_box
    ]
    minimum = Vector(
        tuple(min(point[index] for point in corners) for index in range(3))
    )
    maximum = Vector(
        tuple(max(point[index] for point in corners) for index in range(3))
    )
    root.location.x -= (minimum.x + maximum.x) / 2
    root.location.y -= (minimum.y + maximum.y) / 2
    root.location.z -= minimum.z

    return root, armature


def ensure_weapon_socket(armature):
    wrist_name = "L_wrist_s_047"
    wrist = armature.data.bones.get(wrist_name)
    if not wrist:
        return
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_wrist = armature.data.edit_bones[wrist_name]
    socket = armature.data.edit_bones.get("weapon_socket_r")
    if socket is None:
        socket = armature.data.edit_bones.new("weapon_socket_r")
    socket.parent = edit_wrist
    socket.use_connect = False
    socket.use_deform = False
    socket.head = edit_wrist.tail
    direction = (edit_wrist.tail - edit_wrist.head).normalized()
    socket.tail = socket.head + direction * max(edit_wrist.length * 0.18, 0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


def create_staff(armature):
    # The saved .blend opens on Idle. Return the target rig to its bind pose
    # before calculating the downloaded weapon's rigid bone-parent transform.
    reset_pose(armature)
    bpy.context.view_layer.update()
    for obj in list(bpy.context.scene.objects):
        if (
            obj.name.startswith("MandyStaff")
            or obj.name.startswith("MandyStaff_SourcePivot")
            or obj.name.startswith("Socket.Weapon.R")
            or obj.name.startswith("Grip.Primary.MandyStaff")
            or obj.get("attachment_role") == "held-weapon"
        ):
            bpy.data.objects.remove(obj, do_unlink=True)

    # Import the authored weapon straight from the downloaded Hanbok Mandy FBX.
    # It already has the correct shape, proportions, materials, vertex weights,
    # and bind transform; rebuilding it from primitives loses all of that.
    existing_objects = set(bpy.context.scene.objects)
    bpy.ops.wm.fbx_import(filepath=SOURCE_FBX_PATH, use_anim=False)
    imported_objects = [
        obj for obj in bpy.context.scene.objects if obj not in existing_objects
    ]
    weapon = next(
        obj
        for obj in imported_objects
        if obj.type == "MESH" and obj.name.casefold().startswith("weapon_geo")
    )
    source_armature = next(obj for obj in imported_objects if obj.type == "ARMATURE")
    source_bone = source_armature.pose.bones["R_gunbone_01_s"]
    source_bone_world = source_armature.matrix_world @ source_bone.matrix
    weapon.data.transform(weapon.matrix_world)
    weapon.data.transform(Matrix.Translation(-source_bone_world.translation))
    weapon.matrix_world = Matrix.Identity(4)
    for modifier in list(weapon.modifiers):
        if modifier.type == "ARMATURE":
            weapon.modifiers.remove(modifier)
    weapon.vertex_groups.clear()
    target_parent_bone = armature.pose.bones["L_wrist_s_047"]
    target_grip_world = armature.matrix_world @ target_parent_bone.matrix
    target_grip_world.translation = armature.matrix_world @ target_parent_bone.tail
    pivot = bpy.data.objects.new("MandyStaff_SourcePivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.parent = armature
    pivot.parent_type = "BONE"
    pivot.parent_bone = target_parent_bone.name
    index_root = armature.pose.bones["L_index_01_s_050"]
    pinky_root = armature.pose.bones["L_pinky_01_s_056"]
    desired_axis = (
        armature.matrix_world @ pinky_root.head
        - armature.matrix_world @ index_root.head
    ).normalized()
    grip_matrix = desired_axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
    grip_matrix.translation = target_grip_world.translation
    pivot.matrix_world = grip_matrix
    pivot.scale = (1, 1, 1)
    weapon.parent = pivot
    weapon.parent_type = "OBJECT"
    weapon.matrix_local = Matrix.Identity(4)
    # The source weapon bone origin sits in the decorative sphere. Move the
    # nearby narrow neck to the palm after orienting the shaft across it.
    weapon.location = (0, 0, 1.86)
    weapon["grip_axis_offset_local"] = 1.86
    weapon.name = "MandyStaff_Attachment"
    weapon["attachment_role"] = "held-weapon"
    weapon["grip_bone"] = target_parent_bone.name

    for imported in imported_objects:
        if imported != weapon:
            bpy.data.objects.remove(imported, do_unlink=True)

    # The original mesh is skinned to the source weapon bone. Export a marker
    # under that same bone so runtime grip audits retain an explicit anchor.
    grip_marker = bpy.data.objects.new("Grip.Primary.MandyStaff_Attachment", None)
    bpy.context.scene.collection.objects.link(grip_marker)
    grip_marker["grip_role"] = "primary"
    grip_marker.parent = armature
    grip_marker.parent_type = "BONE"
    grip_marker.parent_bone = target_parent_bone.name
    grip_marker.matrix_parent_inverse = Matrix.Identity(4)
    grip_marker.location = (0, 0, 0)


def build_animations(armature):
    if armature.animation_data:
        armature.animation_data.action = None
    for existing in list(bpy.data.actions):
        bpy.data.actions.remove(existing)

    hips = "hips_s_02"
    root = "Root_2_01"
    spine_low = "spine_lower_s_030"
    spine_mid = "spine_mid_s_031"
    spine = "spine_upper_s_032"
    chest = "chest_s_033"
    head = "head_s_035"
    left_arm = "L_shoulder_s_044"
    left_elbow = "L_elbow_s_045"
    left_wrist = "L_wrist_s_047"
    right_arm = "R_shoulder_s_061"
    right_elbow = "R_elbow_s_062"
    right_wrist = "R_wrist_s_064"
    weapon = "R_gunbone_01_s_075"
    left_leg = "L_upperLeg_s_03"
    left_knee = "L_lowerLeg_s_04"
    right_leg = "R_upperLeg_s_07"
    right_knee = "R_lowerLeg_s_08"

    create_action(
        armature,
        "Idle",
        60,
        [
            (
                1,
                pose(
                    **{
                        hips: rot(z=-1),
                        spine_mid: rot(x=-2),
                        chest: rot(x=2),
                        head: rot(x=-1),
                        left_arm: rot(y=-5, z=-8),
                        right_arm: rot(x=-34, y=8, z=34),
                        right_elbow: rot(x=-48, y=6),
                        right_wrist: rot(x=12, y=-6, z=-8),
                        weapon: rot(x=5),
                    }
                ),
            ),
            (
                30,
                pose(
                    **{
                        hips: rot(z=1),
                        spine_mid: rot(x=2),
                        chest: rot(x=-1),
                        head: rot(x=1),
                        left_arm: rot(y=-4, z=-7),
                        right_arm: rot(x=-32, y=7, z=32),
                        right_elbow: rot(x=-46, y=5),
                        right_wrist: rot(x=11, y=-5, z=-8),
                        weapon: rot(x=-3),
                    }
                ),
            ),
            (
                60,
                pose(
                    **{
                        hips: rot(z=-1),
                        spine_mid: rot(x=-2),
                        chest: rot(x=2),
                        head: rot(x=-1),
                        left_arm: rot(y=-5, z=-8),
                        right_arm: rot(x=-34, y=8, z=34),
                        right_elbow: rot(x=-48, y=6),
                        right_wrist: rot(x=12, y=-6, z=-8),
                        weapon: rot(x=5),
                    }
                ),
            ),
        ],
        cyclic=True,
    )

    create_action(
        armature,
        "Run",
        24,
        [
            (
                1,
                pose(
                    **{
                        root: rot(location=(0, 0, 0)),
                        spine: rot(x=9),
                        left_leg: rot(x=30),
                        right_leg: rot(x=-28),
                        left_knee: rot(x=8),
                        right_knee: rot(x=35),
                        left_arm: rot(x=-20, z=-10),
                        right_arm: rot(x=-38, y=8, z=32),
                        right_elbow: rot(x=-46, y=6),
                        right_wrist: rot(x=12, y=-6, z=-8),
                        weapon: rot(x=8, z=4),
                    }
                ),
            ),
            (
                7,
                pose(
                    **{
                        root: rot(location=(0, 0, 0.12)),
                        spine: rot(x=7),
                        left_leg: rot(x=2),
                        right_leg: rot(x=2),
                        left_knee: rot(x=28),
                        right_knee: rot(x=12),
                    }
                ),
            ),
            (
                13,
                pose(
                    **{
                        root: rot(location=(0, 0, 0)),
                        spine: rot(x=9),
                        left_leg: rot(x=-28),
                        right_leg: rot(x=30),
                        left_knee: rot(x=35),
                        right_knee: rot(x=8),
                        left_arm: rot(x=-10, z=-10),
                        right_arm: rot(x=-42, y=7, z=34),
                        right_elbow: rot(x=-50, y=5),
                        right_wrist: rot(x=11, y=-5, z=-8),
                        weapon: rot(x=8, z=4),
                    }
                ),
            ),
            (
                19,
                pose(
                    **{
                        root: rot(location=(0, 0, 0.12)),
                        spine: rot(x=7),
                        left_leg: rot(x=2),
                        right_leg: rot(x=2),
                        left_knee: rot(x=12),
                        right_knee: rot(x=28),
                    }
                ),
            ),
            (
                24,
                pose(
                    **{
                        root: rot(location=(0, 0, 0)),
                        spine: rot(x=9),
                        left_leg: rot(x=30),
                        right_leg: rot(x=-28),
                        left_knee: rot(x=8),
                        right_knee: rot(x=35),
                        left_arm: rot(x=-20, z=-10),
                        right_arm: rot(x=-38, y=8, z=32),
                        right_elbow: rot(x=-46, y=6),
                        right_wrist: rot(x=12, y=-6, z=-8),
                        weapon: rot(x=8, z=4),
                    }
                ),
            ),
        ],
        cyclic=True,
    )

    aim_pose = pose(
        **{
            hips: rot(y=3),
            spine_low: rot(y=4),
            spine: rot(x=-7, y=10),
            chest: rot(x=-4, y=16),
            left_arm: rot(x=-30, y=-18, z=-35),
            left_elbow: rot(x=-54, y=-10),
            left_wrist: rot(x=10, y=-16),
            right_arm: rot(x=-52, y=20, z=30),
            right_elbow: rot(x=-64, y=8),
            right_wrist: rot(x=18, y=-8, z=-10),
        }
    )
    create_action(armature, "Aim", 30, [(1, aim_pose), (30, aim_pose)], cyclic=True)

    # Full staff swing: the weapon travels from a high rear anticipation,
    # through a sharp cross-body contact, into a broad follow-through.
    create_action(
        armature,
        "Attack",
        30,
        [
            (1, aim_pose),
            (
                4,
                pose(
                    **{
                        hips: rot(x=-4, y=-9, z=-5),
                        spine_low: rot(x=-5, y=-14, z=-6),
                        spine: rot(x=-18, y=-28, z=-13),
                        chest: rot(x=-15, y=-40, z=-12),
                        head: rot(y=20),
                        left_arm: rot(x=-2, y=-30, z=-72),
                        left_elbow: rot(x=-96, y=-16),
                        left_wrist: rot(x=22, y=-24),
                        right_arm: rot(x=-6, y=72, z=92),
                        right_elbow: rot(x=-124, y=28),
                        right_wrist: rot(x=82, y=52, z=58),
                        weapon: rot(x=36, y=18, z=30),
                    }
                ),
            ),
            (
                8,
                pose(
                    **{
                        hips: rot(x=-7, y=-15, z=-8),
                        spine_low: rot(x=-8, y=-22, z=-9),
                        spine: rot(x=-22, y=-36, z=-17),
                        chest: rot(x=-18, y=-52, z=-16),
                        head: rot(y=25),
                        left_arm: rot(x=4, y=-34, z=-82),
                        left_elbow: rot(x=-108, y=-20),
                        left_wrist: rot(x=30, y=-30),
                        right_arm: rot(x=2, y=84, z=108),
                        right_elbow: rot(x=-138, y=34),
                        right_wrist: rot(x=102, y=66, z=76),
                        weapon: rot(x=48, y=26, z=42),
                    }
                ),
            ),
            (
                12,
                pose(
                    **{
                        hips: rot(x=5, y=14, z=7),
                        spine_low: rot(x=6, y=21, z=9),
                        spine: rot(x=9, y=30, z=15),
                        chest: rot(x=8, y=44, z=16),
                        head: rot(y=-18),
                        left_arm: rot(x=-72, y=34, z=38),
                        left_elbow: rot(x=-16, y=12),
                        left_wrist: rot(x=-18, y=20),
                        right_arm: rot(x=-104, y=-68, z=-82),
                        right_elbow: rot(x=-10, y=-22),
                        right_wrist: rot(x=-72, y=-54, z=-82),
                        weapon: rot(x=-56, y=-24, z=-48),
                    }
                ),
            ),
            (
                16,
                pose(
                    **{
                        hips: rot(x=7, y=19, z=10),
                        spine_low: rot(x=8, y=27, z=12),
                        spine: rot(x=12, y=38, z=20),
                        chest: rot(x=10, y=54, z=20),
                        head: rot(y=-22),
                        left_arm: rot(x=-82, y=40, z=46),
                        left_elbow: rot(x=-10, y=18),
                        left_wrist: rot(x=-24, y=28),
                        right_arm: rot(x=-118, y=-78, z=-96),
                        right_elbow: rot(x=-6, y=-28),
                        right_wrist: rot(x=-88, y=-66, z=-102),
                        weapon: rot(x=-72, y=-32, z=-62),
                    }
                ),
            ),
            (
                23,
                pose(
                    **{
                        hips: rot(x=3, y=10, z=4),
                        spine_low: rot(x=3, y=14, z=5),
                        spine: rot(x=5, y=22, z=10),
                        chest: rot(x=4, y=32, z=10),
                        head: rot(y=-14),
                        left_arm: rot(x=-54, y=24, z=18),
                        left_elbow: rot(x=-30),
                        right_arm: rot(x=-78, y=-38, z=-50),
                        right_elbow: rot(x=-28),
                        right_wrist: rot(x=-38, y=-26, z=-44),
                    }
                ),
            ),
            (30, aim_pose),
        ],
    )

    super_aim = pose(
        **{
            hips: rot(x=-10),
            spine_low: rot(x=12),
            spine: rot(x=13),
            chest: rot(x=-8),
            left_arm: rot(x=-62, y=-14, z=-38),
            left_elbow: rot(x=-72),
            right_arm: rot(x=-70, y=14, z=38),
            right_elbow: rot(x=-68),
        }
    )
    create_action(
        armature, "AimSuper", 30, [(1, super_aim), (30, super_aim)], cyclic=True
    )

    create_action(
        armature,
        "Super",
        30,
        [
            (1, super_aim),
            (
                10,
                pose(
                    **{
                        hips: rot(x=-14),
                        spine: rot(x=-32),
                        chest: rot(x=-28),
                        left_arm: rot(x=-125, z=-25),
                        left_elbow: rot(x=-34),
                        right_arm: rot(x=-128, z=25),
                        right_elbow: rot(x=-32),
                        weapon: rot(x=-75),
                    }
                ),
            ),
            (
                17,
                pose(
                    **{
                        hips: rot(x=18),
                        spine: rot(x=42),
                        chest: rot(x=28),
                        left_arm: rot(x=20, z=-18),
                        left_elbow: rot(x=-82),
                        right_arm: rot(x=18, z=18),
                        right_elbow: rot(x=-80),
                        weapon: rot(x=88),
                    }
                ),
            ),
            (
                23,
                pose(
                    **{
                        hips: rot(x=12),
                        spine: rot(x=30),
                        chest: rot(x=18),
                        left_arm: rot(x=8, z=-15),
                        right_arm: rot(x=8, z=15),
                        weapon: rot(x=72),
                    }
                ),
            ),
            (30, aim_pose),
        ],
    )

    create_action(
        armature,
        "Spawn",
        36,
        [
            (
                1,
                pose(
                    **{
                        root: rot(location=(0, 0, -0.25)),
                        hips: rot(x=8),
                        spine: rot(x=12),
                        left_arm: rot(x=-55, z=-42),
                        right_arm: rot(x=-55, z=42),
                        weapon: rot(z=-120),
                    }
                ),
            ),
            (
                10,
                pose(
                    **{
                        root: rot(y=110, location=(0, 0, 0.16)),
                        hips: rot(x=-6),
                        spine: rot(x=-8),
                        left_arm: rot(x=-40, z=-58),
                        right_arm: rot(x=-42, z=58),
                        weapon: rot(z=20),
                    }
                ),
            ),
            (
                20,
                pose(
                    **{
                        root: rot(y=250, location=(0, 0, 0.32)),
                        hips: rot(x=5),
                        spine: rot(x=6),
                        left_arm: rot(x=-58, z=-35),
                        right_arm: rot(x=-58, z=35),
                        weapon: rot(z=160),
                    }
                ),
            ),
            (
                30,
                pose(
                    **{
                        root: rot(y=360, location=(0, 0, 0.08)),
                        hips: rot(x=-2),
                        spine: rot(x=-2),
                        left_arm: rot(x=-24, z=-12),
                        right_arm: rot(x=-28, z=16),
                        weapon: rot(z=360),
                    }
                ),
            ),
            (
                36,
                pose(
                    **{
                        root: rot(y=360, location=(0, 0, 0)),
                        hips: rot(),
                        spine: rot(),
                        left_arm: rot(y=-5, z=-8),
                        right_arm: rot(y=6, z=10),
                        weapon: rot(x=5, z=360),
                    }
                ),
            ),
        ],
    )

    create_action(
        armature,
        "Victory",
        72,
        [
            (
                1,
                pose(
                    **{
                        hips: rot(),
                        spine: rot(),
                        left_arm: rot(z=-12),
                        right_arm: rot(z=14),
                        weapon: rot(),
                    }
                ),
            ),
            (
                18,
                pose(
                    **{
                        hips: rot(x=-8),
                        spine: rot(x=-12),
                        left_arm: rot(x=-78, z=-35),
                        right_arm: rot(x=-82, z=38),
                        weapon: rot(x=-65),
                    }
                ),
            ),
            (
                34,
                pose(
                    **{
                        root: rot(location=(0, 0, 0.24)),
                        hips: rot(x=10),
                        spine: rot(x=18),
                        left_arm: rot(x=-118, z=-20),
                        right_arm: rot(x=-120, z=22),
                        weapon: rot(x=150),
                    }
                ),
            ),
            (
                52,
                pose(
                    **{
                        root: rot(location=(0, 0, 0)),
                        hips: rot(x=-4),
                        spine: rot(x=-8),
                        left_arm: rot(x=-42, z=-18),
                        right_arm: rot(x=-46, z=20),
                        weapon: rot(x=340),
                    }
                ),
            ),
            (
                72,
                pose(
                    **{
                        hips: rot(),
                        spine: rot(),
                        left_arm: rot(x=-30, z=-12),
                        right_arm: rot(x=-34, z=14),
                        weapon: rot(x=360),
                    }
                ),
            ),
        ],
        cyclic=True,
    )

    create_action(
        armature,
        "Defeat",
        60,
        [
            (
                1,
                pose(
                    **{
                        hips: rot(),
                        spine: rot(),
                        head: rot(),
                        left_arm: rot(z=-8),
                        right_arm: rot(z=10),
                    }
                ),
            ),
            (
                30,
                pose(
                    **{
                        hips: rot(x=6),
                        spine_low: rot(x=10),
                        spine: rot(x=18),
                        chest: rot(x=14),
                        head: rot(x=24),
                        left_arm: rot(x=12, z=-5),
                        right_arm: rot(x=20, z=8),
                        right_elbow: rot(x=-12),
                        weapon: rot(x=55, y=18),
                    }
                ),
            ),
            (
                60,
                pose(
                    **{
                        hips: rot(x=7),
                        spine_low: rot(x=11),
                        spine: rot(x=20),
                        chest: rot(x=16),
                        head: rot(x=28),
                        left_arm: rot(x=14, z=-5),
                        right_arm: rot(x=22, z=8),
                        right_elbow: rot(x=-14),
                        weapon: rot(x=60, y=20),
                    }
                ),
            ),
        ],
        cyclic=True,
    )

    armature.animation_data.action = bpy.data.actions["Idle"]


def export(root):
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_morph=True,
        export_yup=True,
        export_apply=False,
        export_extras=True,
    )


root, armature = prepare_scene()
build_animations(armature)
export(root)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print(f"Mandy exported to {GLB_PATH}")
