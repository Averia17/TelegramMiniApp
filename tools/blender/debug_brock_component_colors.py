"""Export a temporary Brock frame with connected mesh islands color-coded."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / "frontend/assets-source/heroes/brock-zeus/scenes/idle.blend"
OUT = ROOT / "artifacts/brock-component-colors.glb"


def components(mesh):
    adjacency = [set() for _ in mesh.data.vertices]
    for polygon in mesh.data.polygons:
        for index, vertex in enumerate(polygon.vertices):
            adjacency[vertex].add(polygon.vertices[index - 1])
            adjacency[vertex].add(polygon.vertices[(index + 1) % len(polygon.vertices)])
    seen = set()
    result = []
    for start in range(len(adjacency)):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        component = []
        while stack:
            vertex = stack.pop()
            component.append(vertex)
            for neighbor in adjacency[vertex]:
                if neighbor not in seen:
                    seen.add(neighbor)
                    stack.append(neighbor)
        result.append(component)
    return result


bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE))
scene = bpy.context.scene
scene.frame_set(0)
mesh = bpy.data.objects["armor_GEO:PIV.001"]
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = mesh.evaluated_get(depsgraph)
evaluated_mesh = bpy.data.meshes.new_from_object(evaluated, depsgraph=depsgraph)
debug_object = bpy.data.objects.new("BrockDebug_Evaluated", evaluated_mesh)
debug_object.matrix_world = mesh.matrix_world.copy()
mesh.users_collection[0].objects.link(debug_object)
mesh.hide_render = True
mesh.hide_viewport = True
mesh = debug_object
component_list = components(mesh)
component_by_vertex = {
    vertex: index
    for index, component in enumerate(component_list)
    for vertex in component
}

palette = [
    (0.95, 0.15, 0.15, 1.0),
    (0.15, 0.9, 0.25, 1.0),
    (0.15, 0.45, 1.0, 1.0),
    (1.0, 0.8, 0.05, 1.0),
    (0.9, 0.1, 0.85, 1.0),
]
debug_materials = []
for index, color in enumerate(palette):
    material = bpy.data.materials.new(f"BrockDebug_{index}")
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = 0.55
    debug_materials.append(material)

for material in debug_materials:
    mesh.data.materials.append(material)

right_arm = {
    263,
    265,
    267,
    268,
    269,
    271,
    272,
    273,
    278,
    279,
    280,
    281,
    282,
    283,
    284,
    312,
    313,
}
leg_band = {
    index
    for index, component in enumerate(component_list)
    if (
        sum(
            (mesh.matrix_world @ mesh.data.vertices[vertex].co for vertex in component),
            Vector(),
        )
        / len(component)
    ).z
    < 0.38
}
for polygon in mesh.data.polygons:
    component_index = component_by_vertex[polygon.vertices[0]]
    if component_index == 266:
        slot = 0
    elif component_index in right_arm:
        slot = 1 + (component_index % 3)
    elif component_index in leg_band:
        slot = 3
    else:
        slot = 4
    polygon.material_index = len(mesh.data.materials) - len(debug_materials) + slot

for obj in bpy.context.selected_objects:
    obj.select_set(False)
mesh.select_set(True)
bpy.context.view_layer.objects.active = mesh
for obj in bpy.context.scene.objects:
    obj.hide_render = obj.name not in {mesh.name, "brock-zeus-rig"}

bpy.ops.export_scene.gltf(
    filepath=os.fspath(OUT),
    export_format="GLB",
    use_selection=True,
    export_animations=False,
    export_apply=True,
)
print(OUT)
