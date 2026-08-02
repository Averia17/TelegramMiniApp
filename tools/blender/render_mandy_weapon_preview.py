"""Render the actual detached Mandy weapon GLB for geometry QA."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector


def main():
    weapon_path = Path("frontend/public/assets/heroes/output_weapons/mandy_weapon.glb")
    output = Path("artifacts/mandy-previews/weapon.png")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.fspath(weapon_path))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.color_type = "MATERIAL"
    scene.world = bpy.data.worlds.new("MandyWeaponPreviewWorld")
    scene.world.color = (0.035, 0.045, 0.07)
    weapon = next(obj for obj in scene.objects if obj.type == "MESH")
    material = bpy.data.materials.new("MandyWeaponPreview")
    material.diffuse_color = (0.85, 0.05, 0.04, 1.0)
    weapon.data.materials.clear()
    weapon.data.materials.append(material)
    points = [weapon.matrix_world @ Vector(corner) for corner in weapon.bound_box]
    low = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    high = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    center = (low + high) * 0.5
    radius = max((high - low).length * 0.5, 1.0)
    camera_data = bpy.data.cameras.new("MandyWeaponCamera")
    camera = bpy.data.objects.new("MandyWeaponCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + Vector((radius * 1.25, -radius * 1.55, radius * 0.65))
    camera.rotation_euler = (
        (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    )
    camera.data.lens = 58
    scene.camera = camera
    output.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = os.fspath(output)
    bpy.ops.render.render(write_still=True)
    print(f"rendered:{output}")


if __name__ == "__main__":
    main()
