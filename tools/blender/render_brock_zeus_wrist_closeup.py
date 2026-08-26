"""Render a close inspection of Brock Zeus's right wrist seam."""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/scenes/zeus_rebuild_master.blend"
OUTPUT = ROOT / "output/blender/brock-zeus-wrist-closeup.png"


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = bpy.data.objects["BrockZeus_Rig"]
    camera = bpy.data.objects["Diagnostic_Camera"]
    scene = bpy.context.scene
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    armature.animation_data_clear()
    armature.animation_data_create()
    for action_name, frame, filename in (
        ("idle", 1, "brock-zeus-wrist-closeup.png"),
        ("Attack", 3, "brock-zeus-wrist-attack-frame-03.png"),
        ("super", 17, "brock-zeus-wrist-super-frame-17.png"),
    ):
        armature.animation_data.action = bpy.data.actions[action_name]
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        camera.location = (5.0, -6.0, 3.1)
        target = Vector((1.7, 0.2, 2.5))
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = 70
        camera.data.dof.use_dof = False
        scene.camera = camera
        scene.render.filepath = os.fspath(OUTPUT.parent / filename)
        bpy.ops.render.render(write_still=True)
        print(os.fspath(OUTPUT.parent / filename))


if __name__ == "__main__":
    main()
