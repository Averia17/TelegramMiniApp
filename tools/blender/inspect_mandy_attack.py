"""Print Mandy's attack-space measurements for animation QA."""

from __future__ import annotations

import bpy
from mathutils import Vector


def world_center(obj):
    points = [obj.matrix_world @ Vector(vertex.co) for vertex in obj.data.vertices]
    return sum(points, Vector()) / len(points) if points else Vector()


def main():
    armature = bpy.data.objects.get("MandyRig")
    if armature is None:
        raise RuntimeError("MandyRig not found")
    print("ARMATURE", armature.name)
    for name in (
        "Root_2_01",
        "hips_s_02",
        "chest_s_033",
        "head_s_035",
        "L_shoulder_s_044",
        "L_elbow_s_045",
        "L_wrist_s_047",
    ):
        bone = armature.pose.bones[name]
        print(
            "BONE",
            name,
            "head",
            tuple(round(value, 3) for value in bone.head),
            "x",
            tuple(round(value, 3) for value in bone.x_axis),
            "y",
            tuple(round(value, 3) for value in bone.y_axis),
            "z",
            tuple(round(value, 3) for value in bone.z_axis),
        )
    for frame in (1, 4, 6, 7, 10, 16):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        wrist = armature.matrix_world @ armature.pose.bones["L_wrist_s_047"].head
        root = armature.pose.bones["Root_2_01"]
        hips = armature.pose.bones["hips_s_02"]
        forward = root.z_axis.normalized()
        print("FRAME", frame, "wrist", tuple(round(value, 3) for value in wrist))
        for obj in bpy.data.objects:
            if obj.type == "MESH" and "Staff" in obj.name:
                center = world_center(obj)
                print(
                    " STAFF",
                    obj.name,
                    "center",
                    tuple(round(value, 3) for value in center),
                    "dim",
                    tuple(round(value, 3) for value in obj.dimensions),
                )
                center = world_center(obj)
                hips_world = armature.matrix_world @ hips.head
                print("  FORWARD_METRIC", round((center - hips_world).dot(forward), 4))


if __name__ == "__main__":
    main()
