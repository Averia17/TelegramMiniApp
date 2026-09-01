"""Restore Wukong's authored body proportions while keeping current actions."""

from __future__ import annotations

import os
import re
from pathlib import Path

import bpy
from mathutils import Quaternion

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (
    ROOT / "frontend" / "assets-source" / "heroes" / "wukong-mico" / "wukong-mico.blend"
)
INPUT = ROOT / "output" / "blender" / "wukong-before-proportion-v2.blend"
REFERENCE = ROOT / "output" / "blender" / "wukong-proportion-reference-742e47c.blend"
TEXTURE = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "wukong-mico"
    / "textures"
    / "mico_wukong_tex_highres.png"
)
IDLE_SWAY_FACTORS = {
    "hips_s": 0.25,
    "spine_lower_s": 0.25,
    "spine_mid_s": 0.25,
    "spine_upper_s": 0.25,
    "chest_s": 0.25,
    "head_s": 0.35,
    "L_clavicle_s": 0.25,
    "R_clavicle_s": 0.25,
    "L_shoulder_twist_s": 0.25,
    "R_shoulder_twist_s": 0.25,
}


def stable_name(name: str) -> str:
    return re.sub(r"\.\d+$", "", name)


def remove_scale_curves(action) -> int:
    removed = 0
    if hasattr(action, "fcurves"):
        curves = list(action.fcurves)
        for curve in curves:
            if curve.data_path.endswith(".scale"):
                action.fcurves.remove(curve)
                removed += 1
        return removed
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                for curve in list(channelbag.fcurves):
                    if curve.data_path.endswith(".scale"):
                        channelbag.fcurves.remove(curve)
                        removed += 1
    return removed


def action_curves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def damp_idle_sway(action) -> dict[str, int]:
    curves = action_curves(action)
    changed = {}
    for bone_name, factor in IDLE_SWAY_FACTORS.items():
        path = f'pose.bones["{bone_name}"].rotation_quaternion'
        channels = {
            curve.array_index: curve for curve in curves if curve.data_path == path
        }
        if len(channels) != 4:
            continue
        key_frames = [point.co[0] for point in channels[0].keyframe_points]
        base = Quaternion(
            tuple(channels[index].keyframe_points[0].co[1] for index in range(4))
        )
        base.normalize()
        edited = 0
        for key_index, frame in enumerate(key_frames):
            values = [
                channels[index].keyframe_points[key_index].co[1] for index in range(4)
            ]
            pose = Quaternion(tuple(values))
            pose.normalize()
            damped = base.slerp(pose, factor)
            for index, value in enumerate(damped):
                channels[index].keyframe_points[key_index].co[1] = value
            edited += 1
        for curve in channels.values():
            curve.update()
        changed[bone_name] = edited
    return changed


def main() -> None:
    if not SOURCE.exists():
        raise RuntimeError(f"Missing canonical source: {SOURCE}")
    if not REFERENCE.exists():
        raise RuntimeError(f"Missing proportion reference: {REFERENCE}")

    input_path = INPUT if INPUT.exists() else SOURCE
    bpy.ops.wm.open_mainfile(filepath=os.fspath(input_path))
    targets = {obj.name: obj for obj in bpy.context.scene.objects if obj.type == "MESH"}
    target_by_mesh_name = {stable_name(obj.data.name): obj for obj in targets.values()}

    with bpy.data.libraries.load(os.fspath(REFERENCE), link=False) as (
        data_from,
        data_to,
    ):
        requested = [
            name
            for name in data_from.meshes
            if stable_name(name) in target_by_mesh_name
        ]
        data_to.meshes = requested
        data_to.materials = list(data_from.materials)
        data_to.images = list(data_from.images)
    loaded = list(data_to.meshes)
    reference_materials = {
        stable_name(material.name): material
        for material in data_to.materials
        if material is not None
    }
    if not TEXTURE.exists():
        raise RuntimeError(f"Missing Wukong texture: {TEXTURE}")
    texture = bpy.data.images.load(os.fspath(TEXTURE), check_existing=False)
    for material in reference_materials.values():
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE":
                node.image = texture
    if len(loaded) != len(requested):
        raise RuntimeError(
            f"Expected {len(requested)} proportion references, loaded {len(loaded)}"
        )

    changed = []
    for reference_mesh in loaded:
        if reference_mesh is None:
            raise RuntimeError("A proportion reference mesh failed to load")
        source_name = reference_mesh.name
        target = target_by_mesh_name[stable_name(source_name)]
        original_materials = list(target.data.materials)
        replacement = reference_mesh.copy()
        if len(replacement.materials) != len(original_materials):
            raise RuntimeError(
                f"{target.name}: material-slot contract changed; "
                f"current={len(original_materials)} reference={len(replacement.materials)}"
            )
        for index, material in enumerate(original_materials):
            replacement.materials[index] = reference_materials.get(
                stable_name(material.name), material
            )
        target.data = replacement
        changed.append(
            {
                "object": source_name,
                "vertices": len(replacement.vertices),
                "polygons": len(replacement.polygons),
            }
        )

    armature = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
    )
    removed_scale_curves = sum(
        remove_scale_curves(action) for action in bpy.data.actions
    )
    idle = next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == "idle"
        ),
        None,
    )
    damped_idle_bones = damp_idle_sway(idle) if idle is not None else {}
    if armature is not None:
        for bone in armature.pose.bones:
            bone.scale = (1.0, 1.0, 1.0)

    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(SOURCE))
    print(
        {
            "source": os.fspath(SOURCE),
            "input": os.fspath(input_path),
            "reference": os.fspath(REFERENCE),
            "changed": changed,
            "removed_scale_curves": removed_scale_curves,
            "damped_idle_bones": damped_idle_bones,
        }
    )


if __name__ == "__main__":
    main()
