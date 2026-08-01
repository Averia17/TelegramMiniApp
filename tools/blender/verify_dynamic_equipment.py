"""Round-trip verification for dynamic-equipment staging GLBs."""

import json
import sys
from pathlib import Path

import bpy

root = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
items = []


def reset():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


for path in sorted(root.rglob("*.glb")):
    item = {"file": path.name, "valid": False, "issues": []}
    try:
        reset()
        bpy.ops.import_scene.gltf(filepath=str(path))
        meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
        armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
        if not meshes:
            item["issues"].append("no mesh")
        if path.name.endswith("_base.glb"):
            if not armatures:
                item["issues"].append("no armature")
            else:
                bones = armatures[0].data.bones
                for socket in ("weapon_socket_r", "weapon_socket_l"):
                    bone = bones.get(socket)
                    if bone is None:
                        item["issues"].append(f"missing {socket}")
                    elif bone.parent is None:
                        item["issues"].append(f"unparented {socket}")
            item["animations"] = sorted(action.name for action in bpy.data.actions)
        else:
            if armatures:
                item["issues"].append("weapon contains armature")
            parented = [obj.name for obj in meshes if obj.parent is not None]
            if parented:
                item["issues"].append(f"parented weapon meshes: {parented}")
        item["meshes"] = len(meshes)
        item["valid"] = not item["issues"]
    except Exception as exc:
        item["issues"].append(f"{type(exc).__name__}: {exc}")
    items.append(item)

report = {"valid": all(item["valid"] for item in items), "files": items}
(root / "roundtrip_report.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(json.dumps(report, ensure_ascii=False), flush=True)
raise SystemExit(0 if report["valid"] else 1)
