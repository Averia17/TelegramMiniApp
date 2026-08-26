"""Refine Brock Zeus's one-second cloud-to-glove attack in the master scene."""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MASTER = (
    ROOT / "frontend/assets-source/heroes/brock-zeus/zeus_base.blend"
)
REPORT = ROOT / "artifacts/brock-zeus-archive-rebuild/archive_rebuild_report.json"
FPS = 30


def radians(values):
    return tuple(math.radians(value) for value in values)


def get_fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in getattr(strip, "channelbags", []):
                curves.extend(channelbag.fcurves)
    return curves


def neutral_pose(armature):
    """Read the authored idle reference instead of guessing a second rest pose."""
    idle = bpy.data.actions.get("idle")
    if idle is None:
        raise RuntimeError("Brock Zeus master has no idle Action")
    armature.animation_data_clear()
    armature.animation_data_create()
    armature.animation_data.action = idle
    bpy.context.scene.frame_set(120)
    bpy.context.view_layer.update()
    return {
        bone.name: {
            "rotation_mode": bone.rotation_mode,
            "loc": tuple(bone.location),
            "rot": tuple(bone.rotation_euler),
            "scale": tuple(bone.scale),
        }
        for bone in armature.pose.bones
    }


def reset_to_neutral(armature, pose):
    for bone in armature.pose.bones:
        reference = pose[bone.name]
        bone.rotation_mode = reference["rotation_mode"]
        bone.location = reference["loc"]
        bone.rotation_euler = reference["rot"]
        bone.scale = reference["scale"]


def refine_idle_pose():
    """Open the legacy idle arm fold while keeping its secondary motion."""
    action = bpy.data.actions.get("idle")
    if action is None:
        raise RuntimeError("Brock Zeus master has no idle Action")
    if action.get("idle_pose_revision") == "zeus-natural-arms-v5":
        return
    for curve in get_fcurves(action):
        if not curve.data_path.endswith("rotation_euler"):
            continue
        delta = None
        if curve.array_index == 0 and '"R_Shoulder"' in curve.data_path:
            delta = math.radians(26.0)
        elif curve.array_index == 0 and '"L_Shoulder"' in curve.data_path:
            delta = math.radians(26.0)
        elif curve.array_index == 2 and '"R_Shoulder"' in curve.data_path:
            delta = -math.radians(14.0)
        elif curve.array_index == 2 and '"L_Shoulder"' in curve.data_path:
            delta = math.radians(14.0)
        elif curve.array_index == 0 and ('"R_Elbow"' in curve.data_path or '"L_Elbow"' in curve.data_path):
            delta = math.radians(40.0)
        if delta is None:
            continue
        for key in curve.keyframe_points:
            key.co.y += delta
            key.handle_left[1] += delta
            key.handle_right[1] += delta
        curve.update()
    action["idle_pose_revision"] = "zeus-natural-arms-v5"
    action["semantic_revision"] = "zeus-natural-arms-v5"


