"""Split Fairy Mina's connected torso/head island at the neck seam."""

from __future__ import annotations

import json
import os
from collections import Counter
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REVISION = "fairy-mina-head-torso-split-v1"


def dominant_group(obj, vertex_indices: list[int]) -> str:
    scores = Counter()
    for index in vertex_indices:
        for group in obj.data.vertices[index].groups:
            scores[obj.vertex_groups[group.group].name] += group.weight
    return scores.most_common(1)[0][0] if scores else ""


def is_head_face(obj, face) -> bool:
    vertex_indices = [vertex.index for vertex in face.verts]
    center_z = sum(obj.data.vertices[index].co.z for index in vertex_indices) / len(
        vertex_indices
    )
    return (
        dominant_group(obj, vertex_indices) in {"head_s", "neck_s"} and center_z >= 6.8
    )


def head_weight_score(obj) -> float:
    return sum(
        group.weight
        for vertex in obj.data.vertices
        for group in vertex.groups
        if obj.vertex_groups[group.group].name in {"head_s", "neck_s"}
    )


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    body = bpy.data.objects.get("body_GEO_torso_head")
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if body is None or body.type != "MESH":
        raise RuntimeError("fairy-mina: missing body_GEO_torso_head mesh")
    if armature is None:
        raise RuntimeError("fairy-mina: missing armature")

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    mesh = bmesh.from_edit_mesh(body.data)
    selected = [face for face in mesh.faces if is_head_face(body, face)]
    if not selected or len(selected) == len(mesh.faces):
        raise RuntimeError(
            f"unexpected head selection: {len(selected)}/{len(mesh.faces)} faces"
        )
    for face in mesh.faces:
        face.select_set(face in selected)
    bmesh.update_edit_mesh(body.data)
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH"
        and (obj == body or obj.name.startswith("body_GEO_torso_head."))
    ]
    if len(parts) != 2:
        raise RuntimeError(
            f"unexpected head/torso split: {[obj.name for obj in parts]}"
        )
    head = max(parts, key=head_weight_score)
    torso = min(parts, key=head_weight_score)
    for obj, name in ((head, "body_GEO_head"), (torso, "body_GEO_torso")):
        obj.name = name
        obj.data.name = f"{name}_mesh"
        if not any(
            mod.type == "ARMATURE" and mod.object == armature for mod in obj.modifiers
        ):
            raise RuntimeError(f"{name}: armature modifier was not preserved")

    bpy.context.scene["body_split_revision"] = REVISION
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print(
        json.dumps(
            {
                "master": os.fspath(MASTER),
                "parts": ["body_GEO_head", "body_GEO_torso"],
                "selected_faces": len(selected),
                "revision": REVISION,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
