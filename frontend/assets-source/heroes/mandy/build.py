import math
import os

import bpy
from mathutils import Euler, Matrix, Vector

BLEND_PATH = r"C:\Users\User\PycharmProjects\TelegramMiniApp\frontend\assets-source\heroes\mandy\mandy.blend"
GLB_PATH = r"C:\Users\User\PycharmProjects\TelegramMiniApp\frontend\public\assets\heroes\mandy\mandy.glb"
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
        bone.rotation_euler = Euler(rotation, "XYZ")
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
        for bone_name, channels in poses.items():
            key_bone(armature, bone_name, frame, **channels)
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
        if obj.type == "MESH" and (
            "weapon_GEO" in obj.name
            or any(name.startswith("MandyStaff") for name in material_names)
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


def staff_material(name, color, metallic=0.1, roughness=0.42):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.metallic = metallic
    material.roughness = roughness
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled:
        principled.inputs["Base Color"].default_value = (*color, 1)
        principled.inputs["Metallic"].default_value = metallic
        principled.inputs["Roughness"].default_value = roughness
    return material


def create_staff(armature):
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("MandyStaff"):
            bpy.data.objects.remove(obj, do_unlink=True)

    pink = staff_material(
        "MandyStaffPink", (0.82, 0.075, 0.32), metallic=0.15, roughness=0.32
    )
    gold = staff_material(
        "MandyStaffGold", (1.0, 0.55, 0.06), metallic=0.62, roughness=0.24
    )
    grip = staff_material(
        "MandyStaffGrip", (0.16, 0.055, 0.22), metallic=0.05, roughness=0.7
    )

    wrist = armature.pose.bones["R_wrist_s_064"]
    wrist_world = armature.matrix_world @ wrist.matrix.translation
    pivot = bpy.data.objects.new("MandyStaff_Attachment", None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot["attachment_role"] = "melee-weapon"
    pivot.parent = armature
    pivot.parent_type = "BONE"
    pivot.parent_bone = wrist.name
    # Preserve a clean world-space upright grip at rest. Bone parenting then
    # carries this offset through every wrist pose without animating a second,
    # competing weapon bone.
    pivot.matrix_world = Matrix.Translation(wrist_world)

    # The imported rig is authored in centimetres and MandyRoot is normalized
    # by roughly 0.01 during export, so weapon primitives use authoring units.
    unit = 1.2
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=14, radius=0.055 * unit, depth=1.35 * unit
    )
    shaft = bpy.context.object
    shaft.name = "MandyStaff_Shaft"
    shaft.data.materials.append(pink)
    shaft.parent = pivot
    shaft.location = (0, 0, 0.45 * unit)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=14, radius=0.075 * unit, depth=0.30 * unit
    )
    handle = bpy.context.object
    handle.name = "MandyStaff_Grip"
    handle.data.materials.append(grip)
    handle.parent = pivot
    handle.location = (0, 0, -0.18 * unit)

    for suffix, offset in (("Top", 1.18 * unit), ("Bottom", -0.38 * unit)):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=14, ring_count=8, radius=0.095 * unit
        )
        cap = bpy.context.object
        cap.name = f"MandyStaff_{suffix}Cap"
        cap.scale.z = 0.55
        cap.data.materials.append(gold)
        cap.parent = pivot
        cap.location = (0, 0, offset)


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
                        right_arm: rot(y=6, z=10),
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
                        right_arm: rot(y=5, z=9),
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
                        right_arm: rot(y=6, z=10),
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
                        right_arm: rot(x=-12, z=16),
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
                        right_arm: rot(x=-20, z=16),
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
                        right_arm: rot(x=-12, z=16),
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
        26,
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
                10,
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
                13,
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
                19,
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
            (26, aim_pose),
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
    )


root, armature = prepare_scene()
build_animations(armature)
export(root)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
print(f"Mandy exported to {GLB_PATH}")
