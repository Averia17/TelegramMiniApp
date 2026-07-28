"""Remove render assets from a GLB that is used only as an AnimationClip source."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
GLB_MAGIC = 0x46546C67


def _align4(value: int) -> int:
    return (value + 3) & ~3


def _read_glb(path: Path) -> tuple[dict, bytes]:
    payload = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<III", payload)
    if magic != GLB_MAGIC or version != 2 or total_length != len(payload):
        raise ValueError(f"{path} is not a valid GLB 2.0 file")

    document = None
    binary = b""
    offset = 12
    while offset < len(payload):
        length, chunk_type = struct.unpack_from("<II", payload, offset)
        chunk = payload[offset + 8 : offset + 8 + length]
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.rstrip(b" \0").decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk
        offset += 8 + length
    if document is None:
        raise ValueError(f"{path} has no JSON chunk")
    return document, binary


def _animation_accessor_indices(document: dict) -> list[int]:
    indices = {
        sampler[key]
        for animation in document.get("animations", [])
        for sampler in animation.get("samplers", [])
        for key in ("input", "output")
    }
    return sorted(indices)


def strip_event_glb(path: Path) -> tuple[int, int]:
    document, binary = _read_glb(path)
    original_size = path.stat().st_size
    old_accessors = document.get("accessors", [])
    old_views = document.get("bufferViews", [])
    accessor_indices = _animation_accessor_indices(document)
    accessor_map = {old: new for new, old in enumerate(accessor_indices)}

    view_indices = sorted(
        {
            old_accessors[index]["bufferView"]
            for index in accessor_indices
            if "bufferView" in old_accessors[index]
        }
    )
    view_map = {old: new for new, old in enumerate(view_indices)}

    compact_binary = bytearray()
    compact_views = []
    for old_index in view_indices:
        source = old_views[old_index]
        start = source.get("byteOffset", 0)
        end = start + source["byteLength"]
        new_offset = _align4(len(compact_binary))
        compact_binary.extend(b"\0" * (new_offset - len(compact_binary)))
        compact_binary.extend(binary[start:end])
        compact = {
            key: value
            for key, value in source.items()
            if key not in {"buffer", "byteOffset", "target"}
        }
        compact.update({"buffer": 0, "byteOffset": new_offset})
        compact_views.append(compact)

    compact_accessors = []
    for old_index in accessor_indices:
        accessor = dict(old_accessors[old_index])
        if "bufferView" in accessor:
            accessor["bufferView"] = view_map[accessor["bufferView"]]
        compact_accessors.append(accessor)

    for animation in document.get("animations", []):
        for sampler in animation.get("samplers", []):
            sampler["input"] = accessor_map[sampler["input"]]
            sampler["output"] = accessor_map[sampler["output"]]

    for node in document.get("nodes", []):
        for key in ("mesh", "skin", "camera", "extensions"):
            node.pop(key, None)

    for key in (
        "meshes",
        "skins",
        "materials",
        "textures",
        "images",
        "samplers",
        "cameras",
        "extensions",
        "extensionsUsed",
        "extensionsRequired",
    ):
        document.pop(key, None)
    document["accessors"] = compact_accessors
    document["bufferViews"] = compact_views
    document["buffers"] = [{"byteLength": len(compact_binary)}]

    json_payload = json.dumps(
        document, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    json_payload += b" " * (_align4(len(json_payload)) - len(json_payload))
    compact_binary.extend(b"\0" * (_align4(len(compact_binary)) - len(compact_binary)))
    total_length = 12 + 8 + len(json_payload) + 8 + len(compact_binary)
    output = bytearray(struct.pack("<III", GLB_MAGIC, 2, total_length))
    output.extend(struct.pack("<II", len(json_payload), JSON_CHUNK))
    output.extend(json_payload)
    output.extend(struct.pack("<II", len(compact_binary), BIN_CHUNK))
    output.extend(compact_binary)
    path.write_bytes(output)
    return original_size, len(output)


if __name__ == "__main__":
    for argument in sys.argv[1:]:
        target = Path(argument)
        before, after = strip_event_glb(target)
        print(f"STRIPPED_EVENT_GLB {target} {before} -> {after} bytes")
