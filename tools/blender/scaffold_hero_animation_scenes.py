"""Compatibility entry point for the complete authored event scene pack.

Run with Blender's Python, for example:
  blender --background --python tools/blender/scaffold_hero_animation_scenes.py

The old scaffold only created three ability scenes and could leave suffixed
Actions such as ``Attack.001``. Keep the command stable, but delegate to the
canonical packager that materializes all ten runtime event scenes from real
master Actions without creating choreography.
"""

from __future__ import annotations

import runpy
from pathlib import Path


def main() -> None:
    runpy.run_path(
        str(Path(__file__).with_name("author_full_animation_scenes.py")),
        run_name="__main__",
    )


if __name__ == "__main__":
    main()
