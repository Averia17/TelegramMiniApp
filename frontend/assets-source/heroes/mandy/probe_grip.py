"""Read-only geometry and finger-rig probe for Mandy's staff hand."""

import json
import sys

import bpy
from mathutils import Vector

blend_path, output_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
armature = bpy.data.objects["MandyRig"]
staff = bpy.data.objects["MandyStaff_Attachment"]
armature.animation_data.action = bpy.data.actions["Idle"]
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()

names = (
    "L_wrist_s_047",
    "L_thumb_01_s_052",
    "L_thumb_02_s_053",
    "L_index_01_s_050",
    "L_index_02_s_051",
    "L_middle_01_s_048",
    "L_middle_02_s_049",
    "L_ring_01_s_054",
    "L_ring_02_s_055",
    "L_pinky_01_s_056",
    "L_pinky_02_s_057",
)
report = {
    "staff": {
        "matrix_world": [list(row) for row in staff.matrix_world],
        "bounds": [
            list(staff.matrix_world @ Vector(corner)) for corner in staff.bound_box
        ],
    },
    "bones": {
        name: {
            "head": list(armature.matrix_world @ armature.pose.bones[name].head),
            "tail": list(armature.matrix_world @ armature.pose.bones[name].tail),
        }
        for name in names
    },
    "weighted_meshes": [],
}
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
origin = staff.matrix_world.translation
samples = []
for vertex in staff.data.vertices:
    point = staff.matrix_world @ vertex.co
    offset = point - origin
    longitudinal = offset.dot(axis)
    radial = (offset - axis * longitudinal).length
    samples.append((longitudinal, radial))
minimum_t = min(item[0] for item in samples)
maximum_t = max(item[0] for item in samples)
sections = []
for index in range(32):
    start = minimum_t + (maximum_t - minimum_t) * index / 32
    end = minimum_t + (maximum_t - minimum_t) * (index + 1) / 32
    radii = sorted(
        radius for longitudinal, radius in samples if start <= longitudinal < end
    )
    if radii:
        sections.append(
            {
                "t": (start + end) * 0.5,
                "r25": radii[len(radii) // 4],
                "median": radii[len(radii) // 2],
                "max": radii[-1],
            }
        )
report["staff"]["axis"] = list(axis)
report["staff"]["sections"] = sections
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    groups = {}
    for name in names:
        group = obj.vertex_groups.get(name)
        if not group:
            continue
        groups[name] = sum(
            1
            for vertex in obj.data.vertices
            if any(
                assignment.group == group.index and assignment.weight > 0.01
                for assignment in vertex.groups
            )
        )
    if groups:
        report["weighted_meshes"].append(
            {"name": obj.name, "vertices": len(obj.data.vertices), "groups": groups}
        )

with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2)
print("WROTE", output_path)
