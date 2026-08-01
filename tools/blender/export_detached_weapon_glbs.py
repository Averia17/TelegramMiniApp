"""Export detached held weapons with an authored socket-root pivot.

The runtime attaches these GLBs directly under a hero's weapon socket.  The
old files were exported with arbitrary mesh origins, so runtime's nearest-bound
fallback could place a fan/staff/speaker at an edge instead of in the hand.
This exporter bakes each weapon's source transform relative to its socket into
the mesh data and leaves the object origin at the socket.
"""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_weapons"

WEAPONS = {
    "damian": (
        ("HeroAttachment_Microphone", "Grip.Primary.HeroAttachment_Microphone"),
        ("HeroAttachment_Speaker", "Grip.Primary.HeroAttachment_Speaker"),
    ),
    "kaze": (
        ("HeroAttachment_FanLeft", "Grip.Primary.HeroAttachment_FanLeft"),
        ("HeroAttachment_FanRight", "Grip.Primary.HeroAttachment_FanRight"),
    ),
    "mandy": (("MandyStaff_Attachment", "Grip.Primary.MandyStaff_Attachment"),),
    "persephone-lumi": (
        ("HeroAttachment_WeaponHeld", "Grip.Primary.HeroAttachment_WeaponHeld"),
    ),
    "wukong-mico": (("HeroAttachment_Staff", "Grip.Primary.HeroAttachment_Staff"),),
}


def export(hero: str) -> Path:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(SOURCE / hero / f"{hero}.blend"))
    selected = []
    for object_name, anchor_name in WEAPONS[hero]:
        weapon = bpy.data.objects.get(object_name)
        anchor = bpy.data.objects.get(anchor_name)
        if weapon is None or anchor is None:
            raise RuntimeError(f"{hero}: missing {object_name} or {anchor_name}")
        # Bake the mesh's exact source transform relative to the socket.  After
        # this, runtime can place the object at target origin without guessing
        # from a bounding box.
        relative = anchor.matrix_world.inverted() @ weapon.matrix_world
        weapon.parent = None
        weapon.matrix_world = relative
        bpy.context.view_layer.objects.active = weapon
        weapon.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        weapon["attachment_role"] = "held-weapon"
        weapon["grip_authored_root"] = True
        selected.append(weapon)

    for object in bpy.context.scene.objects:
        object.select_set(object in selected)
    bpy.context.view_layer.objects.active = selected[0]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    target = OUTPUT / f"{hero}_weapon.glb"
    temp = OUTPUT / f".{hero}_weapon.tmp.glb"
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(temp),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_extras=True,
        export_yup=True,
    )
    try:
        temp.replace(target)
    except PermissionError:
        print(f"EXPORTED {hero}: {temp} (finalize after Blender exits)")
        return temp
    print(f"EXPORTED {hero}: {target}")
    return target


def main() -> None:
    for hero in WEAPONS:
        export(hero)


if __name__ == "__main__":
    main()
