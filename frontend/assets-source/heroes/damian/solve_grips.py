"""Fit both Damian finger rigs around the microphone and speaker handle."""

import json
import math
import sys

import bpy
from mathutils import Vector

blend_path, solved_path, report_path = sys.argv[sys.argv.index("--") + 1 :]
bpy.ops.wm.open_mainfile(filepath=blend_path)
armature = bpy.data.objects["damian-rig"]
armature.animation_data.action = bpy.data.actions["Idle"]
bpy.context.scene.frame_set(1)

setups = (
    ("microphone", "L", "HeroAttachment_Microphone", Vector((0, 0, 1)), 0.095),
    ("speaker", "R", "HeroAttachment_Speaker", Vector((1, 0, 0)), 0.072),
)


def point(bone, tail=False):
    return armature.matrix_world @ (bone.tail if tail else bone.head)


report = {}
for label, side, object_name, local_axis, radius in setups:
    weapon = bpy.data.objects[object_name]
    grip = bpy.data.objects[f"Grip.Primary.{object_name}"]
    axis = (weapon.matrix_world.to_3x3() @ local_axis).normalized()
    center = grip.matrix_world.translation.copy()

    def radial(value):
        offset = value - center
        return offset - axis * offset.dot(axis)

    solved = {}
    for finger in ("thumb", "index", "middle", "ring", "pinky"):
        first_name = f"{side}_{finger}_01_s"
        second_name = f"{side}_{finger}_02_s"
        first = armature.pose.bones[first_name]
        second = armature.pose.bones[second_name]
        for bone in (first, second):
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (0, 0, 0)
        bpy.context.view_layer.update()

        root = point(first)
        root_radial = radial(root)
        if root_radial.length < 1e-6:
            root_radial = Vector((0, 1, 0))
        target = (
            center
            + axis * (root - center).dot(axis)
            - root_radial.normalized() * radius
        )
        values = [0.0] * 6

        def apply_values():
            first.rotation_euler = values[:3]
            second.rotation_euler = values[3:]

        def objective():
            bpy.context.view_layer.update()
            tip = point(second, True)
            joint = point(first, True)
            joint_radius = radial(joint).length
            return (
                (tip - target).length
                + abs(joint_radius - radius * 1.08) * 0.4
                + max(0.0, radius * 0.78 - joint_radius) * 4.0
            )

        apply_values()
        best = objective()
        step = math.radians(50)
        for _ in range(11):
            changed = True
            while changed:
                changed = False
                for index in range(6):
                    original = values[index]
                    selected = original
                    selected_score = best
                    for candidate in (original - step, original + step):
                        values[index] = max(
                            math.radians(-140), min(math.radians(140), candidate)
                        )
                        apply_values()
                        score = objective()
                        if score < selected_score:
                            selected, selected_score = values[index], score
                    values[index] = selected
                    apply_values()
                    if selected_score + 1e-7 < best:
                        best = selected_score
                        changed = True
            step *= 0.55
        solved[finger] = {
            "bones": [first_name, second_name],
            "degrees": [round(math.degrees(value), 3) for value in values],
            "error": round((point(second, True) - target).length, 6),
        }
    report[label] = {
        "axis": list(axis),
        "center": list(center),
        "radius": radius,
        "fingers": solved,
    }

bpy.ops.wm.save_as_mainfile(filepath=solved_path)
with open(report_path, "w", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2)
print("SOLVED", solved_path)
