"""Render non-secret Compose interpolation variables for a release."""

from __future__ import annotations

import argparse
import json
from collections.abc import Mapping
from pathlib import Path

from deploy.changed_services import BUILDABLE_SERVICES

IMAGE_ENV_NAMES = {
    service: f"{service.upper()}_IMAGE" for service in BUILDABLE_SERVICES
}


def render_image_env(images: Mapping[str, str], tag: str, commit: str) -> str:
    missing = [
        service
        for service in BUILDABLE_SERVICES
        if not str(images.get(service, "")).strip()
    ]
    if missing:
        raise ValueError(f"missing image references: {', '.join(missing)}")

    lines = [
        f"{IMAGE_ENV_NAMES[service]}={images[service]}"
        for service in BUILDABLE_SERVICES
    ]
    lines.extend((f"APP_VERSION={tag}", f"GIT_SHA={commit}"))
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    rendered = render_image_env(manifest["images"], manifest["tag"], manifest["commit"])
    args.output.write_text(rendered, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
