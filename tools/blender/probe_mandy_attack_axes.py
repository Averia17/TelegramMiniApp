"""Probe which real Mandy arm-local axes move the staff toward her front."""

from __future__ import annotations

import bpy
from mathutils import Vector


def center(obj):
    points = [obj.matrix_world @ Vector(vertex.co) for vertex in obj.data.vertices]
    return sum(points, Vector()) / len(points)


def measure(armature, staff):
    wrist = armature.matrix_world @ armature.pose.bones["L_wrist_s_047"].head
    return wrist, center(staff)


def main():
    armature = bpy.data.objects["MandyRig"]
    staff = bpy.data.objects["MandyStaff_Attachment"]
    bpy.context.scene.frame_set(6)
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
    )
    tests = (
        ("upper_l", 0, 60),
        ("upper_l", 0, -60),
        ("upper_l", 1, 60),
        ("upper_l", 1, -60),
        ("upper_l", 2, 60),
        ("upper_l", 2, -60),
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
        )


if __name__ == "__main__":
    main()