def repair_wrist_seams():
    """Overlap each rigid hand piece slightly into its matching cuff."""
    repairs = {
        # v1 was a bad sign choice; v2 closed the seam in Attack. v3 is the
        # smallest correction that also closes the idle silhouette.
        "ZeusPart_R_Hand": (0.012, -0.012, -0.008),
        "ZeusPart_L_Hand": (0.0, 0.0, 0.0),
    }
    v4_repairs = {
        "ZeusPart_R_Hand": (0.015, -0.015, 0.015),
        "ZeusPart_L_Hand": (0.004, 0.010, 0.010),
    }
    v5_repairs = {
        # The source seam was mathematically touching, but the stylized hand
        # silhouette still left a visible gap in the oblique lobby camera.
        # Move the whole rigid hand into the matching forearm/cuff so the
        # overlap survives both the idle pose and the authored skill clips.
        "ZeusPart_R_Hand": (-0.065, 0.045, 0.060),
        "ZeusPart_L_Hand": (0.040, 0.010, 0.080),
    }
    v6_repairs = {
        # v5 reduced the gap in the lobby, but the idle silhouette still
        # exposed a thin background sliver below each cuff. Close that last
        # visible seam with a conservative cumulative correction.
        "ZeusPart_R_Hand": (-0.045, 0.030, 0.045),
        "ZeusPart_L_Hand": (0.030, 0.008, 0.045),
    }
    v7_repairs = {
        # In the oblique lobby camera the previous world-space correction
        # moved both hands farther toward the screen edges. Bring the hands
        # inward in the authored X direction and slightly upward so the
        # wrist stumps overlap the cuffs in the actual player-facing view.
        "ZeusPart_R_Hand": (0.100, 0.000, 0.020),
        "ZeusPart_L_Hand": (-0.100, 0.000, 0.020),
    }
    v8_repairs = {
        # Align the actual wrist ends, not just the single closest mesh
        # vertices used by the seam probe. The imported hand centers were
        # offset from the cuff axis by almost one wrist radius.
        "ZeusPart_R_Hand": (0.300, 0.000, 0.120),
        "ZeusPart_L_Hand": (-0.180, 0.000, 0.100),
    }
    for name, offset in repairs.items():
        hand = bpy.data.objects.get(name)
        if hand is None:
            raise RuntimeError(f"Brock Zeus master has no hand mesh {name}")
        if hand.get("wrist_seam_revision") == "zeus-wrist-seam-v4":
            # The v4 trial moved the seam farther apart. Restore the master
            # to the proven v3 geometry before applying no further delta.
            rollback = v4_repairs[name]
            for vertex in hand.data.vertices:
                vertex.co.x -= rollback[0]
                vertex.co.y -= rollback[1]
                vertex.co.z -= rollback[2]
            hand.data.update()
            hand["wrist_seam_revision"] = "zeus-wrist-seam-v3"
        if hand.get("wrist_seam_revision") == "zeus-wrist-seam-v5":
            for vertex in hand.data.vertices:
                vertex.co.x += v6_repairs[name][0]
                vertex.co.y += v6_repairs[name][1]
                vertex.co.z += v6_repairs[name][2]
            hand.data.update()
            hand["wrist_seam_revision"] = "zeus-wrist-seam-v6"
            continue
        if hand.get("wrist_seam_revision") == "zeus-wrist-seam-v6":
            for vertex in hand.data.vertices:
                vertex.co.x += v7_repairs[name][0]
                vertex.co.y += v7_repairs[name][1]
                vertex.co.z += v7_repairs[name][2]
            hand.data.update()
            hand["wrist_seam_revision"] = "zeus-wrist-seam-v7"
            continue
        if hand.get("wrist_seam_revision") == "zeus-wrist-seam-v7":
            for vertex in hand.data.vertices:
                vertex.co.x += v8_repairs[name][0]
                vertex.co.y += v8_repairs[name][1]
                vertex.co.z += v8_repairs[name][2]
            hand.data.update()
            hand["wrist_seam_revision"] = "zeus-wrist-seam-v8"
            continue
        if hand.get("wrist_seam_revision") == "zeus-wrist-seam-v8":
            continue
        if hand.get("wrist_seam_revision") == "zeus-wrist-seam-v3":
            for vertex in hand.data.vertices:
                vertex.co.x += v5_repairs[name][0]
                vertex.co.y += v5_repairs[name][1]
                vertex.co.z += v5_repairs[name][2]
            hand.data.update()
            hand["wrist_seam_revision"] = "zeus-wrist-seam-v5"
            continue
        for vertex in hand.data.vertices:
            vertex.co.x += offset[0]
            vertex.co.y += offset[1]
            vertex.co.z += offset[2]
        hand.data.update()
        hand["wrist_seam_revision"] = "zeus-wrist-seam-v3"


