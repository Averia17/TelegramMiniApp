"""Fit Mandy's left finger chains around the existing staff handle."""

import json
import math
import statistics
import sys

import bpy
from mathutils import Vector

blend_path, solved_path, report_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
armature = bpy.data.objects["MandyRig"]
staff = bpy.data.objects["MandyStaff_Attachment"]
grip = bpy.data.objects["Grip.Primary.MandyStaff_Attachment"]
armature.animation_data.action = bpy.data.actions["Idle"]
bpy.context.scene.frame_set(1)

chains = (
    ("thumb", "L_thumb_01_s_052", "L_thumb_02_s_053"),
    ("index", "L_index_01_s_050", "L_index_02_s_051"),
    ("middle", "L_middle_01_s_048", "L_middle_02_s_049"),
    ("ring", "L_ring_01_s_054", "L_ring_02_s_055"),
    ("pinky", "L_pinky_01_s_056", "L_pinky_02_s_057"),
)
for _, first_name, second_name in chains:
    for name in (first_name, second_name):
        bone = armature.pose.bones[name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()

local_size = Vector(
    tuple(
        max(corner[index] for corner in staff.bound_box)
        - min(corner[index] for corner in staff.bound_box)
        for index in range(3)
    )
)
axis_index = max(range(3), key=lambda index: local_size[index])
local_axis = Vector((axis_index == 0, axis_index == 1, axis_index == 2))
axis = (staff.matrix_world.to_3x3() @ local_axis).normalized()
center = grip.matrix_world.translation.copy()


def radial(point):
    offset = point - center
    return offset - axis * offset.dot(axis)


near = sorted(
    radial(staff.matrix_world @ vertex.co).length
    for vertex in staff.data.vertices
    if abs((staff.matrix_world @ vertex.co - center).dot(axis)) < 0.10
)
radius = statistics.median(near[: max(6, len(near) // 2)])
radius = max(0.02, min(radius, 0.11))


def point(bone, tail=False):
    value = bone.tail if tail else bone.head
    return armature.matrix_world @ value


solved = {}
for label, first_name, second_name in chains:
    first = armature.pose.bones[first_name]
    second = armature.pose.bones[second_name]
    root = point(first)
    root_radial = radial(root)
    if root_radial.length < 1e-6:
        root_radial = Vector((1, 0, 0))
    target = (
        center
        + axis * (root - center).dot(axis)
        - root_radial.normalized() * radius * 1.02
    )
    values = [0.0] * 6

    def apply():
        first.rotation_euler = values[:3]
        second.rotation_euler = values[3:]

    def objective():
        bpy.context.view_layer.update()
        tip = point(second, True)
        joint = point(first, True)
        joint_radius = radial(joint).length
        return (
            (tip - target).length
            + abs(joint_radius - radius * 1.08) * 0.4
            + max(0.0, radius * 0.8 - joint_radius) * 4.0
        )

    apply()
    best = objective()
    step = math.radians(50)
    for _ in range(10):
        changed = True
        while changed:
            changed = False
            for index in range(6):
                original = values[index]
                selected = original
                selected_score = best
                for candidate in (original - step, original + step):
                    values[index] = max(
                        math.radians(-140), min(math.radians(140), candidate)
                    )
                    apply()
                    candidate_score = objective()
                    if candidate_score < selected_score:
                        selected, selected_score = values[index], candidate_score
                values[index] = selected
                apply()
                if selected_score + 1e-7 < best:
                    best = selected_score
                    changed = True
        step *= 0.55
    solved[label] = {
        "bones": [first_name, second_name],
        "degrees": [round(math.degrees(value), 3) for value in values],
        "error": round((point(second, True) - target).length, 6),
    }

bpy.ops.wm.save_as_mainfile(filepath=solved_path)
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
print("SOLVED", solved_path)
