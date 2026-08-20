"""Author semantic pose accents into every canonical hero skill scene.

The existing imported motion remains the base.  This pass adds local-space
pose accents across the whole clip, so anticipation/release/follow-through are
readable without introducing root motion that would fight gameplay movement.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Euler

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend" / "assets-source" / "heroes"
SPEC_PATH = Path(__file__).with_name("hero_skill_animation_semantics.json")
ACTION_NAMES = {"attack": "Attack", "super": "super", "gadget": "Gadget"}


def d(x=0, y=0, z=0):
    return (math.radians(x), math.radians(y), math.radians(z))


# Local-space offsets at semantic anchors.  Values are intentionally compact:
# they reinforce the action already in the source instead of replacing the
# character-specific animation with a generic procedural motion.
ACCENTS = {
    "mandy": {
        "attack": {
            "anticipation": {
                "chest_s_033": d(0, -10, -18),
                "R_shoulder_s_061": d(-28, 0, -18),
                "L_shoulder_s_044": d(12, 0, 10),
            },
            "release": {
                "chest_s_033": d(0, 8, 24),
                "R_shoulder_s_061": d(42, 0, 25),
                "R_elbow_s_062": d(0, -28, 0),
                "L_shoulder_s_044": d(-16, 0, -12),
            },
            "follow_through": {
                "chest_s_033": d(0, 4, 12),
                "R_shoulder_s_061": d(20, 0, 12),
                "R_elbow_s_062": d(0, -15, 0),
            },
        },
        "super": {
            "anticipation": {
                "chest_s_033": d(-8, 0, -8),
                "R_shoulder_s_061": d(-24, 0, -18),
                "L_shoulder_s_044": d(-18, 0, 18),
            },
            "release": {
                "chest_s_033": d(15, 0, 0),
                "R_shoulder_s_061": d(48, 0, 8),
                "L_shoulder_s_044": d(40, 0, -8),
                "head_s_035": d(-8, 0, 0),
            },
            "follow_through": {
                "chest_s_033": d(9, 0, 0),
                "R_elbow_s_062": d(0, -20, 0),
                "L_elbow_s_045": d(0, 20, 0),
            },
        },
        "gadget": {
            "anticipation": {"hips_s_02": d(-8, 0, 0), "chest_s_033": d(8, 0, 0)},
            "release": {
                "chest_s_033": d(-4, 0, 0),
                "R_shoulder_s_061": d(-12, 0, 24),
                "L_shoulder_s_044": d(-12, 0, -24),
                "R_elbow_s_062": d(0, -30, 0),
                "L_elbow_s_045": d(0, 30, 0),
            },
            "follow_through": {
                "chest_s_033": d(-3, 0, 0),
                "R_shoulder_s_061": d(-8, 0, 18),
                "L_shoulder_s_044": d(-8, 0, -18),
            },
        },
    },
    "kaze": {
        "attack": {
            "anticipation": {
                "chest_s": d(0, 0, -18),
                "L_shoulder_s": d(-20, 0, -25),
                "R_shoulder_s": d(18, 0, 25),
            },
            "release": {
                "chest_s": d(0, 0, 22),
                "L_shoulder_s": d(38, 0, 28),
                "R_shoulder_s": d(-34, 0, -28),
                "head_s": d(0, 0, -8),
            },
            "follow_through": {
                "chest_s": d(0, 0, -20),
                "L_shoulder_s": d(-26, 0, -22),
                "R_shoulder_s": d(30, 0, 22),
            },
        },
        "super": {
            "anticipation": {
                "hips_s": d(-14, 0, 0),
                "chest_s": d(18, 0, 0),
                "L_shoulder_s": d(-18, 0, -16),
                "R_shoulder_s": d(-18, 0, 16),
            },
            "release": {
                "hips_s": d(8, 0, 0),
                "chest_s": d(-26, 0, 0),
                "L_shoulder_s": d(34, 0, -8),
                "R_shoulder_s": d(34, 0, 8),
                "head_s": d(12, 0, 0),
            },
            "follow_through": {
                "chest_s": d(-14, 0, 0),
                "L_elbow_s": d(0, -20, 0),
                "R_elbow_s": d(0, 20, 0),
            },
        },
        "gadget": {
            "anticipation": {
                "chest_s": d(8, 0, 0),
                "head_s": d(-8, 0, 0),
                "L_shoulder_s": d(0, 0, -12),
                "R_shoulder_s": d(0, 0, 12),
            },
            "release": {
                "chest_s": d(18, 0, 0),
                "head_s": d(-16, 0, 0),
                "L_shoulder_s": d(-24, 0, 28),
                "R_shoulder_s": d(-24, 0, -28),
            },
            "follow_through": {"chest_s": d(10, 0, 0), "head_s": d(-10, 0, 0)},
        },
    },
    "wukong-mico": {
        "attack": {
            "anticipation": {
                "chest_s": d(0, 0, -20),
                "R_shoulder_s": d(-30, 0, -20),
                "L_shoulder_s": d(16, 0, 16),
                "Tail_01_s": d(0, 20, 0),
            },
            "release": {
                "chest_s": d(0, 0, 28),
                "R_shoulder_s": d(44, 0, 26),
                "L_shoulder_s": d(-24, 0, -20),
                "MIC_Handel_s": d(0, 34, 0),
            },
            "follow_through": {
                "chest_s": d(0, 0, 16),
                "R_shoulder_s": d(24, 0, 14),
                "Tail_01_s": d(0, -18, 0),
            },
        },
        "super": {
            "anticipation": {
                "chest_s": d(-10, 0, 0),
                "R_shoulder_s": d(-26, 0, -18),
                "L_shoulder_s": d(-26, 0, 18),
            },
            "release": {
                "chest_s": d(0, 0, 18),
                "R_shoulder_s": d(28, 0, 22),
                "L_shoulder_s": d(28, 0, -22),
                "MIC_Handel_s": d(0, 40, 0),
            },
            "follow_through": {
                "chest_s": d(0, 0, -16),
                "R_shoulder_s": d(18, 0, -18),
                "L_shoulder_s": d(18, 0, 18),
                "Tail_01_s": d(0, -24, 0),
            },
        },
        "gadget": {
            "anticipation": {"hips_s": d(-10, 0, 0), "chest_s": d(10, 0, 0)},
            "release": {
                "chest_s": d(-8, 0, 0),
                "R_shoulder_s": d(-18, 0, 24),
                "L_shoulder_s": d(-18, 0, -24),
                "MIC_Handel_s": d(0, -22, 0),
            },
            "follow_through": {
                "chest_s": d(14, 0, 0),
                "R_shoulder_s": d(26, 0, 16),
                "L_shoulder_s": d(26, 0, -16),
            },
        },
    },
    "needle": {
        "attack": {
            "anticipation": {
                "Chest": d(0, -12, -14),
                "RightArm": d(-28, 0, -18),
                "Flower": d(0, -24, 0),
            },
            "release": {
                "Chest": d(0, 10, 20),
                "RightArm": d(40, 0, 22),
                "Flower": d(0, 34, 0),
            },
            "follow_through": {"Chest": d(0, 5, 10), "RightArm": d(18, 0, 10)},
        },
        "super": {
            "anticipation": {
                "Chest": d(-12, 0, 0),
                "LeftArm": d(-32, 0, -20),
                "RightArm": d(-32, 0, 20),
                "Flower": d(0, -28, 0),
            },
            "release": {
                "Chest": d(28, 0, 0),
                "LeftArm": d(42, 0, -12),
                "RightArm": d(42, 0, 12),
                "Flower": d(0, 38, 0),
            },
            "follow_through": {"Chest": d(16, 0, 0), "Head": d(-10, 0, 0)},
        },
        "gadget": {
            "anticipation": {"Chest": d(8, 0, 0), "Flower": d(0, -18, 0)},
            "release": {
                "Chest": d(-8, 0, 0),
                "LeftArm": d(-24, 0, -18),
                "RightArm": d(-24, 0, 18),
                "Flower": d(0, 24, 0),
            },
            "follow_through": {"Chest": d(-5, 0, 0), "Head": d(-8, 0, 0)},
        },
    },
    "fairy-mina": {
        "attack": {
            "anticipation": {
                "chest_s": d(8, 0, 0),
                "L_shoulder_s": d(-22, 0, 18),
                "R_shoulder_s": d(-22, 0, -18),
                "L_wing_up_s": d(0, -16, 0),
                "R_wing_up_s": d(0, 16, 0),
            },
            "release": {
                "chest_s": d(-8, 0, 0),
                "L_shoulder_s": d(34, 0, -30),
                "R_shoulder_s": d(34, 0, 30),
                "L_wing_up_s": d(0, 26, 0),
                "R_wing_up_s": d(0, -26, 0),
            },
            "follow_through": {
                "L_shoulder_s": d(18, 0, -18),
                "R_shoulder_s": d(18, 0, 18),
            },
        },
        "super": {
            "anticipation": {
                "chest_s": d(10, 0, 0),
                "L_shoulder_s": d(-20, 0, 22),
                "R_shoulder_s": d(-20, 0, -22),
                "L_wing_down_s": d(0, 18, 0),
                "R_wing_down_s": d(0, -18, 0),
            },
            "release": {
                "chest_s": d(-10, 0, 0),
                "L_shoulder_s": d(28, 0, -18),
                "R_shoulder_s": d(28, 0, 18),
                "L_wing_up_s": d(0, 30, 0),
                "R_wing_up_s": d(0, -30, 0),
            },
            "follow_through": {"chest_s": d(-4, 0, 0), "head_s": d(-8, 0, 0)},
        },
        "gadget": {
            "anticipation": {
                "chest_s": d(12, 0, 0),
                "L_shoulder_s": d(-28, 0, 24),
                "R_shoulder_s": d(-28, 0, -24),
                "L_wing_down_s": d(0, 24, 0),
                "R_wing_down_s": d(0, -24, 0),
            },
            "release": {
                "chest_s": d(-14, 0, 0),
                "L_shoulder_s": d(42, 0, -36),
                "R_shoulder_s": d(42, 0, 36),
                "L_wing_up_s": d(0, 34, 0),
                "R_wing_up_s": d(0, -34, 0),
            },
            "follow_through": {
                "L_shoulder_s": d(20, 0, -20),
                "R_shoulder_s": d(20, 0, 20),
            },
        },
    },
    "persephone-lumi": {
        "attack": {
            "anticipation": {
                "chest_s": d(0, -10, -14),
                "R_shoulder_s": d(-28, 0, -20),
                "L_shoulder_s": d(-14, 0, 14),
                "R_weapon_s": d(0, -22, 0),
            },
            "release": {
                "chest_s": d(0, 8, 20),
                "R_shoulder_s": d(40, 0, 24),
                "L_shoulder_s": d(20, 0, -14),
                "R_weapon_s": d(0, 30, 0),
            },
            "follow_through": {"chest_s": d(0, 4, 10), "R_shoulder_s": d(20, 0, 12)},
        },
        "super": {
            "anticipation": {
                "chest_s": d(-10, 0, 0),
                "R_shoulder_s": d(-34, 0, -18),
                "L_shoulder_s": d(-24, 0, 18),
                "cape_0_s": d(12, 0, 0),
            },
            "release": {
                "chest_s": d(24, 0, 0),
                "R_shoulder_s": d(44, 0, 14),
                "L_shoulder_s": d(34, 0, -14),
                "R_weapon_s": d(0, 36, 0),
            },
            "follow_through": {
                "chest_s": d(14, 0, 0),
                "head_s": d(-8, 0, 0),
                "cape_0_s": d(-12, 0, 0),
            },
        },
        "gadget": {
            "anticipation": {
                "chest_s": d(8, 0, 0),
                "R_shoulder_s": d(-22, 0, -20),
                "L_shoulder_s": d(-22, 0, 20),
            },
            "release": {
                "chest_s": d(-12, 0, 0),
                "R_shoulder_s": d(34, 0, 28),
                "L_shoulder_s": d(34, 0, -28),
                "R_weapon_s": d(0, -32, 0),
            },
            "follow_through": {
                "chest_s": d(-5, 0, 0),
                "R_wrist_s": d(0, 26, 0),
                "L_wrist_s": d(0, -26, 0),
            },
        },
    },
    "brock-zeus": {
        "attack": {
            "anticipation": {
                "Chest": d(0, -10, -16),
                "R_Shoulder": d(-26, 0, -18),
                "L_Shoulder": d(12, 0, 12),
            },
            "release": {
                "Chest": d(0, 8, 22),
                "R_Shoulder": d(38, 0, 24),
                "R_Elbow": d(0, -24, 0),
                "L_Shoulder": d(-16, 0, -12),
            },
            "follow_through": {"Chest": d(0, 4, 10), "R_Shoulder": d(18, 0, 12)},
        },
        "super": {
            "anticipation": {
                "Chest": d(-10, 0, 0),
                "R_Shoulder": d(-34, 0, -18),
                "L_Shoulder": d(-20, 0, 18),
            },
            "release": {
                "Chest": d(12, 0, 14),
                "R_Shoulder": d(48, 0, 26),
                "R_Elbow": d(0, -20, 0),
                "Head": d(-8, 0, 0),
            },
            "follow_through": {
                "Chest": d(10, 0, -14),
                "L_Shoulder": d(42, 0, -24),
                "R_Shoulder": d(28, 0, 16),
            },
        },
        "gadget": {
            "anticipation": {
                "Chest": d(8, 0, 0),
                "R_Shoulder": d(-24, 0, -18),
                "L_Shoulder": d(-16, 0, 16),
            },
            "release": {
                "Chest": d(-8, 0, 0),
                "R_Shoulder": d(30, 0, 16),
                "R_Elbow": d(0, -28, 0),
                "L_Wrist": d(0, 24, 0),
            },
            "follow_through": {"Chest": d(-4, 0, 0), "R_Shoulder": d(20, 0, 10)},
        },
    },
}


def find_action(name: str):
    return next(
        (
            action
            for action in bpy.data.actions
            if action.name.casefold().split(".")[0] == name.casefold()
        ),
        None,
    )


def mix(a, b, amount):
    return tuple(a[index] + (b[index] - a[index]) * amount for index in range(3))


def sampled_offsets(contract, accents, frame):
    anchors = [
        (contract["frames"][0], {}),
        (contract["frames"][1], accents["anticipation"]),
        (contract["release"], accents["release"]),
        (contract["frames"][-2], accents["follow_through"]),
        (contract["frames"][-1], {}),
    ]
    anchors.sort(key=lambda item: item[0])
    left, right = anchors[0], anchors[-1]
    for index in range(len(anchors) - 1):
        if anchors[index][0] <= frame <= anchors[index + 1][0]:
            left, right = anchors[index], anchors[index + 1]
            break
    span = max(1, right[0] - left[0])
    amount = (frame - left[0]) / span
    bones = set(left[1]) | set(right[1])
    zero = (0.0, 0.0, 0.0)
    return {
        bone: mix(left[1].get(bone, zero), right[1].get(bone, zero), amount)
        for bone in bones
    }


def author_scene(hero, clip, contract, revision):
    path = SOURCE / hero / "scenes" / f"{clip}.blend"
    bpy.ops.wm.open_mainfile(filepath=os.fspath(path))
    scene = bpy.context.scene
    if scene.get("semantic_revision") == revision:
        print(f"SKIP {hero}/{clip}: already revision {revision}")
        return
    armature = next((obj for obj in scene.objects if obj.type == "ARMATURE"), None)
    action = find_action(ACTION_NAMES[clip])
    if armature is None or action is None:
        raise RuntimeError(f"{hero}/{clip}: missing armature or canonical action")
    armature.animation_data_create()
    armature.animation_data.action = action

    accents = ACCENTS[hero][clip]
    target_bones = set().union(*(pose.keys() for pose in accents.values()))
    missing = target_bones - set(armature.pose.bones.keys())
    if missing:
        raise RuntimeError(
            f"{hero}/{clip}: accent bones are missing: {sorted(missing)}"
        )

    start, end = contract["frames"][0], contract["frames"][-1]
    base = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for bone_name in target_bones:
            bone = armature.pose.bones[bone_name]
            base[(frame, bone_name)] = (
                bone.rotation_mode,
                bone.rotation_quaternion.copy(),
                bone.rotation_euler.copy(),
            )

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for bone_name, offset in sampled_offsets(contract, accents, frame).items():
            bone = armature.pose.bones[bone_name]
            mode, quaternion, euler = base[(frame, bone_name)]
            if mode == "QUATERNION":
                bone.rotation_quaternion = (
                    quaternion @ Euler(offset, "XYZ").to_quaternion()
                )
                bone.keyframe_insert(
                    "rotation_quaternion", frame=frame, group=bone_name
                )
            else:
                bone.rotation_euler = Euler(
                    tuple(euler[index] + offset[index] for index in range(3)),
                    (
                        mode
                        if mode in {"XYZ", "XZY", "YXZ", "YZX", "ZXY", "ZYX"}
                        else "XYZ"
                    ),
                )
                bone.keyframe_insert("rotation_euler", frame=frame, group=bone_name)

    scene.timeline_markers.clear()
    scene.timeline_markers.new("anticipation", frame=contract["frames"][1])
    scene.timeline_markers.new("release", frame=contract["release"])
    scene.timeline_markers.new("follow_through", frame=contract["frames"][-2])
    scene["skill_semantic"] = contract["semantic"]
    scene["semantic_revision"] = revision
    scene["authoring_status"] = "semantic-authored"
    scene.frame_start = start
    scene.frame_end = end
    scene.render.fps = 30
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.fspath(path), check_existing=False)
    print(f"AUTHORED {hero}/{clip}")


def main():
    spec = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
    requested = os.environ.get("HERO_FILTER")
    heroes = spec["heroes"]
    if requested:
        heroes = {requested: heroes[requested]}
    for hero, clips in heroes.items():
        for clip, contract in clips.items():
            author_scene(hero, clip, contract, spec["schema"])


if __name__ == "__main__":
    main()