def repair_wrist_bone_pivots(armature):
    """Put the elbow/hand joint at the real cuff-to-skin seam.

    The imported rig placed the hand-bone pivot well outside the visible
    wrist. That is harmless in the bind pose, but any wrist rotation makes
    the rigid hand mesh swing away from the cuff. Re-anchor both bones to the
    midpoint of their closest authored vertices so the hand rotates around
    the actual joint while retaining the authored bone lengths.
    """
    if armature.data.get("wrist_pivot_revision") == "zeus-wrist-pivot-v1":
        return

    pairs = (
        ("R_Elbow", "R_Hand", "ZeusPart_R_Elbow", "ZeusPart_R_Hand"),
        ("L_Elbow", "L_Hand", "ZeusPart_L_Elbow", "ZeusPart_L_Hand"),
    )
    seams = {}
    for elbow_bone, hand_bone, elbow_mesh_name, hand_mesh_name in pairs:
        elbow_mesh = bpy.data.objects.get(elbow_mesh_name)
        hand_mesh = bpy.data.objects.get(hand_mesh_name)
        if elbow_mesh is None or hand_mesh is None:
            raise RuntimeError(f"Brock Zeus wrist parts missing for {hand_bone}")
        closest = None
        for elbow_vertex in elbow_mesh.data.vertices:
            for hand_vertex in hand_mesh.data.vertices:
                distance = (elbow_vertex.co - hand_vertex.co).length
                if closest is None or distance < closest[0]:
                    closest = (distance, elbow_vertex.co.copy(), hand_vertex.co.copy())
        seams[elbow_bone] = (closest[1] + closest[2]) * 0.5
        seams[hand_bone] = seams[elbow_bone]

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    previous_mode = armature.mode
    if previous_mode != "EDIT":
        bpy.ops.object.mode_set(mode="EDIT")
    for elbow_bone, hand_bone, _, _ in pairs:
        elbow = armature.data.edit_bones[elbow_bone]
        hand = armature.data.edit_bones[hand_bone]
        seam = seams[elbow_bone]
        delta = seam - hand.head
        elbow.tail = seam
        hand.head = seam
        hand.tail += delta
        hand.use_connect = True
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.data["wrist_pivot_revision"] = "zeus-wrist-pivot-v1"


def remove_wrist_bridges(armature):
    """Remove an experimental bridge that distorted the forearm silhouette."""
    for side in ("R", "L"):
        bridge = bpy.data.objects.get(f"ZeusWristBridge_{side}")
        if bridge is not None:
            bpy.data.objects.remove(bridge, do_unlink=True)
    armature.data.pop("wrist_bridge_revision", None)


def add_wrist_skin_overlaps(armature):
    """Add a small hand-weighted skin section under each cuff."""
    if armature.data.get("wrist_skin_revision") == "zeus-wrist-skin-v1":
        return
    material = bpy.data.objects["ZeusPart_R_Hand"].data.materials[0]
    for side, bone_name in (("R", "R_Hand"), ("L", "L_Hand")):
        name = f"ZeusWristSkin_{side}"
        old = bpy.data.objects.get(name)
        if old is not None:
            bpy.data.objects.remove(old, do_unlink=True)
        bone = armature.data.bones[bone_name]
        seam = Vector(bone.head_local)
        axis = (Vector(bone.tail_local) - seam).normalized()
        start = seam - axis * 0.30
        end = seam + axis * 0.22
        reference = Vector((0.0, 1.0, 0.0))
        if abs(axis.dot(reference)) > 0.9:
            reference = Vector((1.0, 0.0, 0.0))
        side_axis = axis.cross(reference).normalized()
        up_axis = axis.cross(side_axis).normalized()
        vertices = []
        rings = 8
        for center, radius in ((start, 0.15), (end, 0.17)):
            for index in range(rings):
                angle = math.tau * index / rings
                vertices.append(tuple(
                    center
                    + side_axis * (math.cos(angle) * radius)
                    + up_axis * (math.sin(angle) * radius)
                ))
        faces = []
        for index in range(rings):
            next_index = (index + 1) % rings
            faces.append((index, next_index, rings + next_index, rings + index))
        faces.extend([tuple(reversed(range(rings))), tuple(range(rings, rings * 2))])
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.materials.append(material)
        skin = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(skin)
        skin.parent = armature
        skin.matrix_parent_inverse = armature.matrix_world.inverted()
        skin.vertex_groups.new(name=bone_name).add(range(rings * 2), 1.0, "REPLACE")
        modifier = skin.modifiers.new("BrockZeus_Rig", "ARMATURE")
        modifier.object = armature
        skin["attachment_role"] = "body-wrist-skin"
        skin["wrist_skin_revision"] = "zeus-wrist-skin-v1"
    armature.data["wrist_skin_revision"] = "zeus-wrist-skin-v1"


