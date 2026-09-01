"""Build and validate immutable release manifests."""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime, timezone

from deploy.changed_services import BUILDABLE_SERVICES, RUNTIME_RECREATE_ORDER
from deploy.release_manifest import merge_image_digests

IMMUTABLE_IMAGE_REF = re.compile(r"^[^@\s]+@sha256:[0-9a-fA-F]{64}$")
RELEASE_TAG = re.compile(r"^v\d+\.\d+\.\d+$")
CONFIG_HASH = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_RECREATE_UNITS = set(RUNTIME_RECREATE_ORDER) | {"prometheus", "grafana"}


def is_immutable_image_ref(value: object) -> bool:
    return isinstance(value, str) and bool(IMMUTABLE_IMAGE_REF.fullmatch(value))


def validate_release_manifest(manifest: Mapping[str, object]) -> None:
    """Fail closed on manifests that could deploy the wrong runtime."""

    schema_version = manifest.get("schema_version")
    if schema_version != 1 or isinstance(schema_version, bool):
        raise ValueError("unsupported release manifest schema")
    tag = manifest.get("tag")
    if not isinstance(tag, str) or not RELEASE_TAG.fullmatch(tag):
        raise ValueError("invalid release manifest tag")
    commit = manifest.get("commit")
    if not isinstance(commit, str) or not commit.strip():
        raise ValueError("release manifest commit is required")

    images = manifest.get("images")
    if not isinstance(images, Mapping):
        raise ValueError("release manifest images must be an object")
    missing = [unit for unit in BUILDABLE_SERVICES if not images.get(unit)]
    if missing:
        raise ValueError(f"manifest is missing image digests: {', '.join(missing)}")
    unknown_images = sorted(set(images) - set(BUILDABLE_SERVICES))
    if unknown_images:
        raise ValueError(
            f"manifest has unknown image units: {', '.join(unknown_images)}"
        )
    invalid_images = [
        unit for unit in BUILDABLE_SERVICES if not is_immutable_image_ref(images[unit])
    ]
    if invalid_images:
        raise ValueError(
            "manifest contains non-immutable image reference: "
            + ", ".join(invalid_images)
        )

    config_hash = manifest.get("config_sha256")
    if not isinstance(config_hash, str) or not CONFIG_HASH.fullmatch(config_hash):
        raise ValueError("release manifest config_sha256 must be a 64-character hash")

    validated_units: dict[str, list[str]] = {}
    for field, allowed in (
        ("build_units", set(BUILDABLE_SERVICES)),
        ("recreate_units", ALLOWED_RECREATE_UNITS),
    ):
        units = manifest.get(field)
        if not isinstance(units, list) or any(
            not isinstance(unit, str) or unit not in allowed for unit in units
        ):
            raise ValueError(f"release manifest {field} contains an invalid unit")
        if len(units) != len(set(units)):
            raise ValueError(f"release manifest {field} contains duplicate units")
        validated_units[field] = units

    if not set(validated_units["build_units"]).issubset(
        validated_units["recreate_units"]
    ):
        raise ValueError("built units must be recreated by the release")

    full_reconcile = manifest.get("full_reconcile")
    if not isinstance(full_reconcile, bool):
        raise ValueError("release manifest full_reconcile must be boolean")
    if (
        full_reconcile
        and set(validated_units["recreate_units"]) != ALLOWED_RECREATE_UNITS
    ):
        raise ValueError("full_reconcile must include every runtime unit")


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
    manifest = {
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
    validate_release_manifest(manifest)
    return manifest
