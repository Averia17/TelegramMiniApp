"""Build Brock Zeus' master .blend from the supplied source FBX.

The FBX is geometry-only, so this script creates the measured 15-bone
semantic rig and the companion-cloud hierarchy explicitly.  It is safe to
rerun: the scene is rebuilt in a fresh Blender session and the output master
is replaced only after the scene has been assembled successfully.

Run from the repository root with Blender 5.2:
  blender --background --python tools/blender/bootstrap_brock_zeus_master.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
HERO_DIR = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus"
SOURCE = HERO_DIR / "source" / "brock_zeus_t-pose.fbx"
TEXTURE = HERO_DIR / "textures" / "brock_zeus_tex.png"
MASTER = HERO_DIR / "brock-zeus.blend"
REPORT = ROOT / "artifacts" / "brock-zeus-master-bootstrap.json"

ROOT_LOCATION = (-0.3127, 0.1409, -0.0301)
ROOT_SCALE = (0.3447, 0.3447, 0.3447)
# The FBX mesh keeps its authored pivot at the character root.  The previous
# bootstrap copied an offset from a legacy rig and cancelled ROOT_LOCATION,
# leaving the bones at world zero while the body/feet stayed around X=-0.313.
# Keep the new armature on the same root transform as the source mesh.
RIG_LOCATION = (0.0, 0.0, 0.0)

BONES = (
    ("Root", None, (0.0, 0.0, 0.0), (0.0, 0.0, 1.279396)),
    ("Hips", "Root", (0.0, 0.0, 1.279396), (0.0, 0.0, 2.2745)),
    ("Spine", "Hips", (0.0, 0.0, 2.2745), (0.0, 0.0, 4.1225)),
    ("Chest", "Spine", (0.0, 0.0, 4.1225), (0.0, 0.0, 5.1176)),
    ("Head", "Chest", (0.0, 0.0, 5.1176), (0.0, 0.0, 6.6102)),
    ("L_Shoulder", "Chest", (0.0, 0.0, 4.7622), (-1.7059, 0.0, 4.6911)),
    ("L_Elbow", "L_Shoulder", (-1.7059, 0.0, 4.6911), (-2.7009, 0.0, 4.0514)),
    ("L_Wrist", "L_Elbow", (-2.7009, 0.0, 4.0514), (-3.4117, 0.0, 3.5539)),
    ("R_Shoulder", "Chest", (0.0, 0.0, 4.7622), (1.7059, 0.0, 4.6911)),
    ("R_Elbow", "R_Shoulder", (1.7059, 0.0, 4.6911), (2.7009, 0.0, 4.0514)),
    ("R_Wrist", "R_Elbow", (2.7009, 0.0, 4.0514), (3.4117, 0.0, 3.5539)),
    ("L_UpperLeg", "Hips", (-0.6397, 0.0, 1.2794), (-0.7108, 0.0, -1.0662)),
    ("L_LowerLeg", "L_UpperLeg", (-0.7108, 0.0, -1.0662), (-0.7108, 0.0, -3.0563)),
    ("R_UpperLeg", "Hips", (0.6397, 0.0, 1.2794), (0.7108, 0.0, -1.0662)),
    ("R_LowerLeg", "R_UpperLeg", (0.7108, 0.0, -1.0662), (0.7108, 0.0, -3.0563)),
)


def create_rig(root):
    armature_data = bpy.data.armatures.new("brock-zeus-rig")
    armature = bpy.data.objects.new("brock-zeus-rig", armature_data)
    root.users_collection[0].objects.link(armature)
    armature.parent = root
    armature.location = RIG_LOCATION
    armature.rotation_mode = "XYZ"
    armature_data.display_type = "BBONE"
    armature_data.axes_position = 0

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = {}
    for name, parent_name, head, tail in BONES:
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.use_deform = True
        edit_bones[name] = bone
    for name, parent_name, _, _ in BONES:
        if parent_name:
            edit_bones[name].parent = edit_bones[parent_name]
            edit_bones[name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    armature_data.pose_position = "POSE"
    armature["source_rig_contract"] = "measured_from_brock_zeus_t-pose.fbx"
    armature["semantic_roles"] = json.dumps(
        {
            "root": "Root",
            "spine": "Spine",
            "chest": "Chest",
            "head": "Head",
            "hand_l": "L_Wrist",
            "forearm_l": "L_Elbow",
            "hand_r": "R_Wrist",
            "forearm_r": "R_Elbow",
            "foot_l": "L_LowerLeg",
            "foot_r": "R_LowerLeg",
            "cloud_socket": "Root",
        },
        ensure_ascii=False,
    )
    return armature


def make_bone_socket(name, armature, bone_name):
    socket = bpy.data.objects.new(name, None)
    socket.empty_display_type = "PLAIN_AXES"
    socket.empty_display_size = 0.2
    armature.users_collection[0].objects.link(socket)
    socket.parent = armature
    socket.parent_type = "BONE"
    socket.parent_bone = bone_name
    socket.matrix_parent_inverse = Matrix.Identity(4)
    socket["attachment_role"] = "weapon-socket"
    return socket


def prepare_cloud(cloud, armature):
    cloud.name = "Cloud"
    local_center = sum((Vector(corner) for corner in cloud.bound_box), Vector()) / 8.0
    for vertex in cloud.data.vertices:
        vertex.co -= local_center
    local_extent = max(float(value) for value in cloud.dimensions)
    cloud.scale = (0.64 / max(local_extent, 1e-6),) * 3
    locator = bpy.data.objects.new("Cloud_Locator", None)
    locator.empty_display_type = "PLAIN_AXES"
    locator.empty_display_size = 0.35
    armature.users_collection[0].objects.link(locator)
    locator.parent = armature
    locator.parent_type = "BONE"
    locator.parent_bone = "Root"
    locator.matrix_parent_inverse = Matrix.Identity(4)
    cloud.parent = locator
    cloud.parent_type = "OBJECT"
    cloud.matrix_parent_inverse = Matrix.Identity(4)
    cloud.location = (0.0, 0.0, 0.0)
    cloud.rotation_mode = "XYZ"
    cloud.rotation_euler = (0.0, 0.0, 0.0)
    cloud["attachment_role"] = "companion-cloud"
    locator["attachment_role"] = "cloud-locator"
    return locator


def prepare_mesh(mesh, armature):
    mesh.name = "armor_GEO:PIV.001"
    mesh.parent = armature
    mesh.parent_type = "OBJECT"
    # Preserve the FBX mesh's authored world placement while the armature
    # object becomes its owner.  Clearing this inverse shifts the complete
    # body by the rig-object offset and breaks the hip/leg contact seam.
    mesh.matrix_parent_inverse = armature.matrix_basis.inverted()
    modifier = mesh.modifiers.new("BrockZeus_Armature", "ARMATURE")
    modifier.object = armature
    mesh["source_geometry"] = os.fspath(SOURCE.relative_to(ROOT))
    mesh["binding_contract"] = (
        "semantic armature binding is authored in author_brock_zeus_animation_scenes.py"
    )


def build():
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.fspath(SOURCE), use_image_search=True)
    if TEXTURE.exists():
        for image in bpy.data.images:
            if image.name.casefold() == "brock_zeus_tex.png":
                image.filepath = os.fspath(TEXTURE)
                image.reload()
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if {obj.name.casefold() for obj in meshes} != {
        "armor_geo:piv.001",
        "cloud_geo:piv.001",
    }:
        raise RuntimeError(f"Unexpected FBX meshes: {[obj.name for obj in meshes]}")
    armor = next(obj for obj in meshes if obj.name.casefold().startswith("armor"))
    cloud = next(obj for obj in meshes if obj.name.casefold().startswith("cloud"))

    root = bpy.data.objects.new("brock-zeus-root", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.25
    bpy.context.scene.collection.objects.link(root)
    root.location = ROOT_LOCATION
    root.scale = ROOT_SCALE
    root["hero_slug"] = "brock-zeus"
    root["source_of_truth"] = os.fspath(SOURCE.relative_to(ROOT))
    root["master_contract"] = "source FBX + measured semantic rig + companion cloud"

    for obj in (armor, cloud):
        obj.parent = root
        obj.matrix_parent_inverse = Matrix.Identity(4)

    armature = create_rig(root)
    prepare_mesh(armor, armature)
    prepare_cloud(cloud, armature)
    make_bone_socket("Socket.Weapon.L", armature, "L_Wrist")
    make_bone_socket("Socket.Weapon.R", armature, "R_Wrist")

    scene = bpy.context.scene
    scene.name = "brock-zeus_master"
    scene.render.fps = 30
    scene.frame_start = 0
    scene.frame_end = 80
    scene["hero_slug"] = "brock-zeus"
    scene["source_of_truth"] = os.fspath(SOURCE.relative_to(ROOT))
    scene["authoring_status"] = "MASTER_BOOTSTRAPPED_FROM_SOURCE"

    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(
            {
                "hero": "brock-zeus",
                "source": os.fspath(SOURCE.relative_to(ROOT)),
                "master": os.fspath(MASTER.relative_to(ROOT)),
                "armature": armature.name,
                "bones": [name for name, _, _, _ in BONES],
                "meshes": [armor.name, cloud.name],
                "cloud_locator": "Cloud_Locator",
                "weapon_sockets": ["Socket.Weapon.L", "Socket.Weapon.R"],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "hero": "brock-zeus",
                "master": os.fspath(MASTER),
                "report": os.fspath(REPORT),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    build()
