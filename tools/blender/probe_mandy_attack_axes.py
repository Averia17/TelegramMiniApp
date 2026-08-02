"""Probe which real Mandy arm-local axes move the staff toward her front."""

from __future__ import annotations

import os
import sys

import bpy
from mathutils import Vector


def center(obj):
    points = [obj.matrix_world @ Vector(vertex.co) for vertex in obj.data.vertices]
    return sum(points, Vector()) / len(points)


def measure(armature, staff):
    wrist = armature.matrix_world @ armature.pose.bones["L_wrist_s_047"].head
    return wrist, center(staff)


def staff_axis(staff):
    return (staff.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()


def staff_low(staff):
    return min((staff.matrix_world @ vertex.co).z for vertex in staff.data.vertices)


def forward_metric(armature, staff):
    root = armature.pose.bones["Root_2_01"]
    hips = armature.pose.bones["hips_s_02"]
    forward = root.z_axis.normalized()
    hips_world = armature.matrix_world @ hips.head
    return (center(staff) - hips_world).dot(forward)


def main():
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) == 2:
        bpy.ops.wm.open_mainfile(filepath=os.fspath(values[0]))
        frame = int(values[1])
    else:
        frame = 6
    armature = bpy.data.objects["MandyRig"]
    staff = bpy.data.objects["MandyStaff_Attachment"]
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    bones = {
        name: bone.rotation_euler.copy() for name, bone in armature.pose.bones.items()
    }
    print(
        "BASE",
        *(
            tuple(round(value, 3) for value in point)
            for point in measure(armature, staff)
        ),
        "axis",
        tuple(round(value, 3) for value in staff_axis(staff)),
        "low",
        round(staff_low(staff), 3),
        "forward",
        round(forward_metric(armature, staff), 3),
    )
    tests = (
        ("upper_l", 0, 60),
        ("upper_l", 0, -60),
        ("upper_l", 1, 60),
        ("upper_l", 1, -60),
        ("upper_l", 2, 60),
        ("upper_l", 2, -60),
        ("upper_l", 2, 30),
        ("upper_l", 2, -30),
        ("elbow_l", 0, 60),
        ("elbow_l", 0, -60),
        ("elbow_l", 1, 60),
        ("elbow_l", 1, -60),
        ("elbow_l", 2, 60),
        ("elbow_l", 2, -60),
    )
    names = {"upper_l": "L_shoulder_s_044", "elbow_l": "L_elbow_s_045"}
    for semantic, axis, degrees in tests:
        for name, rotation in bones.items():
            armature.pose.bones[name].rotation_euler = rotation
        bone = armature.pose.bones[names[semantic]]
        values = list(bone.rotation_euler)
        values[axis] += __import__("math").radians(degrees)
        bone.rotation_euler = values
        bpy.context.view_layer.update()
        wrist, staff_point = measure(armature, staff)
        print(
            semantic,
            axis,
            degrees,
            "wrist",
            tuple(round(value, 3) for value in wrist),
            "staff",
            tuple(round(value, 3) for value in staff_point),
            "axis",
            tuple(round(value, 3) for value in staff_axis(staff)),
            "low",
            round(staff_low(staff), 3),
            "forward",
            round(forward_metric(armature, staff), 3),
        )


if __name__ == "__main__":
    main()
