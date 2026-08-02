"""Measure Mandy's hand, grip marker, and staff sections for QA."""

from __future__ import annotations

import bpy
from mathutils import Vector


def world_points(obj):
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


def center(points):
    return sum(points, Vector()) / len(points)


def main():
    armature = bpy.data.objects["MandyRig"]
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    wrist = armature.pose.bones["L_wrist_s_047"]
    print("WRIST_HEAD", tuple(round(v, 4) for v in armature.matrix_world @ wrist.head))
    print("WRIST_TAIL", tuple(round(v, 4) for v in armature.matrix_world @ wrist.tail))
    for name in (
        "MandyStaff_SourcePivot",
        "Grip.Primary.MandyStaff_Attachment",
        "MandyStaff_Attachment",
    ):
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        points = (
            world_points(obj) if obj.type == "MESH" else [obj.matrix_world.translation]
        )
        print(
            name,
            "type",
            obj.type,
            "parent",
            obj.parent.name if obj.parent else None,
            "center",
            tuple(round(v, 4) for v in center(points)),
        )
        print(
            "  matrix_translation",
            tuple(round(v, 4) for v in obj.matrix_world.translation),
            "scale",
            tuple(round(v, 4) for v in obj.scale),
            "dims",
            tuple(round(v, 4) for v in obj.dimensions),
        )
        if obj.type == "MESH":
            axis = (obj.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
            pivot_point = bpy.data.objects[
                "MandyStaff_SourcePivot"
            ].matrix_world.translation
            print(
                "  long_axis",
                tuple(round(v, 4) for v in axis),
                "pivot_to_center",
                round((center(points) - pivot_point).dot(axis), 4),
            )
            print("  materials", [slot.name for slot in obj.material_slots])
            for index, material in enumerate(obj.data.materials):
                points = []
                for polygon in obj.data.polygons:
                    if polygon.material_index == index:
                        points.extend(
                            obj.matrix_world @ obj.data.vertices[vertex_index].co
                            for vertex_index in polygon.vertices
                        )
                if points:
                    print(
                        "  material_slot",
                        index,
                        material.name if material else None,
                        "axis_bounds",
                        round(min((p - pivot_point).dot(axis) for p in points), 4),
                        round(max((p - pivot_point).dot(axis) for p in points), 4),
                        "center",
                        tuple(round(v, 4) for v in center(points)),
                    )
    for name in (
        "L_index_01_s_050",
        "L_middle_01_s_048",
        "L_ring_01_s_054",
        "L_pinky_01_s_056",
        "L_thumb_01_s_052",
    ):
        bone = armature.pose.bones[name]
        print(
            "FINGER",
            name,
            "head",
            tuple(round(v, 4) for v in armature.matrix_world @ bone.head),
            "tail",
            tuple(round(v, 4) for v in armature.matrix_world @ bone.tail),
        )


if __name__ == "__main__":
    main()
