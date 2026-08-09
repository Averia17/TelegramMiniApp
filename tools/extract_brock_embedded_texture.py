"""Recover Brock's authored PNG from the pre-bootstrap runtime GLB."""

from __future__ import annotations

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "artifacts" / "brock-zeus_base.before-component-debug.glb"
OUTPUT = (
    ROOT
    / "frontend"
    / "assets-source"
    / "heroes"
    / "brock-zeus"
    / "source"
    / "brock_zeus_tex.png"
)


def main():
    data = GLB.read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    document = json.loads(data[json_start : json_start + json_length])
    image = next(
        item for item in document["images"] if item.get("mimeType") == "image/png"
    )
    view = document["bufferViews"][image["bufferView"]]
    binary_start = json_start + json_length
    binary_start += (4 - binary_start % 4) % 4
    binary_start += 8  # BIN chunk length and type
    start = binary_start + view["byteOffset"]
    end = start + view["byteLength"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(data[start:end])
    print(f"extracted:{OUTPUT} bytes={end - start}")


if __name__ == "__main__":
    main()
