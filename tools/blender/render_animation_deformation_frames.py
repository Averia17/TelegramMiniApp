"""Render fixed close-up checkpoints for authored hero scenes."""

from __future__ import annotations

import json
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "artifacts" / "hero-browser-qa" / "deformation-render"
HEROES = (
    "brock-zeus",
    "damian",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
)
CLIPS = (
    "idle",
    "run",
    "attack",
    "super",
    "aim",
    "aim-super",
    "hit",
    "death",
    "spawn",
    "victory",
    "gadget",
)


def mesh_points(scene):
    """Return bounds of the evaluated skinned meshes, not bind-pose bounds."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        points.extend(
            evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box
        )
    return points


def render_scene(hero: str, clip: str):
    path = SOURCE / hero / "scenes" / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
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
    points = []
    for frame in range(int(scene.frame_start), int(scene.frame_end) + 1):
        scene.frame_set(frame)
        points.extend(mesh_points(scene))
    lo = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    hi = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (lo + hi) * 0.5
    camera_data = bpy.data.cameras.new(f"DeformationCamera_{hero}_{clip}")
    camera = bpy.data.objects.new(f"DeformationCamera_{hero}_{clip}", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = max(hi.x - lo.x, hi.z - lo.z) * 1.18
    camera.location = center + Vector((0, -6, 0))
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    out_dir = OUTPUT / hero
    out_dir.mkdir(parents=True, exist_ok=True)
    frames = sorted(
        {
            int(scene.frame_start),
            int((scene.frame_start + scene.frame_end) / 2),
            int(scene.frame_end),
        }
    )
    for frame in frames:
        scene.frame_set(frame)
        destination = out_dir / f"{clip}-frame-{frame:03d}.png"
        scene.render.filepath = os.fspath(destination)
        bpy.ops.render.render(write_still=True)
    return {"hero": hero, "clip": clip, "frames": frames}


requested_hero = os.environ.get("HERO_FILTER")
requested_clip = os.environ.get("CLIP_FILTER")
render_heroes = [
    hero for hero in HEROES if not requested_hero or hero == requested_hero
]
render_clips = [clip for clip in CLIPS if not requested_clip or clip == requested_clip]
report = [render_scene(hero, clip) for hero in render_heroes for clip in render_clips]
output = ROOT / "artifacts" / "hero-browser-qa" / "deformation-render.json"
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    json.dumps(
        {
            "scenes": len(report),
            "frames": sum(len(item["frames"]) for item in report),
            "output": str(output),
        },
        ensure_ascii=False,
    )
)
