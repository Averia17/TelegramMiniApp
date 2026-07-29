"""Inspect Kaze's hand rig and connected fan geometry."""

import json
import sys

import bpy
from mathutils import Vector

blend_path, output_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)

armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
weapon = next(
    obj
    for obj in bpy.context.scene.objects
    if obj.type == "MESH" and obj.name.startswith("HeroAttachment_FansHeld")
)

mesh = weapon.data
adjacency = [set() for _ in mesh.vertices]
for edge in mesh.edges:
    a, b = edge.vertices
    adjacency[a].add(b)
    adjacency[b].add(a)

components = []
unseen = set(range(len(mesh.vertices)))
while unseen:
    seed = unseen.pop()
    stack = [seed]
    component = [seed]
    while stack:
        vertex = stack.pop()
        neighbours = adjacency[vertex] & unseen
        unseen.difference_update(neighbours)
        stack.extend(neighbours)
        component.extend(neighbours)
    components.append(component)

component_data = []
for indices in sorted(components, key=len, reverse=True):
    points = [weapon.matrix_world @ mesh.vertices[index].co for index in indices]
    lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    component_data.append(
        {
            "vertices": len(indices),
            "center": list((lo + hi) * 0.5),
            "size": list(hi - lo),
        }
    )

bone_names = [
    name
    for name in armature.pose.bones.keys()
    if any(
        token in name.casefold()
        for token in ("wrist", "hand", "forearm", "elbow", "finger", "thumb")
    )
]
bones = {}
for name in bone_names:
    bone = armature.pose.bones[name]
    bones[name] = {
        "head": list(armature.matrix_world @ bone.head),
        "tail": list(armature.matrix_world @ bone.tail),
        "parent": bone.parent.name if bone.parent else None,
    }

payload = {
    "armature": armature.name,
    "weapon": weapon.name,
    "weapon_parent": weapon.parent.name if weapon.parent else None,
    "vertices": len(mesh.vertices),
    "polygons": len(mesh.polygons),
    "components": component_data,
    "bones": bones,
    "actions": [action.name for action in bpy.data.actions],
}
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
print(json.dumps(payload, ensure_ascii=False))
