"""Probe natural front-facing poses for Mandy's free right arm."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "mandy.blend"
OUT = Path(os.environ.get("MANDY_RIGHT_ARM_PROBE_DIR", "C:/artifacts/mandy-right-arm-probe"))


def load_author():
    path = ROOT / "tools" / "blender" / "author_mandy_animation_scenes.py"
    spec = importlib.util.spec_from_file_location("mandy_author", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def configure_camera(scene):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 500
    scene.render.resolution_y = 500
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.curvature_ridge_factor = 1.5
    scene.display.shading.curvature_valley_factor = 1.5
    scene.display.shading.color_type = "MATERIAL"
    scene.world.color = (0.035, 0.045, 0.07)
    points = []
    for obj in scene.objects:
        if obj.type == "MESH" and not obj.hide_render:
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    center = (low + high) * 0.5
    radius = max((high - low).length * 0.5, 1.0)
    camera_data = bpy.data.cameras.new("MandyRightArmProbeCamera")
    camera = bpy.data.objects.new("MandyRightArmProbeCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((radius * 1.65, -radius * 2.35, radius * 0.72))
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    scene.camera = camera


def main():
    author = load_author()
    candidates = {
        "source": ((0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        "front_mild_inward": ((0.0, -18.0, -28.0), (18.0, 0.0, 0.0), (0.0, 180.0, 0.0)),
        "front_mid_inward": ((0.0, -24.0, -38.0), (24.0, 0.0, 0.0), (0.0, 180.0, 0.0)),
        "front_medium_inward": ((0.0, -32.0, -50.0), (32.0, 0.0, 0.0), (0.0, 180.0, 0.0)),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (upper_delta, elbow_delta, hand_delta) in candidates.items():
        bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE))
        scene = bpy.context.scene
        scene.frame_set(20)
        armature = bpy.data.objects["MandyRig"]
        baseline = author.capture_baseline(armature)
        author.apply_semantic_pose(
            armature,
            baseline,
            author.idle_base(),
        )
        author.canonicalize_staff(armature)
        if armature.animation_data:
            armature.animation_data.action = None
        pose = author.p(upper_r=upper_delta, elbow_r=elbow_delta, hand_r=hand_delta)
        print(name, "requested_delta", pose["upper_r"])
        author.apply_semantic_pose(armature, baseline, pose)
        scene.frame_set(1)
        bpy.context.view_layer.update()
        configure_camera(scene)
        wrist = armature.pose.bones[author.BONES["hand_r"]]
        hips = armature.pose.bones[author.BONES["hips"]]
        root = armature.pose.bones[author.BONES["root"]]
        wrist_world = armature.matrix_world @ wrist.tail
        hips_world = armature.matrix_world @ hips.head
        print(
            name,
            "wrist",
            tuple(round(value, 4) for value in wrist_world),
            "upper_rot",
            tuple(round(value, 3) for value in armature.pose.bones[author.BONES["upper_r"]].rotation_euler),
            "hand_rot",
            tuple(round(value, 3) for value in wrist.rotation_euler),
            "forward",
            round((wrist_world - hips_world).dot(root.z_axis.normalized()), 4),
        )
        scene.render.filepath = os.fspath(OUT / f"{name}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
