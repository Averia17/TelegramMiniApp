"""Put Fairy Mina's neutral idle arms down without changing skill gestures."""

from __future__ import annotations

import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REVISION = "fairy-mina-idle-arms-down-v1"
ARM_BONES = (
    "R_shoulder_s",
    "R_elbow_s",
    "R_wrist_s",
    "L_shoulder_s",
    "L_elbow_s",
    "L_wrist_s",
)


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
    scene = bpy.context.scene
    armature = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    missing = [name for name in ARM_BONES if name not in armature.pose.bones]
    if missing:
        raise RuntimeError(f"fairy-mina: missing arm bones: {missing}")

    if scene.get("idle_arm_pose_revision") == REVISION:
        print("SKIP", REVISION)
        return

    action = bpy.data.actions.get("idle")
    if action is None:
        raise RuntimeError("fairy-mina: missing idle Action")

    changed = 0
    target_paths = {f'pose.bones["{name}"].rotation_euler' for name in ARM_BONES}
    for curve in action_fcurves(action):
        if curve.data_path not in target_paths:
            continue
        for point in curve.keyframe_points:
            if abs(float(point.co.y)) > 1e-8:
                changed += 1
            point.co.y = 0.0
        curve.update()

    if changed == 0:
        raise RuntimeError("fairy-mina: idle arm curves were already neutral")

    armature.animation_data_create()
    armature.animation_data.action = action
    scene.frame_start = int(round(action.frame_range[0]))
    scene.frame_end = int(round(action.frame_range[1]))
    scene.frame_set(scene.frame_start)
    scene["idle_arm_pose_revision"] = REVISION
    scene["idle_arm_pose_policy"] = "rest-pose-down; skill-actions-unchanged"
    scene["idle_arm_pose_bones"] = ",".join(ARM_BONES)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print("UPDATED", REVISION, "changed_keyframes", changed)


if __name__ == "__main__":
    main()
