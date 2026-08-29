"""Split Fairy Mina's joined body mesh into its existing loose parts."""

from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REVISION = "fairy-mina-body-parts-v1"


def weight_scores(obj) -> Counter:
    scores = Counter()
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            scores[obj.vertex_groups[group.group].name] += group.weight
    return scores


def classify(obj: object) -> str:
    scores = weight_scores(obj)
    dominant = scores.most_common(1)[0][0] if scores else ""
    groups = set(scores)
    if groups == {"L_eyebrow_0_s"}:
        return "body_GEO_L_eyebrow"
    if groups == {"R_eyebrow_0_s"}:
        return "body_GEO_R_eyebrow"
    if dominant == "head_s" and ("chest_s" in groups or "hips_s" in groups):
        return "body_GEO_torso_head"
    side = "L" if any(name.startswith("L_") for name in groups) else "R"
    if "wrist" in dominant or any(
        token in dominant for token in ("index", "middle", "ring", "pinky", "thumb")
    ):
        suffix = "hand" if len(obj.data.vertices) > 180 else "hand_detail"
        return f"body_GEO_{side}_{suffix}"
    if "shoulder" in dominant or "elbow" in dominant:
        return f"body_GEO_{side}_arm"
    if dominant == "head_s":
        return "body_GEO_face"
    raise RuntimeError(
        f"cannot classify split body part {obj.name}: "
        f"vertices={len(obj.data.vertices)}, groups={sorted(groups)}"
    )


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    body = bpy.data.objects.get("body_GEO")
    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    if body is None or body.type != "MESH":
        raise RuntimeError("fairy-mina: missing body_GEO mesh")
    if armature is None:
        raise RuntimeError("fairy-mina: missing armature")

    existing = {
        obj.name
        for obj in bpy.context.scene.objects
        if obj.name.startswith("body_GEO_")
    }
    if existing:
        raise RuntimeError(f"fairy-mina: body parts already exist: {sorted(existing)}")

    for obj in bpy.context.selected_objects:
        obj.select_set(False)
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="LOOSE")
    bpy.ops.object.mode_set(mode="OBJECT")

    parts = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and (obj == body or obj.name.startswith("body_GEO."))
    ]
    names = [classify(obj) for obj in parts]
    if len(parts) != 10 or len(set(names)) != len(names):
        raise RuntimeError(
            f"unexpected body split: {[(obj.name, name) for obj, name in zip(parts, names)]}"
        )

    for obj, name in zip(parts, names):
        obj.name = name
        obj.data.name = f"{name}_mesh"
        if not any(
            mod.type == "ARMATURE" and mod.object == armature for mod in obj.modifiers
        ):
            raise RuntimeError(f"{name}: armature modifier was not preserved")

    bpy.context.scene["body_split_revision"] = REVISION
    bpy.context.scene["body_split_source"] = "body_GEO:loose-components"
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print(
        json.dumps(
            {"master": os.fspath(MASTER), "parts": sorted(names), "revision": REVISION},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
