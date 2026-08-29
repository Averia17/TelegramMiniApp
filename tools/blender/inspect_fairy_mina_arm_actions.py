"""Inspect Fairy Mina arm pose channels in every canonical Action."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
ARM_BONES = (
    "R_shoulder_s",
    "R_upper_shoulder_0_bend_s",
    "R_elbow_s",
    "R_lower_elbow_0_bend_s",
    "R_wrist_s",
    "L_shoulder_s",
    "L_upper_shoulder_0_bend_s",
    "L_elbow_s",
    "L_lower_elbow_0_bend_s",
    "L_wrist_s",
)


def channel_values(action, bone_name: str):
    prefix = f'pose.bones["{bone_name}"].rotation_euler'
    values = []
    for curve in sorted(
        (curve for curve in action_fcurves(action) if curve.data_path == prefix),
        key=lambda item: item.array_index,
    ):
        values.append(
            {
                "axis": curve.array_index,
                "keys": [
                    (round(float(point.co.x), 2), round(float(point.co.y), 4))
                    for point in curve.keyframe_points
                ],
            }
        )
    return values


def action_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", ()):
                curves.extend(channelbag.fcurves)
    return curves


def main() -> None:
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    print("MASTER", MASTER)
    for action in sorted(bpy.data.actions, key=lambda item: item.name.casefold()):
        print(
            "ACTION",
            action.name,
            tuple(round(float(value), 2) for value in action.frame_range),
        )
        for bone_name in ARM_BONES:
            values = channel_values(action, bone_name)
            if values:
                print(" ", bone_name, values)
    print(
        "REST_HEADS",
        {
            name: tuple(
                round(float(value), 3) for value in armature.data.bones[name].head_local
            )
            for name in ARM_BONES
        },
    )


if __name__ == "__main__":
    main()
