"""SemVer tag calculation for the release command."""

from __future__ import annotations

import re

TAG_PATTERN = re.compile(
    r"^v(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)$"
)


def next_release_tag(
    tags: list[str],
    *,
    major: int,
    minor: int,
    requested_patch: int | None = None,
) -> str:
    if major < 0 or minor < 0:
        raise ValueError("major and minor must be non-negative")

    existing = set(tags)
    patches = []
    for tag in tags:
        match = TAG_PATTERN.fullmatch(tag.strip())
        if match and int(match["major"]) == major and int(match["minor"]) == minor:
            patches.append(int(match["patch"]))

    patch = (
        requested_patch if requested_patch is not None else max(patches, default=0) + 1
    )
    if patch <= 0:
        raise ValueError("patch must be positive")

    tag = f"v{major}.{minor}.{patch}"
    if tag in existing:
        raise ValueError(f"release tag already exists: {tag}")
    return tag
