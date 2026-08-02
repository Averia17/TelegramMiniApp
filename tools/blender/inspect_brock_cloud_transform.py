"""Print Brock cloud/rig spaces at scene frame zero for transform diagnosis."""

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
clip = os.environ.get("BROCK_INSPECT_CLIP", "idle")
path = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "scenes"
    / f"{clip}.blend"
)
bpy.ops.wm.open_mainfile(filepath=str(path))
scene = bpy.context.scene
scene.frame_set(0)
armature = bpy.data.objects["brock-zeus-rig"]
locator = bpy.data.objects["Cloud_Locator"]
cloud = bpy.data.objects["Cloud"]
root = armature.pose.bones["Root"]
shoulder = armature.matrix_world @ Vector(armature.pose.bones["R_Shoulder"].tail)
print(
    "ARMATURE",
    tuple(armature.location),
    tuple(armature.scale),
    armature.matrix_world[:],
)
print("ROOT", tuple(root.head), tuple(root.tail), tuple(root.matrix[:]))
print("SHOULDER_WORLD", tuple(shoulder))
print(
    "LOCATOR",
    locator.parent_type,
    locator.parent_bone,
    tuple(locator.location),
    tuple(locator.matrix_world.translation),
    locator.matrix_world[:],
)
print("LOCATOR_PARENT_INV", locator.matrix_parent_inverse[:])
print(
    "CLOUD",
    tuple(cloud.location),
    tuple(cloud.matrix_world.translation),
    cloud.matrix_world[:],
)
print("CLOUD_PARENT_INV", cloud.matrix_parent_inverse[:])
print("CLOUD_BOUNDS_LOCAL", [tuple(corner) for corner in cloud.bound_box])
print(
    "CLOUD_BOUNDS_WORLD",
    [tuple(cloud.matrix_world @ Vector(corner)) for corner in cloud.bound_box],
)
for frame in (0, 3, 6, 8, 10):
    scene.frame_set(frame)
    print(
        "FRAME",
        frame,
        "LOC",
        tuple(locator.location),
        tuple(locator.matrix_world.translation),
        "CLOUD_CENTER",
        tuple(
            sum(
                (cloud.matrix_world @ Vector(corner) for corner in cloud.bound_box),
                Vector(),
            )
            / 8
        ),
    )
