"""Capture immutable combat release evidence after release preflight.

The clean mode is intentionally strict: it requires a clean working tree and
an independently passing rollback ref. ``--allow-dirty`` is only a diagnostic
mode and marks the manifest as ineligible for release evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any

from validate_combat_release import (
    current_preflight,
    historical_preflight,
)


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_NAME = "combat-release-manifest.json"
EVIDENCE_FILES = (
    "docs/combat-profile.json",
    "docs/combat-profile.fingerprint.json",
    "docs/hero-catalog.json",
    "docs/hero-combat-contracts.json",
    "battle/model/game/combat_profile_generated.go",
    "frontend/src/components/BattleGame/combatProfile.generated.js",
)


def sha256_file(relative: str) -> str:
    return hashlib.sha256((ROOT / relative).read_bytes()).hexdigest().upper()


def git_output(*arguments: str) -> str:
    result = subprocess.run(
        ["git", *arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"git {' '.join(arguments)} failed")
    return result.stdout.strip()


def build_manifest(
    *,
    rollback_ref: str | None = None,
    allow_dirty: bool = False,
    run_rollback_tests: bool = False,
) -> dict[str, Any]:
    preflight = current_preflight(require_clean=not allow_dirty)
    if preflight.get("errors"):
        raise ValueError("current release preflight failed: " + "; ".join(preflight["errors"]))
    if not allow_dirty and not rollback_ref:
        raise ValueError("clean release capture requires --rollback-ref")

    rollback: dict[str, Any] | None = None
    if rollback_ref:
        rollback = historical_preflight(rollback_ref, run_rollback_tests)
        if rollback.get("errors"):
            raise ValueError(
                f"rollback ref {rollback_ref} failed: "
                + "; ".join(rollback["errors"])
            )

    missing = [relative for relative in EVIDENCE_FILES if not (ROOT / relative).is_file()]
    if missing:
        raise ValueError("release evidence file is missing: " + ", ".join(missing))

    status = git_output("status", "--porcelain")
    manifest: dict[str, Any] = {
        "manifestVersion": 1,
        "releaseEligible": not allow_dirty,
        "gitCommit": git_output("rev-parse", "HEAD"),
        "workingTreeClean": not bool(status),
        "profileRevision": preflight["profileRevision"],
        "combatProfileFingerprint": preflight["fingerprint"],
        "evidenceFiles": {
            relative: sha256_file(relative) for relative in EVIDENCE_FILES
        },
        "rollback": rollback,
    }
    return manifest


def write_manifest(output_dir: Path, manifest: dict[str, Any]) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / MANIFEST_NAME
    if destination.exists():
        raise FileExistsError(f"release manifest already exists: {destination}")
    with destination.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="new directory in which to create the one-time release manifest",
    )
    parser.add_argument(
        "--rollback-ref",
        help="approved rollback ref; required for a clean release capture",
    )
    parser.add_argument(
        "--allow-dirty",
        action="store_true",
        help="capture diagnostics only and mark releaseEligible=false",
    )
    parser.add_argument(
        "--go-tests",
        action="store_true",
        help="run the archived Go suite while validating the rollback ref",
    )
    args = parser.parse_args()
    try:
        manifest = build_manifest(
            rollback_ref=args.rollback_ref,
            allow_dirty=args.allow_dirty,
            run_rollback_tests=args.go_tests,
        )
        destination = write_manifest(args.output_dir, manifest)
    except (OSError, ValueError, KeyError) as exc:
        parser.error(str(exc))
    print(json.dumps({"manifest": str(destination), **manifest}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
