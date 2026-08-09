"""Render multi-frame front/side evidence for every Needle animation scene.

The script is read-only with respect to the source .blend files.  It samples
nine evenly-spaced frames per clip, renders each pose from the front and side,
and records all-frame bone metrics for later review.

Usage:
  blender --background --python tools/blender/render_needle_full_visual_qa.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "needle" / "scenes"
OUTPUT = ROOT / "output" / "blender" / "needle-animation-qa"
REPORT = OUTPUT / "metrics.json"
CLIPS = {
    "idle": 80,
    "run": 24,
    "attack": 16,
    "super": 50,
    "aim": 60,
    "aim-super": 60,
    "hit": 12,
    "death": 40,
    "spawn": 45,
    "victory": 60,
    "gadget": 12,
    "aim-gadget": 60,
}
VIEWS = {
    "front": Vector((0.0, -1.0, 0.0)),
    "side": Vector((1.0, 0.0, 0.0)),
}


def sample_frames(end: int) -> list[int]:
    return sorted({round(end * index / 8) for index in range(9)})


def visible_meshes(scene):
    return [
        obj
        for obj in scene.objects
        if obj.type == "MESH"
        and obj.visible_get(view_layer=bpy.context.view_layer)
        and not obj.hide_render
        and not obj.hide_viewport
        and not obj.name.startswith("NeedleQA")
    ]


def foot_meshes(scene):
    return [
        obj
        for obj in visible_meshes(scene)
        if any(token in obj.name.lower() for token in ("foot", "toe", "claw"))
    ]


def reference_ground_z():
    """Use the lowest visible sole point in the authored idle frame 0."""
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENES / "idle.blend"))
    scene = bpy.context.scene
    scene.frame_set(0)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = [
        evaluated.matrix_world @ Vector(corner)
        for obj in foot_meshes(scene)
        for evaluated in (obj.evaluated_get(depsgraph),)
        for corner in evaluated.bound_box
    ]
    if not points:
        raise RuntimeError("Needle QA found no visible foot geometry")
    return min(point.z for point in points)


def evaluated_points(scene, frames):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for frame in frames:
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for obj in visible_meshes(scene):
            evaluated = obj.evaluated_get(depsgraph)
            points.extend(
                evaluated.matrix_world @ Vector(corner)
                for corner in evaluated.bound_box
            )
    if not points:
        raise RuntimeError("Needle QA found no visible meshes")
    return points


def bounds(points):
    low = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    high = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    return low, high


def configure_render(scene, low, high, ground_z):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 360
    scene.render.resolution_y = 360
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.show_specular_highlight = True
    if scene.world is None:
        scene.world = bpy.data.worlds.new("NeedleQAWorld")
    scene.world.color = (0.025, 0.035, 0.055)

    floor_mesh = bpy.data.meshes.new("NeedleQAFloorMesh")
    floor = bpy.data.objects.new("NeedleQAFloor", floor_mesh)
    scene.collection.objects.link(floor)
    extent = max(high.x - low.x, high.y - low.y, 2.0) * 1.4
    floor_z = ground_z - 0.015
    floor_mesh.from_pydata(
        [
            (-extent, -extent, floor_z),
            (extent, -extent, floor_z),
            (extent, extent, floor_z),
            (-extent, extent, floor_z),
        ],
        [],
        [(0, 1, 2, 3)],
    )
    floor_material = bpy.data.materials.new("NeedleQAFloorMaterial")
    floor_material.diffuse_color = (0.12, 0.16, 0.22, 1.0)
    floor.data.materials.append(floor_material)

    camera_data = bpy.data.cameras.new("NeedleQACamera")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("NeedleQACamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, floor_z


def position_camera(camera, direction, low, high):
    center = (low + high) * 0.5
    vertical = max(high.z - low.z, 1.0)
    horizontal = (
        max(high.x - low.x, 1.0) if abs(direction.y) > 0.5 else max(high.y - low.y, 1.0)
    )
    camera.data.ortho_scale = max(vertical * 1.18, horizontal * 1.18)
    distance = max((high - low).length * 2.5, 8.0)
    camera.location = (
        center + direction * distance + Vector((0.0, 0.0, vertical * 0.02))
    )
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )


def pose_metrics(scene, armature, frame, floor_z):
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    root = armature.pose.bones["Root"]
    rotations = {
        name: [
            round(math.degrees(value), 4)
            for value in armature.pose.bones[name].rotation_euler
        ]
        for name in (
            "Hips",
            "Spine",
            "Chest",
            "Head",
            "LeftArm",
            "RightArm",
            "LeftHand",
            "RightHand",
            "LeftLeg",
            "RightLeg",
            "LeftFoot",
            "RightFoot",
        )
    }
    feet = {}
    for name in ("LeftFoot", "RightFoot"):
        bone = armature.pose.bones[name]
        head = armature.matrix_world @ bone.head
        tail = armature.matrix_world @ bone.tail
        feet[name] = {
            "head_z_from_floor": round(head.z - floor_z, 5),
            "tail_z_from_floor": round(tail.z - floor_z, 5),
        }
    return {
        "frame": frame,
        "root": [round(value, 6) for value in root.location],
        "rotations_deg": rotations,
        "feet": feet,
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ground_z = reference_ground_z()
    report = {"hero": "needle", "reference_ground_z": ground_z, "clips": {}}
    for clip, end in CLIPS.items():
        bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENES / f"{clip}.blend"))
        scene = bpy.context.scene
        armature = bpy.data.objects.get("NeedleRig")
        if armature is None:
            raise RuntimeError(f"{clip}: NeedleRig not found")
        samples = sample_frames(end)
        low, high = bounds(evaluated_points(scene, samples))
        camera, floor_z = configure_render(scene, low, high, ground_z)
        clip_output = OUTPUT / clip
        clip_output.mkdir(parents=True, exist_ok=True)
        for view_name, direction in VIEWS.items():
            position_camera(camera, direction, low, high)
            for frame in samples:
                scene.frame_set(frame)
                bpy.context.view_layer.update()
                scene.render.filepath = os.fspath(
                    clip_output / f"{view_name}-frame-{frame:03d}.png"
                )
                bpy.ops.render.render(write_still=True)
        report["clips"][clip] = {
            "frame_end": end,
            "sample_frames": samples,
            "bounds": {
                "low": [round(value, 5) for value in low],
                "high": [round(value, 5) for value in high],
                "floor_z": round(floor_z, 5),
            },
            "frames": [
                pose_metrics(scene, armature, frame, floor_z)
                for frame in range(end + 1)
            ],
        }
        print(f"rendered:{clip}:samples={len(samples)}:views={len(VIEWS)}")
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps({"hero": "needle", "clips": len(CLIPS), "report": os.fspath(REPORT)})
    )


if __name__ == "__main__":
    main()
