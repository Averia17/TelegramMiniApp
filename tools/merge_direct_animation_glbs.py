"""Merge focused-scene GLB animations into one runtime GLB per hero."""

from __future__ import annotations

import json
import os
import struct
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DIRECT = ROOT / "artifacts" / "runtime-direct-clips"
OUTPUT = ROOT / "frontend" / "public" / "assets" / "heroes" / "output_heroes"
MERGED_OUTPUT = ROOT / "artifacts" / "runtime-merged"
HEROES = (
    "brock-zeus",
    "damian",
    "fairy-mina",
    "kaze",
    "mandy",
    "needle",
    "persephone-lumi",
    "wukong-mico",
)
CLIPS = (
    "idle",
    "run",
    "attack",
    "super",
    "aim",
    "aim-super",
    "hit",
    "death",
    "spawn",
    "victory",
    "gadget",
)
ANIMATION_NAMES = {
    "idle": "idle",
    "run": "run",
    "attack": "Attack",
    "super": "super",
    "aim": "Aim",
    "aim-super": "AimSuper",
    "hit": "hit",
    "death": "death",
    "spawn": "Spawn",
    "victory": "Victory",
    "gadget": "Gadget",
}
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or declared_length != len(data):
        raise ValueError(f"Invalid GLB header: {path}")
    position = 12
    json_chunk = None
    binary_chunk = None
    while position < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, position)
        position += 8
        chunk = data[position : position + chunk_length]
        position += chunk_length
        if chunk_type == JSON_CHUNK:
            json_chunk = json.loads(chunk.rstrip(b" \t\r\n").decode("utf-8"))
        elif chunk_type == BIN_CHUNK:
            binary_chunk = chunk
    if json_chunk is None or binary_chunk is None:
        raise ValueError(f"GLB is missing JSON or BIN chunk: {path}")
    return json_chunk, binary_chunk


def model_signature(gltf: dict[str, Any]) -> tuple[Any, ...]:
    nodes = tuple(node.get("name") for node in gltf.get("nodes", []))
    skins = tuple(
        (skin.get("joints"), skin.get("skeleton"), skin.get("inverseBindMatrices"))
        for skin in gltf.get("skins", [])
    )
    meshes = tuple(mesh.get("name") for mesh in gltf.get("meshes", []))
    return nodes, skins, meshes, len(gltf.get("materials", []))


def append_aligned(binary: bytearray, payload: bytes) -> int:
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    binary.extend(payload)
    return offset


def clone_animation(
    source_gltf: dict[str, Any],
    source_bin: bytes,
    destination_gltf: dict[str, Any],
    destination_bin: bytearray,
    name: str,
) -> dict[str, Any]:
    accessor_map: dict[int, int] = {}
    buffer_view_map: dict[int, int] = {}
    source_accessors = source_gltf.get("accessors", [])
    source_buffer_views = source_gltf.get("bufferViews", [])
    destination_accessors = destination_gltf.setdefault("accessors", [])
    destination_buffer_views = destination_gltf.setdefault("bufferViews", [])

    def clone_accessor(index: int) -> int:
        if index in accessor_map:
            return accessor_map[index]
        source_accessor = source_accessors[index]
        source_view_index = source_accessor["bufferView"]
        if source_view_index not in buffer_view_map:
            source_view = source_buffer_views[source_view_index]
            source_offset = source_view.get("byteOffset", 0)
            source_length = source_view["byteLength"]
            destination_offset = append_aligned(
                destination_bin, source_bin[source_offset : source_offset + source_length]
            )
            destination_view = dict(source_view)
            destination_view["buffer"] = 0
            destination_view["byteOffset"] = destination_offset
            destination_buffer_views.append(destination_view)
            buffer_view_map[source_view_index] = len(destination_buffer_views) - 1
        destination_accessor = dict(source_accessor)
        destination_accessor["bufferView"] = buffer_view_map[source_view_index]
        destination_accessors.append(destination_accessor)
        accessor_map[index] = len(destination_accessors) - 1
        return accessor_map[index]

    source_animations = source_gltf.get("animations", [])
    if len(source_animations) != 1:
        raise ValueError("Focused scene must contain exactly one animation")
    source_animation = source_animations[0]
    sampler_map: dict[int, int] = {}
    samplers = []
    for sampler in source_animation.get("samplers", []):
        samplers.append(
            {
                **sampler,
                "input": clone_accessor(sampler["input"]),
                "output": clone_accessor(sampler["output"]),
            }
        )
        sampler_map[len(samplers) - 1] = len(samplers) - 1
    channels = [
        {**channel, "sampler": sampler_map[channel["sampler"]]}
        for channel in source_animation.get("channels", [])
    ]
    animation = {key: value for key, value in source_animation.items() if key not in {"name", "samplers", "channels"}}
    animation["name"] = name
    animation["samplers"] = samplers
    animation["channels"] = channels
    return animation


def write_glb(path: Path, gltf: dict[str, Any], binary: bytearray) -> None:
    while len(binary) % 4:
        binary.append(0)
    gltf["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    while len(json_bytes) % 4:
        json_bytes += b" "
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    output = bytearray(struct.pack("<III", 0x46546C67, 2, total_length))
    output.extend(struct.pack("<II", len(json_bytes), JSON_CHUNK))
    output.extend(json_bytes)
    output.extend(struct.pack("<II", len(binary), BIN_CHUNK))
    output.extend(binary)
    temporary = path.with_name(f".{path.name}.tmp")
    temporary.write_bytes(output)
    temporary.replace(path)


def merge(hero: str) -> None:
    base_gltf, base_bin = read_glb(DIRECT / hero / "idle.glb")
    signature = model_signature(base_gltf)
    base_gltf["animations"] = []
    binary = bytearray(base_bin)
    for clip in CLIPS:
        source_path = DIRECT / hero / f"{clip}.glb"
        source_gltf, source_bin = read_glb(source_path)
        if model_signature(source_gltf) != signature:
            raise ValueError(f"Model structure mismatch in {source_path}")
        base_gltf["animations"].append(
            clone_animation(
                source_gltf,
                source_bin,
                base_gltf,
                binary,
                ANIMATION_NAMES[clip],
            )
        )
    destination_dir = Path(os.environ.get("MERGED_OUTPUT", MERGED_OUTPUT))
    destination = destination_dir / f"{hero}_base.glb"
    destination_dir.mkdir(parents=True, exist_ok=True)
    write_glb(destination, base_gltf, binary)
    print(f"MERGED {hero}: {len(base_gltf['animations'])} clips")


def main() -> None:
    requested = os.environ.get("HERO_FILTER")
    heroes = [hero for hero in HEROES if not requested or hero == requested]
    if requested and not heroes:
        raise RuntimeError(f"Unknown HERO_FILTER={requested!r}")
    for hero in heroes:
        merge(hero)


if __name__ == "__main__":
    main()
