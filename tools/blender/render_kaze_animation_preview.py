"""Render selected Kaze focused-scene frames for silhouette review."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]


def main():
    scene_path, clip, frame_text = sys.argv[sys.argv.index("--") + 1 :]
    frames = [int(value) for value in frame_text.split(",")]
    bpy.ops.wm.open_mainfile(filepath=scene_path)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "WORLD"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("KazePreviewWorld")
    scene.world.color = (0.03, 0.04, 0.06)

    meshes = [
        obj for obj in scene.objects if obj.type == "MESH" and not obj.hide_render
    ]
    points = [
        obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box
    ]
    low = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    high = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    center = (low + high) * 0.5
    camera_data = bpy.data.cameras.new("KazePreviewCamera")
    camera = bpy.data.objects.new("KazePreviewCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max((high - low).z * 1.12, 2.2)
    camera.location = center + Vector((0, -8, 0.15))
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )

    output = ROOT / "output" / "kaze-animation-preview" / clip
    output.mkdir(parents=True, exist_ok=True)
    for frame in frames:
        scene.frame_set(frame)
        scene.render.filepath = os.fspath(output / f"frame-{frame:03d}.png")
        bpy.ops.render.render(write_still=True)
    print(f"RENDERED {clip}: {len(frames)} frames to {output}")


if __name__ == "__main__":
    main()
