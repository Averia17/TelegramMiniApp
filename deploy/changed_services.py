"""Identify the smallest production deployment units affected by a diff."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import PurePosixPath

SERVICE_NAMES = ("account", "battle", "bot", "shop", "leaderboard", "party", "news")
BUILDABLE_SERVICES = SERVICE_NAMES + ("frontend", "nginx")
RUNTIME_RECREATE_ORDER = SERVICE_NAMES + ("frontend", "nginx")


def _normalise(path: str) -> str:
    return path.strip().replace("\\", "/").lstrip("./")


def classify_paths(
    paths: list[str], environment: str = "production"
) -> dict[str, list[str]]:
    """Return deployment unit -> changed paths, ignoring unrelated files."""

    classified: dict[str, list[str]] = defaultdict(list)
    production = environment.lower() == "production"

    for raw_path in paths:
        path = _normalise(raw_path)
        if not path:
            continue
        parts = PurePosixPath(path).parts

        if production and (
            path == "docker-compose.yml"
            or path.endswith("/docker-compose.yml")
            or path == "nginx/dev.conf"
        ):
            continue
        if not production and (
            path == "docker-compose.prod.yml"
            or path.endswith("/docker-compose.prod.yml")
            or path == "nginx/prod.conf"
        ):
            continue
        if production and path == "docker-compose.prod.yml":
            classified["platform"].append(path)
            continue
        if not production and path == "docker-compose.yml":
            classified["platform"].append(path)
            continue

        if parts and parts[0] in SERVICE_NAMES:
            classified[parts[0]].append(path)
        elif parts and parts[0] == "frontend":
            classified["frontend"].append(path)
        elif parts and parts[0] == "nginx":
            if not production and path == "nginx/prod.conf":
                continue
            classified["nginx"].append(path)
        elif parts and parts[0] == "observability":
            classified["observability"].append(path)

    return {unit: sorted(changes) for unit, changes in sorted(classified.items())}


def affected_units(
    paths: list[str], environment: str = "production"
) -> dict[str, object]:
    """Calculate build/recreate sets without touching containers or images."""

    changes = classify_paths(paths, environment)
    full_reconcile = "platform" in changes

    if full_reconcile:
        # A root Compose change may alter dependencies, networks, or stateful
        # service wiring. Reconcile all containers, but still reuse the exact
        # image digests from the release manifest; this is not a rebuild.
        build = [service for service in BUILDABLE_SERVICES if service in changes]
        recreate = list(RUNTIME_RECREATE_ORDER) + ["prometheus", "grafana"]
    else:
        build = [service for service in BUILDABLE_SERVICES if service in changes]
        recreate_set = set(build)
        if "frontend" in changes:
            # Current production uses frontend-dist shared with nginx. Until
            # static assets move into an immutable nginx image, nginx must be
            # reloaded when the frontend build changes.
            recreate_set.add("nginx")
        if "observability" in changes:
            recreate_set.update(("prometheus", "grafana"))
        recreate = [
            service
            for service in RUNTIME_RECREATE_ORDER + ("prometheus", "grafana")
            if service in recreate_set
        ]

    return {
        "environment": environment,
        "build": build,
        "recreate": recreate,
        "full_reconcile": full_reconcile,
        "changes": changes,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", default="production")
    parser.add_argument(
        "paths", nargs="*", help="Changed paths; stdin is used when omitted"
    )
    args = parser.parse_args()
    paths = args.paths or sys.stdin.read().splitlines()
    print(json.dumps(affected_units(paths, args.environment), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
