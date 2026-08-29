"""Build and validate immutable release manifests."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone

from deploy.changed_services import BUILDABLE_SERVICES
from deploy.release_manifest import merge_image_digests


def required_build_units(
    plan: Mapping[str, object], previous_manifest: Mapping[str, object] | None
) -> list[str]:
    """Return image units that must be built for this release."""

    if not previous_manifest or not isinstance(
        previous_manifest.get("images"), Mapping
    ):
        return list(BUILDABLE_SERVICES)
    requested = plan.get("build", [])
    if not isinstance(requested, list):
        raise ValueError("deployment plan build must be a list")
    allowed = set(BUILDABLE_SERVICES)
    unknown = [str(unit) for unit in requested if str(unit) not in allowed]
    if unknown:
        raise ValueError(f"unknown build units: {', '.join(unknown)}")
    missing = [
        unit for unit in BUILDABLE_SERVICES if not previous_manifest["images"].get(unit)
    ]
    return [unit for unit in BUILDABLE_SERVICES if unit in requested or unit in missing]


def build_release_manifest(
    *,
    tag: str,
    commit: str,
    plan: Mapping[str, object],
    previous_manifest: Mapping[str, object] | None,
    built_images: Mapping[str, str],
    config_sha256: str | None = None,
) -> dict[str, object]:
    images = merge_image_digests(previous_manifest, built_images)
    missing = [unit for unit in BUILDABLE_SERVICES if unit not in images]
    if missing:
        raise ValueError(f"manifest is missing image digests: {', '.join(missing)}")

    previous_tag = None if not previous_manifest else previous_manifest.get("tag")
    return {
        "schema_version": 1,
        "tag": tag,
        "commit": commit,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "previous_tag": previous_tag,
        "images": images,
        "build_units": list(plan.get("build", [])),
        "recreate_units": list(plan.get("recreate", [])),
        "full_reconcile": bool(plan.get("full_reconcile", False)),
        "config_sha256": config_sha256,
    }
