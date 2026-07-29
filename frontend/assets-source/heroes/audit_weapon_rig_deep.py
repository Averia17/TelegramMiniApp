"""Deep read-only audit of an opened hero .blend."""

import json
import sys
from pathlib import Path

import bpy


def fcurves(action):
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", ()):
                result.extend(bag.fcurves)
    return result


armature = next(
    (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None
)
report = {
    "blend": bpy.data.filepath,
    "blender": bpy.app.version_string,
    "armature": armature.name if armature else None,
    "bones": [],
    "actions": [],
    "objects": [],
}
if armature:
    for bone in armature.data.bones:
        report["bones"].append(
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "deform": bone.use_deform,
                "head": list(bone.head_local),
                "tail": list(bone.tail_local),
            }
        )
for action in bpy.data.actions:
    curves = fcurves(action)
    paths = sorted({curve.data_path for curve in curves})
    report["actions"].append(
        {
            "name": action.name,
            "frame_range": list(action.frame_range),
            "curves": len(curves),
            "pose_bones": sorted(
                {
                    path.split('pose.bones["', 1)[1].split('"]', 1)[0]
                    for path in paths
                    if 'pose.bones["' in path
                }
            ),
        }
    )
for obj in bpy.context.scene.objects:
    if obj.type not in {"MESH", "EMPTY", "ARMATURE"}:
        continue
    report["objects"].append(
        {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "parent_type": obj.parent_type,
            "parent_bone": obj.parent_bone,
            "role": obj.get("attachment_role"),
            "matrix_world": [list(row) for row in obj.matrix_world],
        }
    )

output = (
    Path(sys.argv[sys.argv.index("--") + 1])
    if "--" in sys.argv
    else Path("weapon_rig_deep_audit.json")
)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(f"DEEP_AUDIT {output}")