def align_wrist_finger_assemblies():
    """Move the separate finger meshes with their matching palm."""
    corrections = {
        "R": (0.302, 0.063, 0.237),
        "L": (-0.206, 0.028, 0.255),
    }
    for side, offset in corrections.items():
        for part in ("Index_02", "Thumb_01", "Thumb_02"):
            hand = bpy.data.objects.get(f"ZeusPart_{side}_{part}")
            if hand is None:
                continue
            if hand.get("wrist_assembly_revision") == "zeus-wrist-assembly-v1":
                continue
            for vertex in hand.data.vertices:
                vertex.co.x += offset[0]
                vertex.co.y += offset[1]
                vertex.co.z += offset[2]
            hand.data.update()
            hand["wrist_assembly_revision"] = "zeus-wrist-assembly-v1"


def apply_pose(armature, pose):
    for name, values in pose.items():
        bone = armature.pose.bones.get(name)
        if bone is None:
            continue
        if "loc" in values:
            bone.location = values["loc"]
        if "rot" in values:
            bone.rotation_euler = radians(values["rot"])
        if "scale" in values:
            bone.scale = values["scale"]


def key_bones(action, armature, frame):
    for bone in armature.pose.bones:
        bone.keyframe_insert("location", frame=frame, group=bone.name)
        bone.keyframe_insert("rotation_euler", frame=frame, group=bone.name)
        bone.keyframe_insert("scale", frame=frame, group=bone.name)


def mark_clip(
    action, *, name, end, semantic, anticipation, release, follow_through, points
):
    action["hero_slug"] = "brock-zeus"
    action["clip_name"] = "attack"
    action["source_layout"] = "master-actions"
    action["frame_start"] = 1
    action["frame_end"] = end
    action["fps"] = FPS
    action["rig_version"] = 2
    action["point_contract"] = ",".join(points)
    action["anticipation_frame"] = anticipation
    action["release_frame"] = release
    action["follow_through_frame"] = follow_through
    action["semantic"] = semantic


def replace_action(name):
    old = bpy.data.actions.get(name)
    if old is not None:
        bpy.data.actions.remove(old)
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    return action


