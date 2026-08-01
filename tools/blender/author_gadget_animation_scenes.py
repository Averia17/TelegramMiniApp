"""Author only the hero-specific Gadget scenes from the skill timing spec."""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import author_frame_by_frame_animation_scenes as authored

authored = importlib.reload(authored)


def main() -> None:
    manifest = json.loads(authored.MANIFEST.read_text(encoding="utf-8"))
    report = []
    for hero in manifest["heroes"]:
        master = authored.SOURCE / hero / f"{hero}.blend"
        target = authored.SOURCE / hero / "scenes" / "gadget.blend"
        report.append(authored.author_gadget_scene(hero, master, target))
    out = ROOT / "artifacts" / "hero-gadget-animation-scene-pack.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"scenes": len(report), "output": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
