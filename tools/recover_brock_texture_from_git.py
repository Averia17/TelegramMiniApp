"""Restore Brock Zeus' deleted authored texture from its last Git commit."""

from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "cc5729405179e7f0af57b42ed13f3428101726cf"
GIT_PATH = "frontend/assets-source/heroes/brock-zeus/textures/brock_zeus_tex.png"
OUTPUT = ROOT / GIT_PATH


def main():
    result = subprocess.run(
        ["git", "show", f"{COMMIT}:{GIT_PATH}"],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(result.stdout)
    print(f"restored:{OUTPUT} bytes={len(result.stdout)} commit={COMMIT}")


if __name__ == "__main__":
    main()
