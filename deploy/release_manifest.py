"""Helpers for immutable release manifests."""

from __future__ import annotations

from collections.abc import Mapping


def merge_image_digests(
    previous_manifest: Mapping[str, object] | None,
    newly_built: Mapping[str, str],
) -> dict[str, str]:
    """Overlay newly built digests while preserving unchanged service images."""

    previous_images: object = (previous_manifest or {}).get("images", {})
    if not isinstance(previous_images, Mapping):
        previous_images = {}

    images = {
        str(service): str(digest)
        for service, digest in previous_images.items()
        if str(service).strip() and str(digest).strip()
    }
    for service, digest in newly_built.items():
        if not str(service).strip() or not str(digest).strip():
            raise ValueError("service and image digest must be non-empty")
        images[str(service)] = str(digest)
    return images
