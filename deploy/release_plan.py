"""Build a deterministic deployment plan from a Git revision range."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Iterable

from deploy.changed_services import (
    BUILDABLE_SERVICES,
    RUNTIME_RECREATE_ORDER,
    affected_units,
)
from deploy.manifest import required_build_units

ROOT = Path(__file__).resolve().parents[1]


def _git(*args: str) -> list[str]:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return [line for line in result.stdout.splitlines() if line.strip()]


def changed_paths(previous_tag: str | None, head: str = "HEAD") -> list[str]:
    """Return paths changed since the previous release.

    A first release has no safe diff base, so all tracked files are considered.
    This is intentional: the first manifest must contain every application image.
    """

    if previous_tag:
        return sorted(set(_git("diff", "--name-only", f"{previous_tag}..{head}")))
    return sorted(set(_git("ls-files")))


def build_plan(
    paths: Iterable[str],
    *,
    previous_manifest: dict[str, object] | None = None,
    environment: str = "production",
) -> dict[str, object]:
    affected = affected_units(list(paths), environment=environment)
    build = required_build_units(affected, previous_manifest)
    recreate = set(affected["recreate"])
    # A manifest from before a newly introduced service may not contain its
    # image yet. Build and start that missing unit even when the diff only
    # touched unrelated code; otherwise the next release event could not reach
    # the new service.
    previous_images = (previous_manifest or {}).get("images", {})
    if not isinstance(previous_images, dict):
        previous_images = {}
    recreate.update(
        unit
        for unit in build
        if unit in RUNTIME_RECREATE_ORDER and not previous_images.get(unit)
    )
    ordered_recreate = [unit for unit in RUNTIME_RECREATE_ORDER if unit in recreate]
    if "prometheus" in affected["recreate"]:
        ordered_recreate.append("prometheus")
    if "grafana" in affected["recreate"]:
        ordered_recreate.append("grafana")
    return {
        **affected,
        "build": build,
        "recreate": ordered_recreate,
        "build_all": not bool(previous_manifest and previous_manifest.get("images")),
        "application_units": list(BUILDABLE_SERVICES),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous-tag")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--previous-manifest", type=Path)
    parser.add_argument("--environment", default="production")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    previous_manifest = None
    if args.previous_manifest:
        previous_manifest = json.loads(
            args.previous_manifest.read_text(encoding="utf-8")
        )
    paths = changed_paths(args.previous_tag, args.head)
    payload = {
        "head": args.head,
        "previous_tag": args.previous_tag,
        "paths": paths,
        "plan": build_plan(
            paths,
            previous_manifest=previous_manifest,
            environment=args.environment,
        ),
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
