"""Fit Wukong finger phalanges around the authored staff grip cylinder."""

import json
import math
import statistics
import sys

import bpy
from mathutils import Vector

blend_path, solved_blend, report_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)

armature = bpy.data.objects["wukong-mico-rig"]
staff = bpy.data.objects["HeroAttachment_Staff"]
grip = bpy.data.objects["Grip.Primary.HeroAttachment_Staff"]
armature.animation_data.action = None
for pose_bone in armature.pose.bones:
    pose_bone.rotation_mode = "XYZ"
    pose_bone.rotation_euler = (0, 0, 0)
    pose_bone.location = (0, 0, 0)
    pose_bone.scale = (1, 1, 1)
bpy.context.view_layer.update()

# The staff mesh is authored along its longest local bounding-box dimension.
local_size = Vector(
    (
        max(corner[0] for corner in staff.bound_box)
        - min(corner[0] for corner in staff.bound_box),
        max(corner[1] for corner in staff.bound_box)
        - min(corner[1] for corner in staff.bound_box),
        max(corner[2] for corner in staff.bound_box)
        - min(corner[2] for corner in staff.bound_box),
    )
)
axis_index = max(range(3), key=lambda index: local_size[index])
local_axis = Vector((axis_index == 0, axis_index == 1, axis_index == 2))
axis = (staff.matrix_world.to_3x3() @ local_axis).normalized()
center = grip.matrix_world.translation.copy()


def radial(point):
    delta = point - center
    return delta - axis * delta.dot(axis)


world_vertices = [staff.matrix_world @ vertex.co for vertex in staff.data.vertices]
near_grip = [
    radial(point).length
    for point in world_vertices
    if abs((point - center).dot(axis)) < 0.11
]
near_grip.sort()
radius = statistics.median(near_grip[: max(4, len(near_grip) // 2)])
radius = max(0.025, min(radius, 0.12))

finger_chains = (
    ("thumb", "L_thumb_01_s", "L_thumb_02_s"),
    ("index", "L_index_01_s", "L_index_02_s"),
    ("middle", "L_middle_01_s", "L_middle_02_s"),
    ("ring", "L_ring_01_s", "L_ring_02_s"),
    ("pinky", "L_pinky_01_s", "L_pinky_02_s"),
)


def world_head(pose_bone):
    return armature.matrix_world @ pose_bone.head


def world_tail(pose_bone):
    return armature.matrix_world @ pose_bone.tail


def score(first, second, target):
    bpy.context.view_layer.update()
    tip = world_tail(second)
    joint = world_tail(first)
    joint_radius = radial(joint).length
    penetration = max(0.0, radius * 0.82 - joint_radius)
    return (
        (tip - target).length
        + abs(joint_radius - radius * 1.08) * 0.42
        + penetration * 4.0
    )


solved = {}
for label, first_name, second_name in finger_chains:
    first = armature.pose.bones[first_name]
    second = armature.pose.bones[second_name]
    base = world_head(first)
    base_radial = radial(base)
    if base_radial.length < 1e-6:
        base_radial = Vector((1, 0, 0))
    far_direction = -base_radial.normalized()
    longitudinal = (base - center).dot(axis)
    target = center + axis * longitudinal + far_direction * radius * 1.03

    values = [0.0] * 6

    def apply_values():
        first.rotation_euler = values[:3]
        second.rotation_euler = values[3:]

    apply_values()
    best = score(first, second, target)
    step = math.radians(50)
    for _ in range(9):
        improved = True
        while improved:
            improved = False
            for index in range(6):
                original = values[index]
                local_best = best
                local_value = original
                for candidate in (original - step, original + step):
                    values[index] = max(
                        math.radians(-135), min(math.radians(135), candidate)
                    )
                    apply_values()
                    candidate_score = score(first, second, target)
                    if candidate_score < local_best:
                        local_best = candidate_score
                        local_value = values[index]
                values[index] = local_value
                apply_values()
                if local_best + 1e-7 < best:
                    best = local_best
                    improved = True
        step *= 0.55

    solved[label] = {
        "bones": [first_name, second_name],
        "degrees": [round(math.degrees(value), 3) for value in values],
        "target": [round(value, 6) for value in target],
        "tip": [round(value, 6) for value in world_tail(second)],
        "error": round((world_tail(second) - target).length, 6),
    }

bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=solved_blend)
with open(report_path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "axis": list(axis),
            "center": list(center),
            "radius": radius,
            "fingers": solved,
        },
        handle,
        indent=2,
    )
print("SOLVED", solved_blend, report_path)
