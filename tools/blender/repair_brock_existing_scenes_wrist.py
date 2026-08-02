"""Repair generated Brock scenes in place after reassigning hand islands."""

from __future__ import annotations

import math
import os
import sys
from pathlib import Path

import bpy

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]
sys.path.insert(0, os.fspath(TOOLS))
import author_brock_zeus_animation_scenes as author

SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "brock-zeus" / "scenes"
FRAME_ENDS = author.FRAME_ENDS


def source_centroid(mesh, component):
    return sum(
        (mesh.matrix_world @ mesh.data.vertices[index].co for index in component),
        author.Vector(),
    ) / max(1, len(component))


def repair_scene(clip):
    path = SCENES / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = bpy.data.objects["brock-zeus-rig"]
    mesh = bpy.data.objects["armor_GEO:PIV.001"]
    components = author.mesh_components(mesh)
    wrist_group = mesh.vertex_groups["R_Wrist"]
    for component in components:
        centroid = source_centroid(mesh, component)
        if (
            len(component) in {32, 83, 34, 51}
            and 0 < centroid.x < 0.5
            and centroid.z < 1.05
        ):
            for group in mesh.vertex_groups:
                group.remove(component)
            wrist_group.add(component, 1.0, "REPLACE")
    components, selected = author.right_arm_components(mesh)
    action = armature.animation_data.action
    wrist = armature.pose.bones["R_Wrist"]
    repaired = 0
    for _ in range(2):
        failures = []
        for frame in range(FRAME_ENDS[clip] + 1):
            scene.frame_set(frame)
            if author.right_arm_gap(mesh, components, selected) <= 0.05:
                continue
            base = wrist.rotation_euler.x
            coarse = []
            for offset in range(-120, 121, 30):
                wrist.rotation_euler.x = base + math.radians(offset)
                coarse.append(
                    (author.right_arm_gap(mesh, components, selected), offset)
                )
            _, best_offset = min(coarse)
            refined = []
            for offset in range(best_offset - 30, best_offset + 31, 10):
                wrist.rotation_euler.x = base + math.radians(offset)
                refined.append(
                    (author.right_arm_gap(mesh, components, selected), offset)
                )
            _, best_offset = min(refined)
            wrist.rotation_euler.x = base + math.radians(best_offset)
            wrist.keyframe_insert("rotation_euler", index=0, frame=frame)
            failures.append(frame)
            repaired += 1
        if not failures:
            break
    author.smooth_action(action)
    scene.frame_set(0)
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print({"clip": clip, "repairs": repaired})


for clip in FRAME_ENDS:
    repair_scene(clip)
