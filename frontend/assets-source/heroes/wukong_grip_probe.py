"""Measure Wukong's palm and staff geometry in evaluated animation poses."""

import json
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

blend_path = sys.argv[sys.argv.index("--") + 1]
output_path = sys.argv[sys.argv.index("--") + 2]
bpy.ops.wm.open_mainfile(filepath=blend_path)

armature = bpy.data.objects["wukong-mico-rig"]
staff = bpy.data.objects["HeroAttachment_Staff"]
finger_names = (
    "L_thumb_01_s",
    "L_index_01_s",
    "L_middle_01_s",
    "L_ring_01_s",
    "L_pinky_01_s",
)


def world_point(pose_bone, endpoint="head"):
    point = pose_bone.head if endpoint == "head" else pose_bone.tail
    return armature.matrix_world @ point


def evaluated_vertices(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def distance_to_staff(point, staff_vertices):
    return min((point - vertex).length for vertex in staff_vertices)


report = {"blend": blend_path, "actions": {}}
for action_name, frame in (("Idle", 1), ("Attack", 12), ("Super", 20)):
    action = bpy.data.actions.get(action_name)
    armature.animation_data.action = action
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    wrist = armature.pose.bones["L_wrist_s"]
    anchors = {
        "wrist_head": world_point(wrist),
        "wrist_tail": world_point(wrist, "tail"),
    }
    for name in finger_names:
        anchors[name] = world_point(armature.pose.bones[name])
    palm_center = sum(anchors.values(), Vector()) / len(anchors)
    staff_vertices = evaluated_vertices(staff)
    report["actions"][action_name] = {
        "frame": frame,
        "palm_center": list(palm_center),
        "anchors": {name: list(point) for name, point in anchors.items()},
        "distance_palm_to_staff": distance_to_staff(palm_center, staff_vertices),
        "distance_fingers_to_staff": {
            name: distance_to_staff(point, staff_vertices)
            for name, point in anchors.items()
            if name.startswith("L_")
        },
    }

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2)
print("WROTE", output_path)
