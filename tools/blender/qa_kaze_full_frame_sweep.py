"""Render and measure every frame of every authored Kaze clip.

This is deliberately a frame sweep, not a keyframe spot check. It produces
small silhouette renders plus per-frame hand/weapon metrics so a pose that
looks acceptable at frame 0 cannot hide a broken in-between interpolation.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCENES = ROOT / "frontend" / "assets-source" / "heroes" / "kaze" / "scenes"
OUTPUT = ROOT / "output" / "kaze-full-frame-qa"
REPORT = ROOT / "artifacts" / "kaze-full-frame-qa.json"
CLIPS = {
    "idle": 70,
    "run": 18,
    "attack": 20,
    "super": 25,
    "aim": 60,
    "aim-super": 60,
    "hit": 10,
    "death": 35,
    "spawn": 40,
    "victory": 50,
    "gadget": 12,
    "aim-gadget": 60,
}
GRIP_LOCAL = (-0.10, 1.70, 1.65)
FAN_NAMES = ("HeroAttachment_FanLeft", "HeroAttachment_FanRight")
MARKER_NAMES = (
    "Grip.Primary.HeroAttachment_FanLeft",
    "Grip.Primary.HeroAttachment_FanRight",
)
WRIST_NAMES = ("L_wrist_s", "R_wrist_s")
DEPTH_CHECK_CLIPS = {"idle", "aim", "aim-super", "gadget", "aim-gadget"}


def world_bounds(obj):
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return Vector(
        tuple(min(point[index] for point in points) for index in range(3))
    ), Vector(tuple(max(point[index] for point in points) for index in range(3)))


def configure_camera(scene):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 240
    scene.render.resolution_y = 240
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("KazeFullSweepWorld")
    scene.world.color = (0.03, 0.04, 0.06)
    meshes = [
        obj for obj in scene.objects if obj.type == "MESH" and not obj.hide_render
    ]
    points = [
        point
        for obj in meshes
        for point in (obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    ]
    low = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    high = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    center = (low + high) * 0.5
    camera_data = bpy.data.cameras.new("KazeFullSweepCamera")
    camera = bpy.data.objects.new("KazeFullSweepCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max((high - low).z * 1.12, 2.2)
    camera.location = center + Vector((0, -8, 0.15))
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )


def measure(armature):
    bpy.context.view_layer.update()
    chest_y = (armature.matrix_world @ armature.pose.bones["chest_s"].head).y
    wrists = [
        armature.matrix_world @ armature.pose.bones[name].head for name in WRIST_NAMES
    ]
    markers = [
        bpy.data.objects[name].matrix_world.translation.copy() for name in MARKER_NAMES
    ]
    fans = [bpy.data.objects[name] for name in FAN_NAMES]
    grip_distances = [
        (fan.matrix_world @ Vector(GRIP_LOCAL) - marker).length
        for fan, marker in zip(fans, markers)
    ]
    fan_centers = [
        tuple((low + high) * 0.5) for low, high in (world_bounds(fan) for fan in fans)
    ]
    return {
        "wrist_world": [tuple(round(value, 5) for value in wrist) for wrist in wrists],
        "marker_world": [
            tuple(round(value, 5) for value in marker) for marker in markers
        ],
        "grip_distance": [round(distance, 6) for distance in grip_distances],
        "wrist_depth_margin": [round(chest_y + 0.23 - wrist.y, 5) for wrist in wrists],
        "fan_center_world": [
            tuple(round(value, 5) for value in center) for center in fan_centers
        ],
    }


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report = {"hero": "kaze", "clips": {}, "status": "PASS"}
    for clip, end in CLIPS.items():
        bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENES / f"{clip}.blend"))
        scene = bpy.context.scene
        armature = bpy.data.objects["kaze-rig"]
        configure_camera(scene)
        clip_output = OUTPUT / clip
        clip_output.mkdir(parents=True, exist_ok=True)
        frames = []
        previous_wrist = None
        for frame in range(end + 1):
            scene.frame_set(frame)
            metrics = measure(armature)
            wrist_jump = None
            if previous_wrist is not None:
                wrist_jump = max(
                    (Vector(current) - Vector(previous)).length
                    for current, previous in zip(metrics["wrist_world"], previous_wrist)
                )
            metrics["wrist_jump"] = None if wrist_jump is None else round(wrist_jump, 5)
            metrics["frame"] = frame
            frames.append(metrics)
            scene.render.filepath = os.fspath(clip_output / f"frame-{frame:03d}.png")
            bpy.ops.render.render(write_still=True)
            previous_wrist = metrics["wrist_world"]
        clip_errors = []
        for item in frames:
            if max(item["grip_distance"]) > 0.01:
                clip_errors.append(
                    {
                        "frame": item["frame"],
                        "kind": "grip_distance",
                        "value": item["grip_distance"],
                    }
                )
            if (clip in DEPTH_CHECK_CLIPS or item["frame"] in {0, end}) and min(
                item["wrist_depth_margin"]
            ) < 0:
                clip_errors.append(
                    {
                        "frame": item["frame"],
                        "kind": "wrist_behind_torso",
                        "value": item["wrist_depth_margin"],
                    }
                )
            if item["wrist_jump"] is not None and item["wrist_jump"] > 0.20:
                clip_errors.append(
                    {
                        "frame": item["frame"],
                        "kind": "wrist_jump",
                        "value": item["wrist_jump"],
                    }
                )
        report["clips"][clip] = {
            "frames": frames,
            "frame_count": len(frames),
            "errors": clip_errors,
            "status": "PASS" if not clip_errors else "FAIL",
        }
        if clip_errors:
            report["status"] = "FAIL"
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "frames": sum(item["frame_count"] for item in report["clips"].values()),
                "report": os.fspath(REPORT),
            }
        )
    )
    if report["status"] != "PASS":
        raise RuntimeError("Kaze full frame sweep found defects")


if __name__ == "__main__":
    main()
