"""Fit Persephone Lumi's right finger chains around the existing handle."""

import json
import math
import statistics
import sys

import bpy
from mathutils import Vector

blend_path, solved_path, report_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
armature = bpy.data.objects["persephone-lumi-rig"]
staff = bpy.data.objects["HeroAttachment_WeaponHeld"]
grip = bpy.data.objects["Grip.Primary.HeroAttachment_WeaponHeld"]
armature.animation_data.action = bpy.data.actions["Idle"]
bpy.context.scene.frame_set(1)

chains = (
    ("thumb", "R_thumb_01_s", "R_thumb_02_s"),
    ("index", "R_index_01_s", "R_index_02_s"),
    ("middle", "R_middle_01_s", "R_middle_02_s"),
    ("ring", "R_ring_01_s", "R_ring_02_s"),
    ("pinky", "R_pinky_01_s", "R_pinky_02_s"),
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
