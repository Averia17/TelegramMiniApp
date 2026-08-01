"""Re-author only the standalone attack and super ability scenes."""

from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.fspath(Path(__file__).resolve().parent))
import author_frame_by_frame_animation_scenes as authoring

authoring = importlib.reload(authoring)
ROOT = authoring.ROOT
SOURCE = authoring.SOURCE
MANIFEST = authoring.MANIFEST


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    report = []
    for hero in manifest["heroes"]:
        master = SOURCE / hero / f"{hero}.blend"
        for clip in ("attack", "super"):
            report.append(
                authoring.author_scene(
                    hero,
                    clip,
                    master,
                    SOURCE / hero / "scenes" / f"{clip}.blend",
                )
            )
    output = ROOT / "artifacts" / "hero-attack-super-animation-scene-pack.json"
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "scenes": len(report),
                "total_authored_keys": sum(
                    item["authored_keyframes"] for item in report
                ),
                "output": os.fspath(output),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