def author_character_attack(armature):
    pose = neutral_pose(armature)
    armature.animation_data_clear()
    action = replace_action("Attack")
    armature.animation_data_create()
    armature.animation_data.action = action

    # R is the authored attacking arm in this rig. The cloud reaches the open
    # glove at frame 8, charges through frames 9-12, releases at 13-15, and
    # settles with Bezier recovery from frame 15 onward.
    neutral = {
        "Chest": {"rot": (0, 0, 0)},
        "R_Shoulder": {"rot": (-30, 0, -4)},
        "R_Elbow": {"rot": (0, 0, -14)},
        "R_Hand": {"rot": (0, 0, 0)},
        "L_Shoulder": {"rot": (-30, 0, 4)},
        "L_Elbow": {"rot": (0, 0, 12)},
        "L_Hand": {"rot": (0, 0, 0)},
        "Head": {"rot": (0, 0, 0)},
    }
    attract = {
        "Pelvis": {"rot": (0, 0, 4)},
        "Spine": {"rot": (5, 0, 0)},
        "Chest": {"rot": (2, 0, 0)},
        "R_Shoulder": {"rot": (0, 5, 58)},
        "R_Elbow": {"rot": (0, 0, -88)},
        "R_Hand": {"rot": (0, 0, 18)},
        "L_Shoulder": {"rot": (-20, 0, 4)},
        "L_Elbow": {"rot": (0, 0, -8)},
        "Head": {"rot": (0, 0, -10)},
    }
    charge_a = {
        "Pelvis": {"rot": (0, 0, 1)},
        "Spine": {"rot": (3, 0, 0)},
        "Chest": {"rot": (1, 0, 0)},
        "R_Shoulder": {"rot": (0, 2, 68)},
        "R_Elbow": {"rot": (0, 0, -58)},
        "R_Hand": {"loc": (0.018, 0, 0), "rot": (0, 0, 12)},
        "L_Shoulder": {"rot": (-16, 0, 10)},
        "L_Elbow": {"rot": (0, 0, 2)},
        "Head": {"rot": (0, 0, -4)},
    }
    charge_b = {**charge_a, "R_Hand": {"loc": (-0.018, 0, 0), "rot": (0, 0, 15)}}
    charge_c = {
        **charge_a,
        "R_Hand": {"loc": (0.018, 0, 0), "rot": (0, 0, 11)},
        "L_Shoulder": {"rot": (-14, 0, 18)},
        "L_Elbow": {"rot": (0, 0, 12)},
    }
    charge_end = {
        "Pelvis": {"rot": (0, 0, -2)},
        "Spine": {"rot": (2, 0, 0)},
        "R_Shoulder": {"rot": (-2, -2, 74)},
        "R_Elbow": {"rot": (0, -2, -36)},
        "R_Hand": {"rot": (0, -4, 2)},
        "L_Shoulder": {"rot": (-12, 0, 26)},
        "L_Elbow": {"rot": (0, 0, 20)},
        "Head": {"rot": (0, 0, 0)},
    }
    release_a = {
        "Pelvis": {"loc": (0, 0, 0.02), "rot": (0, 0, -4)},
        "Spine": {"rot": (-4, 0, -2)},
        "Chest": {"rot": (0, 0, -2)},
        "R_Shoulder": {"rot": (-5, -5, 82)},
        "R_Elbow": {"rot": (0, -4, -10)},
        "R_Hand": {"rot": (0, -8, -14)},
        "L_Shoulder": {"rot": (-18, 0, -6)},
        "L_Elbow": {"rot": (0, 0, -8)},
        "L_Knee": {"rot": (-8, 0, 0)},
        "R_Knee": {"rot": (-8, 0, 0)},
        "L_Ankle": {"loc": (0, 0, 0.025)},
        "R_Ankle": {"loc": (0, 0, 0.025)},
        "Head": {"rot": (-3, 0, 4)},
    }
    release_b = {
        **release_a,
        "Pelvis": {"loc": (0, 0, 0.04), "rot": (0, 0, -5)},
        "Spine": {"rot": (-9, 0, -4)},
        "Chest": {"rot": (0, 0, -4)},
        "R_Shoulder": {"rot": (-7, -8, 84)},
        "R_Elbow": {"rot": (0, -5, -4)},
        "R_Hand": {"rot": (0, -10, -18)},
        "L_Shoulder": {"rot": (-20, 0, -10)},
        "L_Elbow": {"rot": (0, 0, -14)},
        "L_Knee": {"rot": (-10, 0, 0)},
        "R_Knee": {"rot": (-10, 0, 0)},
        "L_Ankle": {"loc": (0, 0, 0.04)},
        "R_Ankle": {"loc": (0, 0, 0.04)},
        "Head": {"rot": (-4, 0, 6)},
    }
    release_c = {
        **release_b,
        "Spine": {"rot": (-10, 0, -3)},
        "R_Shoulder": {"rot": (-8, -10, 84)},
        "R_Elbow": {"rot": (0, -6, 0)},
        "R_Hand": {"rot": (0, -12, -20)},
        "L_Shoulder": {"rot": (-22, 0, -12)},
        "L_Elbow": {"rot": (0, 0, -18)},
        "Head": {"rot": (-5, 0, 8)},
    }
    recover = {
        "Pelvis": {"rot": (0, 0, 1)},
        "Spine": {"rot": (-4, 0, -1)},
        "R_Shoulder": {"rot": (-16, 0, 15)},
        "R_Elbow": {"rot": (6, 0, -42)},
        "R_Hand": {"rot": (0, 0, -4)},
        "L_Shoulder": {"rot": (-20, 0, 4)},
        "L_Elbow": {"rot": (0, 0, -4)},
        "Head": {"rot": (-1, 0, 2)},
    }
    settle = {
        "Pelvis": {"rot": (0, 0, 0)},
        "Spine": {"rot": (0, 0, 0)},
        "Chest": {"rot": (0, 0, 0)},
        "R_Shoulder": {"rot": (-28, 0, 2)},
        "R_Elbow": {"rot": (0, 0, -8)},
        "L_Shoulder": {"rot": (-28, 0, -2)},
        "L_Elbow": {"rot": (0, 0, 8)},
        "Head": {"rot": (0, 0, 0)},
    }

    poses = {
        1: neutral,
        4: attract,
        8: attract,
        9: charge_a,
        10: charge_b,
        11: charge_c,
        12: charge_end,
        13: release_a,
        14: release_b,
        15: release_c,
        16: recover,
        24: settle,
        30: neutral,
    }
    for frame, overrides in poses.items():
        bpy.context.scene.frame_set(frame)
        reset_to_neutral(armature, pose)
        apply_pose(armature, overrides)
        key_bones(action, armature, frame)

    for curve in get_fcurves(action):
        for key in curve.keyframe_points:
            linear = key.co.x < 15
            key.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    mark_clip(
        action,
        name="Attack",
        end=30,
        semantic="cloud charge flows into the glove, releases a powerful shot, then reforms behind Zeus",
        anticipation=8,
        release=13,
        follow_through=24,
        points=("POINT_Attack_Target", "POINT_R_Hand", "POINT_Cloud_Anchor"),
    )


