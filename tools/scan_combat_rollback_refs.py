"""Scan historical profile/catalog refs for a usable combat rollback target."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from validate_combat_release import historical_preflight


ROOT = Path(__file__).resolve().parents[1]
REPORT_NAME = "combat-rollback-ref-scan.json"


def historical_profile_refs() -> list[str]:
    result = subprocess.run(
        [
            "git",
            "log",
            "--all",
            "--format=%H",
            "--",
            "docs/combat-profile.json",
            "docs/hero-catalog.json",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ValueError("could not enumerate historical profile refs")
    return list(dict.fromkeys(line.strip() for line in result.stdout.splitlines() if line.strip()))


def scan_refs(refs: list[str], run_go_tests: bool = False) -> dict:
    passing = []
    rejected = []
    for ref in refs:
        try:
            result = historical_preflight(ref, run_go_tests)
        except (OSError, ValueError, KeyError) as exc:
            rejected.append({"ref": ref, "errors": [str(exc)]})
            continue
        errors = result.get("errors", [])
        if errors:
            rejected.append({"ref": ref, "errors": errors})
            continue
        passing.append({
            "ref": ref,
            "profileRevision": result.get("profileRevision"),
            "fingerprint": result.get("fingerprint"),
        })
    return {
        "scanVersion": 1,
        "source": "git log --all on docs/combat-profile.json and docs/hero-catalog.json",
        "checkedRefs": len(refs),
        "passingRefs": passing,
        "rejectedRefs": rejected,
    }


def write_scan_report(output_dir: Path, report: dict) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / REPORT_NAME
    if destination.exists():
        raise FileExistsError(f"rollback scan report already exists: {destination}")
    with destination.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="optional directory in which to create a create-once scan report",
    )
    parser.add_argument(
        "--go-tests",
        action="store_true",
        help="run archived Go tests for every historical ref",
    )
    args = parser.parse_args()
    try:
        report = scan_refs(historical_profile_refs(), args.go_tests)
        destination = write_scan_report(args.output_dir, report) if args.output_dir else None
    except (OSError, ValueError, KeyError) as exc:
        parser.error(str(exc))
    output = {"report": str(destination) if destination else None, **report}
    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
