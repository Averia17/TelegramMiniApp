"""Create a complete immutable release manifest after image builds."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from deploy.manifest import build_release_manifest


def config_sha256(root: Path) -> str:
    """Hash production deployment configuration in stable path order."""

    paths = [
        root / "docker-compose.prod.yml",
        *sorted(root.glob("*/docker-compose.prod.yml")),
        root / "nginx" / "prod.conf",
    ]
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def create_manifest(
    *,
    tag: str,
    commit: str,
    plan: dict[str, object],
    built_images: dict[str, str],
    previous_manifest: dict[str, object] | None = None,
    root: Path | None = None,
) -> dict[str, object]:
    return build_release_manifest(
        tag=tag,
        commit=commit,
        plan=plan,
        previous_manifest=previous_manifest,
        built_images=built_images,
        config_sha256=config_sha256(root or Path(__file__).resolve().parents[1]),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--built-images", type=Path, required=True)
    parser.add_argument("--previous-manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    plan_payload = json.loads(args.plan.read_text(encoding="utf-8"))
    plan = plan_payload.get("plan", plan_payload)
    built_images = json.loads(args.built_images.read_text(encoding="utf-8"))
    previous = (
        json.loads(args.previous_manifest.read_text(encoding="utf-8"))
        if args.previous_manifest
        else None
    )
    manifest = create_manifest(
        tag=args.tag,
        commit=args.commit,
        plan=plan,
        built_images=built_images,
        previous_manifest=previous,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
