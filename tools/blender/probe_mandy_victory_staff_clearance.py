"""Probe Victory staff poses around the right-hand clearance bottleneck."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path

import bpy
from mathutils import Vector, Euler

ROOT = Path(__file__).resolve().parents[2]
SCENE = ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "scenes" / "victory.blend"
SOURCE = ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "mandy.blend"
OUT = Path("C:/artifacts/mandy-victory-probe")


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main():
    author = load_module("mandy_author", ROOT / "tools/blender/author_mandy_animation_scenes.py")
    validator = load_module("mandy_validator", ROOT / "tools/blender/validate_mandy_animation_scenes.py")
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE))
    source_armature = bpy.data.objects["MandyRig"]
    bpy.context.scene.frame_set(20)
    baseline = author.capture_baseline(source_armature)
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SCENE))
    scene = bpy.context.scene
    scene.frame_set(24)
    armature = bpy.data.objects["MandyRig"]
    staff = bpy.data.objects["MandyStaff_Attachment"]
    marker = bpy.data.objects["Grip.Primary.MandyStaff_Attachment"]
    right = armature.pose.bones[author.BONES["hand_r"]]
    candidates = {
        "current": None,
        "ground": ((-60.0, 0.0, 120.0), (0.0, 0.0, 0.0), (-4.0, 0.0, 0.0)),
        "ground_100": ((-60.0, 0.0, 100.0), (0.0, 0.0, 0.0), (-4.0, 0.0, 0.0)),
        "strike_early": ((-40.0, 0.0, 100.0), (0.0, 0.0, 0.0), (-4.0, 0.0, 0.0)),
        "side_down": ((-20.0, 0.0, 70.0), (35.0, 0.0, 0.0), (-4.0, 0.0, 0.0)),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for name, pose in candidates.items():
        scene.frame_set(24)
        if pose is not None:
            for semantic, values in (
                ("upper_l", pose[0]),
                ("elbow_l", pose[1]),
                ("hand_l", pose[2]),
            ):
                bone = armature.pose.bones[author.BONES[semantic]]
                base = baseline[bone.name]["rotation"]
                bone.rotation_euler = Euler(
                    tuple(base[index] + __import__("math").radians(value) for index, value in enumerate(values)),
                    "XYZ",
                )
        bpy.context.view_layer.update()
        right_start, right_end = validator.bone_segment_world(armature, author.BONES["hand_r"])
        staff_start, staff_end, _radius = validator.staff_segment_and_radius(staff)
        distance = validator.distance_segment_to_mesh(staff, right_start, right_end)
        print(name, "distance", round(distance, 4), "right", tuple(round(v, 4) for v in (armature.matrix_world @ right.tail)))


if __name__ == "__main__":
    main()
