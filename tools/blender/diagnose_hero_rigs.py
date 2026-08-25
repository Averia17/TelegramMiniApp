"""Inspect source and runtime rig bindings for heroes with exploded idle poses."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
RUNTIME = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_heroes"
HEROES = ("mandy", "needle", "brock-zeus", "kaze")


def vec(v):
    return [round(float(x), 5) for x in v]


def describe_scene(label: str):
    scene = bpy.context.scene
    armatures = [obj for obj in scene.objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    result = {"label": label, "armatures": [], "meshes": []}
    for arm in armatures:
        result["armatures"].append(
            {
                "name": arm.name,
                "parent": arm.parent.name if arm.parent else None,
                "location": vec(arm.location),
                "rotation": vec(arm.rotation_euler),
                "scale": vec(arm.scale),
                "bones": [bone.name for bone in arm.data.bones],
                "pose_bones": [bone.name for bone in arm.pose.bones],
            }
        )
    for obj in meshes:
        arm_mods = []
        for mod in obj.modifiers:
            if mod.type == "ARMATURE":
                arm_mods.append(
                    {
                        "name": mod.name,
                        "object": mod.object.name if mod.object else None,
                        "use_deform_preserve_volume": bool(
                            getattr(mod, "use_deform_preserve_volume", False)
                        ),
                    }
                )
        result["meshes"].append(
            {
                "name": obj.name,
                "parent": obj.parent.name if obj.parent else None,
                "parent_type": obj.parent_type,
                "parent_bone": obj.parent_bone if obj.parent_type == "BONE" else None,
                "location": vec(obj.location),
                "world_location": vec(obj.matrix_world.translation),
                "rotation": vec(obj.rotation_euler),
                "scale": vec(obj.scale),
                "vertex_groups": [group.name for group in obj.vertex_groups],
                "armature_modifiers": arm_mods,
            }
        )
    return result


def source_report(hero: str):
    path = (
        SOURCE / hero / "scenes" / "idle.blend"
        if hero == "brock-zeus"
        else SOURCE / hero / f"{hero}.blend"
    )
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = (
        armature.animation_data.action if armature and armature.animation_data else None
    )
    frames = (
        [
            int(action.frame_range[0]),
            int((action.frame_range[0] + action.frame_range[1]) / 2),
            int(action.frame_range[1]),
        ]
        if action
        else [scene.frame_start]
    )
    samples = {}
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        samples[str(frame)] = {
            obj.name: vec(obj.matrix_world.translation)
            for obj in scene.objects
            if obj.type == "MESH"
        }
    report = describe_scene(f"source:{hero}")
    report["action_range"] = list(action.frame_range) if action else None
    report["mesh_samples"] = samples
    if len(frames) >= 2:
        start = samples[str(frames[0])]
        end = samples[str(frames[-1])]
        deltas = sorted(
            (
                (
                    sum((end[name][i] - start[name][i]) ** 2 for i in range(3)) ** 0.5,
                    name,
                )
                for name in start
            ),
            reverse=True,
        )
        report["largest_mesh_deltas"] = [
            [round(delta, 5), name] for delta, name in deltas[:20]
        ]
    return report


def runtime_report(hero: str):
    path = RUNTIME / f"{hero}_base.glb"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.fspath(path))
    report = describe_scene(f"runtime:{hero}")
    report["animations"] = [action.name for action in bpy.data.actions]
    return report


def main():
    reports = []
    for hero in HEROES:
        reports.append(source_report(hero))
        reports.append(runtime_report(hero))
    output = ROOT / "output" / "blender" / "hero-rig-diagnostics.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(reports, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(os.fspath(output))


if __name__ == "__main__":
    main()
