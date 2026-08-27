"""Run a release-level preflight for the combat profile or a git ref.

The normal profile validators operate on the current working tree. This tool
adds the missing release boundary: a historical ref is checked from its own
profile/catalog/source blobs and, optionally, its archived Go tree is tested.
It intentionally does not claim that a ref is deployable when any check fails.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any, Mapping


ROOT = Path(__file__).resolve().parents[1]
PROFILE_RELATIVE = "docs/combat-profile.json"
FINGERPRINT_RELATIVE = "docs/combat-profile.fingerprint.json"
CATALOG_RELATIVE = "docs/hero-catalog.json"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_combat_profile import (  # noqa: E402
    profile_fingerprint,
    validate_generated_artifact_blobs,
    validate_generated_artifacts,
)
from validate_combat_profile import validate_profile  # noqa: E402


def decode_json(blob: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(blob.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label} is not valid UTF-8 JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label} must contain a JSON object")
    return value


def sha256_hex(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest().upper()


def validate_profile_artifacts(
    profile: Mapping[str, Any],
    fingerprint_report: Mapping[str, Any],
    catalog: Mapping[str, Any],
    source_blobs: Mapping[str, bytes],
) -> list[str]:
    errors = list(validate_profile(dict(profile), dict(catalog)))
    computed_fingerprint = profile_fingerprint(dict(profile))
    if fingerprint_report.get("profileId") != profile.get("profileId"):
        errors.append("fingerprint report profileId differs from profile")
    if fingerprint_report.get("schemaVersion") != profile.get("schemaVersion"):
        errors.append("fingerprint report schemaVersion differs from profile")
    if fingerprint_report.get("profileRevision") != profile.get("profileRevision"):
        errors.append("fingerprint report profileRevision differs from profile")
    if fingerprint_report.get("fingerprint") != computed_fingerprint:
        errors.append(
            "fingerprint report is stale: "
            f"{fingerprint_report.get('fingerprint')} != {computed_fingerprint}"
        )

    for relative, expected in catalog.get("sourceFingerprints", {}).items():
        blob = source_blobs.get(relative)
        if blob is None:
            errors.append(f"catalog fingerprint source is missing: {relative}")
            continue
        actual = sha256_hex(blob)
        if actual != str(expected).upper():
            errors.append(f"catalog fingerprint is stale: {relative}")
    return errors


def validate_release_state(require_clean: bool, status_porcelain: str) -> list[str]:
    if require_clean and status_porcelain.strip():
        return ["release preflight requires a clean working tree"]
    return []


def working_tree_status() -> str:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError("could not inspect working tree status")
    return result.stdout


def current_preflight(require_clean: bool = False) -> dict[str, Any]:
    profile = decode_json((ROOT / PROFILE_RELATIVE).read_bytes(), PROFILE_RELATIVE)
    fingerprint = decode_json(
        (ROOT / FINGERPRINT_RELATIVE).read_bytes(), FINGERPRINT_RELATIVE
    )
    catalog = decode_json((ROOT / CATALOG_RELATIVE).read_bytes(), CATALOG_RELATIVE)
    sources = {
        relative: (ROOT / relative).read_bytes()
        for relative in catalog.get("sourceFingerprints", {})
        if (ROOT / relative).exists()
    }
    errors = validate_profile_artifacts(profile, fingerprint, catalog, sources)
    errors.extend(
        validate_generated_artifact_blobs(
            profile,
            {
                "battle/model/game/combat_profile_generated.go": (
                    ROOT / "battle/model/game/combat_profile_generated.go"
                ).read_bytes(),
                "frontend/src/components/BattleGame/combatProfile.generated.js": (
                    ROOT / "frontend/src/components/BattleGame/combatProfile.generated.js"
                ).read_bytes(),
            },
        )
    )
    errors.extend(validate_generated_artifacts())
    status = working_tree_status()
    errors.extend(validate_release_state(require_clean, status))
    return {
        "target": "working-tree",
        "profileRevision": profile.get("profileRevision"),
        "fingerprint": fingerprint.get("fingerprint"),
        "workingTreeClean": not bool(status.strip()),
        "errors": errors,
    }


def git_blob(ref: str, relative: str) -> bytes:
    result = subprocess.run(
        ["git", "show", f"{ref}:{relative}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"{ref}:{relative} is unavailable")
    return result.stdout


def historical_preflight(ref: str, run_go_tests: bool) -> dict[str, Any]:
    profile = decode_json(git_blob(ref, PROFILE_RELATIVE), f"{ref}:{PROFILE_RELATIVE}")
    fingerprint = decode_json(
        git_blob(ref, FINGERPRINT_RELATIVE), f"{ref}:{FINGERPRINT_RELATIVE}"
    )
    catalog = decode_json(git_blob(ref, CATALOG_RELATIVE), f"{ref}:{CATALOG_RELATIVE}")
    sources = {}
    for relative in catalog.get("sourceFingerprints", {}):
        try:
            sources[relative] = git_blob(ref, relative)
        except ValueError:
            pass
    errors = validate_profile_artifacts(profile, fingerprint, catalog, sources)
    historical_views = {}
    for relative in (
        "battle/model/game/combat_profile_generated.go",
        "frontend/src/components/BattleGame/combatProfile.generated.js",
    ):
        try:
            historical_views[relative] = git_blob(ref, relative)
        except ValueError:
            pass
    errors.extend(validate_generated_artifact_blobs(profile, historical_views))
    result: dict[str, Any] = {
        "target": "git-ref",
        "ref": ref,
        "profileRevision": profile.get("profileRevision"),
        "fingerprint": fingerprint.get("fingerprint"),
        "errors": errors,
    }
    if run_go_tests:
        result["goTest"] = run_archived_go_tests(ref)
        if result["goTest"]["exitCode"] != 0:
            errors.append("archived Go suite failed")
    return result


def extract_archive(ref: str, destination: Path) -> None:
    archive = subprocess.run(
        ["git", "archive", ref], cwd=ROOT, capture_output=True, check=False
    )
    if archive.returncode != 0:
        raise ValueError(f"could not archive git ref {ref}")
    with tarfile.open(fileobj=io.BytesIO(archive.stdout), mode="r:") as tar:
        root = destination.resolve()
        for member in tar.getmembers():
            target = (destination / member.name).resolve()
            if root not in target.parents and target != root:
                raise ValueError(f"unsafe archive member: {member.name}")
        tar.extractall(destination)


def run_archived_go_tests(ref: str) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="combat-release-") as directory:
        destination = Path(directory)
        try:
            extract_archive(ref, destination)
        except ValueError as exc:
            return {"exitCode": 1, "error": str(exc)}
        result = subprocess.run(
            ["go", "test", "./...", "-count=1"],
            cwd=destination / "battle",
            capture_output=True,
            text=True,
            check=False,
        )
        output = (result.stdout + result.stderr).strip()
        return {
            "exitCode": result.returncode,
            "outputTail": output[-4000:],
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--ref",
        help="validate a git ref from archived blobs instead of the working tree",
    )
    parser.add_argument(
        "--go-tests",
        action="store_true",
        help="also extract the ref and run go test ./... -count=1",
    )
    parser.add_argument(
        "--rollback-ref",
        help="also validate a complete rollback ref while checking the working tree",
    )
    parser.add_argument(
        "--require-clean",
        action="store_true",
        help="fail the working-tree preflight when git status is not clean",
    )
    args = parser.parse_args()
    try:
        if args.rollback_ref and args.ref:
            raise ValueError("--rollback-ref cannot be combined with --ref")
        if args.ref:
            result = historical_preflight(args.ref, args.go_tests)
        else:
            result = current_preflight(args.require_clean)
            if args.rollback_ref:
                rollback = historical_preflight(args.rollback_ref, args.go_tests)
                result["rollback"] = rollback
                result["errors"].extend(
                    f"rollback ref {args.rollback_ref}: {error}"
                    for error in rollback.get("errors", [])
                )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        result = {"target": args.ref or "working-tree", "errors": [str(exc)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 1 if result.get("errors") else 0


if __name__ == "__main__":
    raise SystemExit(main())
