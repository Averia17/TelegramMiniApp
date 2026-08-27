"""Create a current-version staged-rollout report template."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from generate_combat_profile import profile_fingerprint
from validate_combat_rollout import REQUIRED_HISTORICAL_METRICS
from validate_combat_profile import read_profile


def build_rollout_template() -> dict:
    profile = read_profile()
    return {
        "reportVersion": 1,
        "profileId": profile["profileId"],
        "combatRulesVersion": profile["profileRevision"],
        "combatProfileFingerprint": profile_fingerprint(profile),
        "operator": {
            "operatorId": "replace-with-operator-id",
            "signed": False,
            "signature": "replace-with-approval-id-or-signature",
            "capturedAt": "replace-with-iso-8601-timestamp",
        },
        "releaseManifest": {
            "manifest": "replace-with-clean-release-manifest-path-or-url",
            "releaseEligible": False,
            "workingTreeClean": False,
            "gitCommit": "replace-with-40-hex-commit",
        },
        "stages": {
            "stage0": {
                "status": "pass",
                "replayCycles": 20,
                "stateHashStable": True,
                "outlierCount": 0,
                "soloTeamMatrixPassed": True,
            },
            "stage1": {
                "status": "pass",
                "visualCases": 49,
                "consoleErrors": [],
                "pageErrors": [],
                "playwrightProcessesClosed": True,
            },
            "stage2": {
                "status": "not_run",
                "humanPlaytestValid": False,
                "playtestReport": "output/playtest/combat-clarity-<date>/report.json",
            },
            "stage3": {
                "status": "not_run",
                "sampledMatchShare": 0,
                "affectedMatches": 0,
                "abortGatesTriggered": [],
                "historicalBaseline": {
                    "source": "replace-with-historical-baseline-path-or-url",
                    "profileRevision": "replace-with-approved-previous-profile-revision",
                    "profileFingerprint": "replace-with-64-hex-approved-previous-profile-fingerprint",
                    "metrics": list(REQUIRED_HISTORICAL_METRICS),
                    "comparison": {
                        metric: {"baseline": None, "candidate": None, "delta": None}
                        for metric in REQUIRED_HISTORICAL_METRICS
                    },
                },
            },
        },
        "rollback": {
            "status": "not_run",
            "rollbackRef": "replace-with-approved-rollback-ref",
            "rollbackDurationMs": 0,
            "affectedRooms": 0,
            "errorCount": 0,
            "postRollbackStateHashesMatch": False,
            "postRollbackCounters": {},
            "evidence": ["replace-with-rollback-evidence-path-or-url"],
        },
        "evidence": [
            "tasks/combat-automated-gate-2026-08.md",
            "replace-with-staged-rollout-evidence-path-or-url",
        ],
        "abortGatesTriggered": [],
    }


def write_rollout_template(destination: Path, report: dict) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(f"rollout template already exists: {destination}")
    with destination.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=False)
        handle.write("\n")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        destination = write_rollout_template(args.output, build_rollout_template())
    except (OSError, KeyError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps({"template": str(destination)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
