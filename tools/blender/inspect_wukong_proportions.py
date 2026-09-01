"""Compare Wukong proportions in the canonical blend and exported runtime GLB."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(os.environ.get("DIAG_ROOT", os.fspath(Path(__file__).resolve().parents[2])))
SOURCE = (
    ROOT / "frontend" / "assets-source" / "heroes" / "wukong-mico" / "wukong-mico.blend"
)
RUNTIME = (
    ROOT
    / "frontend"
    / "public"
    / "assets"
    / "heroes"
    / "output_heroes"
    / "wukong-mico_base.glb"
)


def rounded(values):
    return [round(float(value), 5) for value in values]


def world_bounds(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    finally:
        evaluated.to_mesh_clear()
    if not points:
        return None
    minimum = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    return {
        "min": rounded(minimum),
        "max": rounded(maximum),
        "dimensions": rounded(maximum - minimum),
        "center": rounded((minimum + maximum) / 2),
    }


def snapshot(label, frame):
    scene = bpy.context.scene
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    meshes = {}
    for obj in scene.objects:
        if obj.type == "MESH":
            bounds = world_bounds(obj, depsgraph)
            if bounds:
                bounds["object_scale"] = rounded(obj.scale)
                bounds["object_location"] = rounded(obj.location)
                meshes[obj.name] = bounds
    armatures = {}
    for armature in (obj for obj in scene.objects if obj.type == "ARMATURE"):
        armatures[armature.name] = {
            "object_scale": rounded(armature.scale),
            "bones": {
                bone.name: {
                    "scale": rounded(bone.scale),
                    "location": rounded(bone.location),
                    "rotation": rounded(bone.rotation_euler),
                }
                for bone in armature.pose.bones
            },
        }
    return {"label": label, "frame": frame, "meshes": meshes, "armatures": armatures}


def activate_idle():
    scene = bpy.context.scene
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError("Wukong scene has no armature")
    actions = [
        action
        for action in bpy.data.actions
        if action.name.casefold().split(".")[0] == "idle"
    ]
    if len(actions) != 1:
        raise RuntimeError(
            f"Expected one idle action, got {[action.name for action in actions]}"
        )
    armature.animation_data_create()
    armature.animation_data.action = actions[0]
    start, end = (int(round(value)) for value in actions[0].frame_range)
    return start, end


def inspect_source():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE))
    start, end = activate_idle()
    frames = sorted({start, (start + end) // 2, end})
    return [snapshot("source", frame) for frame in frames]


def inspect_runtime():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.fspath(RUNTIME))
    start, end = activate_idle()
    frames = sorted({start, (start + end) // 2, end})
    return [snapshot("runtime", frame) for frame in frames]


def main():
    report = {"source": inspect_source(), "runtime": inspect_runtime()}
    output = ROOT / "output" / "blender" / "wukong-proportion-diagnostics.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({"output": os.fspath(output)}))


if __name__ == "__main__":
    main()
