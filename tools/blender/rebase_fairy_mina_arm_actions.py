"""Rebase Fairy Mina's authored Actions from raised arms to the rest pose.

The source Actions were authored with a constant raised-arm offset.  The
neutral pose is now down, so remove only that old local Euler offset from the
arm chain.  This preserves each clip's authored motion relative to its base
pose while leaving the idle Action (already repaired) unchanged.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend" / "assets-source" / "heroes" / "fairy-mina" / "fairy-mina.blend"
)
REVISION = "fairy-mina-all-actions-arms-rebased-v1"

# These are the constant local rotations that the old idle Action used as its
# raised-arm base.  The current idle Action has already been set to zero.
OLD_IDLE_ARM_OFFSET = {
    "R_shoulder_s": (math.radians(60.0), math.radians(10.0), math.radians(46.0)),
    "R_elbow_s": (math.radians(62.0), 0.0, 0.0),
    "R_wrist_s": (math.radians(2.0), 0.0, 0.0),
    "L_shoulder_s": (math.radians(52.0), math.radians(-10.0), math.radians(-46.0)),
    "L_elbow_s": (math.radians(62.0), 0.0, 0.0),
    "L_wrist_s": (math.radians(2.0), 0.0, 0.0),
}


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
    missing = sorted(set(OLD_IDLE_ARM_OFFSET) - set(armature.pose.bones.keys()))
    if missing:
        raise RuntimeError(f"fairy-mina: missing arm bones: {missing}")
    if scene.get("all_actions_arm_rebase_revision") == REVISION:
        print("SKIP", REVISION)
        return

    changed_actions = []
    changed_keyframes = 0
    for action in sorted(bpy.data.actions, key=lambda item: item.name.casefold()):
        if action.name == "idle":
            continue
        changed_here = 0
        for curve in action_fcurves(action):
            prefix = 'pose.bones["'
            if not curve.data_path.startswith(prefix) or not curve.data_path.endswith(
                '"].rotation_euler'
            ):
                continue
            bone_name = curve.data_path[len(prefix) : -len('"].rotation_euler')]
            offset = OLD_IDLE_ARM_OFFSET.get(bone_name)
            if offset is None or curve.array_index > 2:
                continue
            for point in curve.keyframe_points:
                point.co.y -= offset[curve.array_index]
                changed_here += 1
            curve.update()
        if changed_here:
            action["arm_rebase_revision"] = REVISION
            action["arm_rebase_policy"] = "remove-old-raised-idle-offset"
            changed_actions.append(action.name)
            changed_keyframes += changed_here

    if not changed_actions:
        raise RuntimeError("fairy-mina: no non-idle arm keyframes were rebased")

    armature.animation_data_create()
    idle = bpy.data.actions.get("idle")
    if idle is None:
        raise RuntimeError("fairy-mina: missing idle Action after rebase")
    armature.animation_data.action = idle
    scene.frame_start = int(round(idle.frame_range[0]))
    scene.frame_end = int(round(idle.frame_range[1]))
    scene.frame_set(scene.frame_start)
    scene["all_actions_arm_rebase_revision"] = REVISION
    scene["all_actions_arm_rebase_policy"] = (
        "old-raised-idle-offset-removed; idle-and-skill-relative-motion-preserved"
    )
    scene["all_actions_arm_rebase_bones"] = ",".join(OLD_IDLE_ARM_OFFSET)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print(
        "UPDATED",
        REVISION,
        "actions",
        changed_actions,
        "changed_keyframes",
        changed_keyframes,
    )


if __name__ == "__main__":
    main()
