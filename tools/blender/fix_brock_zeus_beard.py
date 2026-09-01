"""Seal the exposed Zeus beard seam on the canonical master.

The Zeus head mesh contains the lower beard and the exposed lower-face seam in
one object/material. The original boundary leaves small brown islands between
the upper beard edge and the white chin plate. Those front-facing lower-face
polygons are assigned the dedicated beard-white material so the beard reads as
one attached piece in the master and in every exported animation clip.
"""

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "frontend/assets-source/heroes/brock-zeus/zeus_base.blend"
HEAD_NAME = "ZeusPart_Head"
MATERIAL_NAME = "Zeus_Beard_White"


def make_white_material():
    material = bpy.data.materials.get(MATERIAL_NAME)
    if material is None:
        material = bpy.data.materials.new(MATERIAL_NAME)
    material.use_nodes = True
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    nodes = material.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    if shader is None:
        shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    shader.inputs["Roughness"].default_value = 0.72
    if "Specular IOR Level" in shader.inputs:
        shader.inputs["Specular IOR Level"].default_value = 0.25
    return material


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    head = bpy.data.objects.get(HEAD_NAME)
    if head is None or head.type != "MESH":
        raise RuntimeError(f"Missing mesh object: {HEAD_NAME}")

    material = make_white_material()
    try:
        white_index = list(head.data.materials).index(material)
    except ValueError:
        head.data.materials.append(material)
        white_index = len(head.data.materials) - 1

    changed = 0
    for polygon in head.data.polygons:
        center = head.matrix_world @ polygon.center
        # Front-facing lower-beard seam. The visor/goggle geometry is in front
        # of this surface, so extending the white region to z=5.0 only seals
        # the exposed gaps; it does not recolor the visible golden visor.
        if center.y < -0.55 and center.z < 5.0:
            if polygon.material_index != white_index:
                polygon.material_index = white_index
                changed += 1

    head["beard_material"] = MATERIAL_NAME
    head["beard_fix_revision"] = "2026-09-01-white-beard-seam-v2"
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER))
    print(f"Assigned {changed} polygons to {MATERIAL_NAME} (slot {white_index})")
    print(f"Saved {MASTER}")


if __name__ == "__main__":
    main()
