"""Extract Mandy's canonical left-hand staff and publish its runtime GLB.

The staff is authored in the focused idle scene, where the left wrist and the
staff orientation have already passed the full animation validator.  The
resulting source blend is deliberately independent from the character rig:
the mesh object origin is the left-hand grip origin and the grip marker is its
child at local zero.
"""

from __future__ import annotations

import os
from pathlib import Path

import bpy
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[2]
IDLE_SCENE = (
    ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "scenes" / "idle.blend"
)
SOURCE_OUT = (
    ROOT / "frontend" / "assets-source" / "heroes" / "mandy" / "mandy_weapon.blend"
)
RUNTIME_DIR = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_weapons"
RUNTIME_OUT = RUNTIME_DIR / "mandy_weapon.glb"
RUNTIME_TMP = RUNTIME_DIR / ".mandy_weapon.tmp.glb"


def clear_scene() -> None:
    for obj in list(bpy.context.scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def extract() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(IDLE_SCENE))
    pivot = bpy.data.objects.get("MandyStaff_SourcePivot")
    staff = bpy.data.objects.get("MandyStaff_Attachment")
    marker = bpy.data.objects.get("Grip.Primary.MandyStaff_Attachment")
    if not pivot or not staff or not marker or staff.type != "MESH":
        raise RuntimeError("Mandy idle scene is missing the canonical staff hierarchy")
    if pivot.parent_bone != "L_wrist_s_047" or marker.parent_bone != "L_wrist_s_047":
        raise RuntimeError("Mandy staff source is not authored on L_wrist_s_047")

    # Capture all source transforms before clearing the focused scene.
    mesh = staff.data.copy()
    staff_local = staff.matrix_local.copy()
    pivot_local = pivot.matrix_local.copy()

    # Clear the focused scene before creating the standalone weapon objects so
    # Blender can preserve the canonical object names without a ``.001`` suffix.
    clear_scene()

    # Preserve the authored parent/child transforms instead of baking them into
    # mesh vertices.  The empty root is the grip origin; its child geometry
    # retains the original staff offset and the root retains the pivot rotation.
    root = bpy.data.objects.new("MandyStaff_Attachment", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.08
    root.matrix_world = pivot_local
    root["attachment_role"] = "held-weapon"
    root["grip_bone"] = "L_wrist_s_047"
    root["grip_authored_root"] = True
    root["source_scene"] = "mandy/scenes/idle.blend"

    geometry = bpy.data.objects.new("MandyStaff_Geometry", mesh)
    geometry.parent = root
    geometry.matrix_parent_inverse = Matrix.Identity(4)
    geometry.matrix_basis = staff_local
    geometry["attachment_role"] = "held-weapon"

    grip = bpy.data.objects.new("Grip.Primary.MandyStaff_Attachment", None)
    grip.empty_display_type = "PLAIN_AXES"
    grip.empty_display_size = 0.08
    grip.parent = root
    grip.location = (0.0, 0.0, 0.0)
    grip["grip_role"] = "primary"
    grip["attachment_role"] = "weapon-grip-marker"

    collection = bpy.context.scene.collection
    collection.objects.link(root)
    collection.objects.link(geometry)
    collection.objects.link(grip)
    root.select_set(True)
    geometry.select_set(True)
    grip.select_set(True)
    bpy.context.view_layer.objects.active = root

    bpy.ops.wm.save_as_mainfile(
        filepath=os.fspath(SOURCE_OUT), check_existing=False, copy=False
    )

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.fspath(RUNTIME_TMP),
        export_format="GLB",
        export_animations=False,
        export_skins=False,
        export_yup=True,
        export_extras=True,
        use_selection=True,
    )
    try:
        RUNTIME_TMP.replace(RUNTIME_OUT)
    except PermissionError:
        print(f"EXPORTED temporary weapon: {RUNTIME_TMP}")
    else:
        print(f"EXPORTED weapon source: {SOURCE_OUT}")
        print(f"EXPORTED weapon runtime: {RUNTIME_OUT}")


if __name__ == "__main__":
    extract()
