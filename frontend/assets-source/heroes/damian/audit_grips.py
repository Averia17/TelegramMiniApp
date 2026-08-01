"""Audit Damian's two hand rigs and equipment grip geometry."""

import json
import sys

import bpy
from mathutils import Vector

blend_path, output_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")


def bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return {
        "center": list((lo + hi) * 0.5),
        "size": list(hi - lo),
        "min": list(lo),
        "max": list(hi),
    }


def connected_components(obj):
    adjacency = [set() for _ in obj.data.vertices]
    for edge in obj.data.edges:
        a, b = edge.vertices
        adjacency[a].add(b)
        adjacency[b].add(a)
    unseen = set(range(len(obj.data.vertices)))
    result = []
    while unseen:
        seed = unseen.pop()
        stack = [seed]
        indices = [seed]
        while stack:
            neighbours = adjacency[stack.pop()] & unseen
            unseen.difference_update(neighbours)
            stack.extend(neighbours)
            indices.extend(neighbours)
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in indices]
        lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
        hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
        result.append(
            {
                "vertices": len(indices),
                "center": list((lo + hi) * 0.5),
                "size": list(hi - lo),
            }
        )
    return sorted(result, key=lambda item: item["vertices"], reverse=True)


equipment = {}
for name in ("HeroAttachment_Microphone", "HeroAttachment_Speaker"):
    obj = bpy.data.objects[name]
    equipment[name] = {
        "parent": obj.parent.name if obj.parent else None,
        "bounds": bounds(obj),
        "vertices": len(obj.data.vertices),
        "polygons": len(obj.data.polygons),
        "materials": [
            slot.material.name if slot.material else None for slot in obj.material_slots
        ],
        "components": connected_components(obj),
    }

bones = {}
for bone in armature.pose.bones:
    lowered = bone.name.casefold()
    if any(
        token in lowered
        for token in (
            "wrist",
            "hand",
            "thumb",
            "index",
            "middle",
            "ring",
            "pinky",
            "finger",
        )
    ):
        bones[bone.name] = {
            "head": list(armature.matrix_world @ bone.head),
            "tail": list(armature.matrix_world @ bone.tail),
            "parent": bone.parent.name if bone.parent else None,
        }

payload = {
    "armature": armature.name,
    "equipment": equipment,
    "bones": bones,
    "actions": [action.name for action in bpy.data.actions],
}
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
print(json.dumps(payload, ensure_ascii=False))
