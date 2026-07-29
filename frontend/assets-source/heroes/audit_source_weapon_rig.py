"""Inspect weapon skinning in one source FBX.

Usage:
  blender --background --python audit_source_weapon_rig.py -- <fbx>
"""

import sys

import bpy
from mathutils import Vector

source = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=source, use_anim=False)

for obj in bpy.context.scene.objects:
    lowered = obj.name.casefold()
    if obj.type == "ARMATURE":
        weapon_bones = [
            bone.name
            for bone in obj.data.bones
            if any(
                token in bone.name.casefold()
                for token in ("weapon", "mic", "speaker", "wrist")
            )
        ]
        print("SOURCE_ARMATURE", obj.name, weapon_bones)
    if obj.type == "MESH" and any(
        token in lowered for token in ("weapon", "mic_geo", "speaker", "menu_geo")
    ):
        print(
            "SOURCE_WEAPON",
            obj.name,
            "parent",
            obj.parent.name if obj.parent else "-",
            "modifiers",
            [
                (
                    modifier.type,
                    modifier.object.name if getattr(modifier, "object", None) else "-",
                )
                for modifier in obj.modifiers
            ],
            "groups",
            [group.name for group in obj.vertex_groups],
        )
        adjacency = [set() for _ in obj.data.vertices]
        for edge in obj.data.edges:
            first, second = edge.vertices
            adjacency[first].add(second)
            adjacency[second].add(first)
        unseen = set(range(len(obj.data.vertices)))
        components = []
        while unseen:
            pending = [unseen.pop()]
            component = []
            while pending:
                vertex = pending.pop()
                component.append(vertex)
                neighbours = adjacency[vertex] & unseen
                unseen.difference_update(neighbours)
                pending.extend(neighbours)
            points = [
                obj.matrix_world @ obj.data.vertices[index].co for index in component
            ]
            lo = Vector(
                tuple(min(point[axis] for point in points) for axis in range(3))
            )
            hi = Vector(
                tuple(max(point[axis] for point in points) for axis in range(3))
            )
            components.append((len(component), lo, hi))
        for count, lo, hi in sorted(components, reverse=True)[:8]:
            print(
                "SOURCE_COMPONENT",
                obj.name,
                count,
                tuple(round(value, 4) for value in lo),
                tuple(round(value, 4) for value in hi),
            )