def author_cloud_attack(cloud):
    cloud.animation_data_clear()
    action = replace_action("Cloud_Attack")
    cloud.animation_data_create()
    cloud.animation_data.action = action
    cloud.rotation_mode = "XYZ"
    frames = [
        (1, (0.08, 0.06, 0.25), (1.0, 1.0, 1.0), 0),
        # Blender and glTF use different up/forward conventions.  These
        # values are deliberately authored in Blender space so the exported
        # Cloud.position lands on the open right glove in the game runtime.
        (4, (-0.264, -0.022, -7.982), (0.82, 0.82, 0.82), -8),
        (8, (1.672, -0.234, -3.640), (0.10, 0.10, 0.10), -16),
        (9, (1.708, 0.041, -3.743), (0.08, 0.08, 0.08), -16),
        (12, (1.261, 0.993, -4.272), (0.06, 0.06, 0.06), -16),
        (13, (0.320, 1.424, -4.720), (0.06, 0.06, 0.06), -16),
        (15, (0.34, 0.30, -0.10), (0.08, 0.08, 0.08), 12),
        (16, (0.34, 0.30, -0.10), (0.90, 0.90, 0.90), 12),
        (18, (0.30, 0.18, -0.02), (1.50, 1.50, 1.50), 18),
        (22, (0.22, 0.10, 0.16), (1.16, 1.08, 1.16), 8),
        (26, (0.14, 0.07, 0.24), (1.04, 1.0, 1.04), 3),
        (30, (0.08, 0.06, 0.25), (1.0, 1.0, 1.0), 0),
    ]
    for frame, location, scale, yaw in frames:
        bpy.context.scene.frame_set(frame)
        cloud.location = location
        cloud.rotation_euler = (0.0, 0.0, math.radians(yaw))
        cloud.scale = scale
        cloud.keyframe_insert("location", frame=frame, group="Cloud_Attack")
        cloud.keyframe_insert("rotation_euler", frame=frame, group="Cloud_Attack")
        cloud.keyframe_insert("scale", frame=frame, group="Cloud_Attack")
    for curve in get_fcurves(action):
        for key in curve.keyframe_points:
            linear = key.co.x < 15
            key.interpolation = "LINEAR" if linear else "BEZIER"
            if not linear:
                key.handle_left_type = "AUTO_CLAMPED"
                key.handle_right_type = "AUTO_CLAMPED"
    mark_clip(
        action,
        name="Cloud_Attack",
        end=30,
        semantic="cloud flows into the glove, vanishes during charge, then reforms behind Zeus after the shot",
        anticipation=8,
        release=13,
        follow_through=24,
        points=("POINT_Cloud_Anchor", "POINT_R_Hand"),
    )


def update_report():
    if not REPORT.exists():
        return
    data = json.loads(REPORT.read_text(encoding="utf-8"))
    for clip in data.get("animation_clips", []):
        if clip.get("name") == "Attack":
            clip["frame_end"] = 30
            clip["fps"] = FPS
    REPORT.write_text(json.dumps(data, indent=2), encoding="utf-8")


def main():
    bpy.ops.wm.open_mainfile(filepath=os.fspath(MASTER))
    armature = bpy.data.objects["BrockZeus_Rig"]
    cloud = bpy.data.objects["Cloud"]
    refine_idle_pose()
    repair_wrist_seams()
    repair_wrist_bone_pivots(armature)
    remove_wrist_bridges(armature)
    align_wrist_finger_assemblies()
    add_wrist_skin_overlaps(armature)
    author_character_attack(armature)
    author_cloud_attack(cloud)
    update_report()
    bpy.context.scene.render.fps = FPS
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(MASTER), check_existing=False)
    print("BROCK_ZEUS_ATTACK_REFINEMENT_OK attack_frames=1..30 cloud_frames=1..30")


if __name__ == "__main__":
    main()
