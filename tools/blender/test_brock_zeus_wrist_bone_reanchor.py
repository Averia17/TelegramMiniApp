"""Test moving hand bone pivots onto the authored cuff seams in memory."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/zeus_base.blend"


def nearest(obj_a, obj_b):
    result = None
    for a_index, a in enumerate(obj_a.data.vertices):
        for b_index, b in enumerate(obj_b.data.vertices):
            delta = a.co - b.co
            distance = delta.length
            if result is None or distance < result[0]:
                result = (distance, a_index, b_index, a.co.copy(), b.co.copy())
    return result


def vector(value):
    return [round(float(component), 6) for component in value]


def world_points(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def surface_distance(cuff, hand, depsgraph):
    cuff_points = world_points(cuff, depsgraph)
    hand_points = world_points(hand, depsgraph)
    return min((a - b).length for a in cuff_points for b in hand_points)


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    rig = bpy.data.objects["BrockZeus_Rig"]
    seams = {}
    for side, cuff_name, hand_name, bone_name in (
        ("right", "ZeusPart_R_Elbow", "ZeusPart_R_Hand", "R_Hand"),
        ("left", "ZeusPart_L_Elbow", "ZeusPart_L_Hand", "L_Hand"),
    ):
        result = nearest(bpy.data.objects[cuff_name], bpy.data.objects[hand_name])
        seams[side] = {
            "distance": result[0],
            "cuff_vertex": result[1],
            "hand_vertex": result[2],
            "cuff_point": vector(result[3]),
            "hand_point": vector(result[4]),
            "seam": (result[3] + result[4]) * 0.5,
            "bone_head_before": rig.data.bones[bone_name].head_local.copy(),
        }

    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for side, elbow_name, _, bone_name in (
        ("right", "R_Elbow", "", "R_Hand"),
        ("left", "L_Elbow", "", "L_Hand"),
    ):
        elbow = rig.data.edit_bones[elbow_name]
        bone = rig.data.edit_bones[bone_name]
        seam = seams[side]["seam"]
        delta = seam - bone.head
        elbow.tail = seam
        bone.head = seam
        bone.tail += delta
        bone.use_connect = False
        seams[side]["delta"] = vector(delta)
        seams[side]["bone_head_after"] = bone.head.copy()
    bpy.ops.object.mode_set(mode="POSE")
    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    distances = {}
    for action_name, end in (("idle", 120), ("Attack", 30), ("super", 54), ("Gadget", 30), ("Victory", 90)):
        action = bpy.data.actions.get(action_name)
        if action is None:
            continue
        rig.animation_data_clear()
        rig.animation_data_create()
        rig.animation_data.action = action
        values = {"right": [], "left": []}
        for frame in range(1, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            values["right"].append(surface_distance(bpy.data.objects["ZeusPart_R_Elbow"], bpy.data.objects["ZeusPart_R_Hand"], depsgraph))
            values["left"].append(surface_distance(bpy.data.objects["ZeusPart_L_Elbow"], bpy.data.objects["ZeusPart_L_Hand"], depsgraph))
        distances[action_name] = {
            side: {"min": min(values[side]), "max": max(values[side])}
            for side in values
        }
    rig.animation_data.action = bpy.data.actions["idle"]
    scene.frame_set(1)
    bpy.context.view_layer.update()
    camera = bpy.data.objects.get("Diagnostic_Camera")
    if camera:
        camera.location = (5.0, -6.0, 3.1)
        target = Vector((1.7, 0.2, 2.5))
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = 70
        camera.data.dof.use_dof = False
        scene.camera = camera
        scene.render.resolution_x = 800
        scene.render.resolution_y = 800
        scene.render.resolution_percentage = 100
        scene.render.filepath = os.fspath(ROOT / "output/blender/brock-zeus-wrist-reanchor-test.png")
        scene.render.image_settings.file_format = "PNG"
        bpy.ops.render.render(write_still=True)
    seams["pose_after_idle"] = {
        side: vector(rig.pose.bones[bone_name].matrix.translation)
        for side, bone_name in (("right", "R_Hand"), ("left", "L_Hand"))
    }
    seams["distances_after_reanchor"] = distances
    print(json.dumps(seams, indent=2, default=vector))


if __name__ == "__main__":
    main()
