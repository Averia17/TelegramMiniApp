"""Validate signed staged-rollout and rollback evidence before release approval."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from generate_combat_profile import profile_fingerprint
from validate_combat_playtest import validate_playtest_report
from validate_combat_profile import read_profile


REQUIRED_STAGES = ("stage0", "stage1", "stage2", "stage3")
COMMIT_PATTERN = re.compile(r"^[0-9a-fA-F]{40}$")
FINGERPRINT_PATTERN = re.compile(r"^[0-9a-fA-F]{64}$")
REQUIRED_HISTORICAL_METRICS = (
    "ttk",
    "fullAmmoDeletion",
    "reloadDeadTime",
    "skillConversion",
    "botIdleRetreat",
    "resourceContest",
    "matchDuration",
    "winRate",
)


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_nonnegative_int(value):
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_placeholder(value):
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    return normalized.startswith("replace-with") or (normalized.startswith("<") and normalized.endswith(">"))


def _require_string(errors, value, path):
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path} must be a non-empty string")
    elif _is_placeholder(value):
        errors.append(f"{path} must contain captured evidence, not a placeholder")


def _require_evidence(errors, evidence, path, base_dir, require_files):
    if not isinstance(evidence, list) or not evidence or not all(
        isinstance(item, str) and item.strip() for item in evidence
    ):
        errors.append(f"{path} must contain at least one path or URL")
        return
    if any(_is_placeholder(item) for item in evidence):
        errors.append(f"{path} must contain captured paths or URLs, not placeholders")
        return
    if not require_files:
        return
    root = Path(base_dir or ".")
    for item in evidence:
        if "://" in item:
            continue
        candidate = Path(item)
        if not candidate.is_absolute():
            candidate = root / candidate
        if not candidate.is_file():
            errors.append(f"{path} file does not exist: {item}")


def _validate_release_manifest(errors, manifest, expected_revision, expected_fingerprint, base_dir, require_files):
    path = "releaseManifest"
    if not isinstance(manifest, dict):
        errors.append(f"{path} must be an object")
        return
    if manifest.get("releaseEligible") is not True:
        errors.append(f"{path}.releaseEligible must be true")
    if manifest.get("workingTreeClean") is not True:
        errors.append(f"{path}.workingTreeClean must be true")
    commit = manifest.get("gitCommit")
    if not isinstance(commit, str) or not COMMIT_PATTERN.fullmatch(commit):
        errors.append(f"{path}.gitCommit must be a 40-character commit hash")
    manifest_path = manifest.get("manifest")
    _require_string(errors, manifest_path, f"{path}.manifest")
    if not require_files or not isinstance(manifest_path, str) or "://" in manifest_path:
        return None
    candidate = Path(manifest_path)
    if not candidate.is_absolute():
        candidate = Path(base_dir or ".") / candidate
    if not candidate.is_file():
        errors.append(f"{path}.manifest file does not exist: {manifest_path}")
        return None
    try:
        archived = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path}.manifest could not be read: {exc}")
        return None
    if archived.get("releaseEligible") is not True:
        errors.append(f"{path}.manifest releaseEligible must be true")
    if archived.get("profileRevision") != expected_revision:
        errors.append(f"{path}.manifest profileRevision mismatch")
    if archived.get("combatProfileFingerprint") != expected_fingerprint:
        errors.append(f"{path}.manifest combatProfileFingerprint mismatch")
    if archived.get("gitCommit") != commit:
        errors.append(f"{path}.manifest gitCommit mismatch")
    return archived


def _validate_local_playtest_report(errors, report_path, profile, base_dir, require_files):
    if not require_files or not isinstance(report_path, str) or "://" in report_path:
        return
    candidate = Path(report_path)
    if not candidate.is_absolute():
        candidate = Path(base_dir or ".") / candidate
    if not candidate.is_file():
        return
    try:
        playtest_report = json.loads(candidate.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"stages.stage2.playtestReport could not be read: {exc}")
        return
    for error in validate_playtest_report(
        playtest_report,
        current_profile=profile,
        base_dir=candidate.parent,
        require_files=True,
    ):
        errors.append(f"stages.stage2.playtestReport: {error}")


def _validate_stage_fields(errors, stage, path, required_fields):
    if not isinstance(stage, dict):
        errors.append(f"{path} must be an object")
        return False
    if stage.get("status") != "pass":
        errors.append(f"{path}.status must be pass")
    for field in required_fields:
        if field not in stage:
            errors.append(f"{path}.{field} is required")
    return True


def validate_rollout_report(report, current_profile=None, base_dir=None, require_files=False):
    """Return human-readable errors; an empty list means rollout evidence is complete."""
    errors = []
    if not isinstance(report, dict):
        return ["report must be a JSON object"]

    profile = current_profile or read_profile()
    expected_revision = profile.get("combatRulesVersion", profile.get("profileRevision"))
    expected_fingerprint = profile_fingerprint(profile)
    if report.get("reportVersion") != 1:
        errors.append("reportVersion must be 1")
    if report.get("profileId") != profile.get("profileId"):
        errors.append(f"profileId mismatch: expected {profile.get('profileId')!r}")
    if report.get("combatRulesVersion") != expected_revision:
        errors.append(f"combatRulesVersion mismatch: expected {expected_revision!r}")
    if report.get("combatProfileFingerprint") != expected_fingerprint:
        errors.append("combatProfileFingerprint mismatch")

    operator = report.get("operator")
    if not isinstance(operator, dict):
        errors.append("operator must be an object")
    else:
        _require_string(errors, operator.get("operatorId"), "operator.operatorId")
        if operator.get("signed") is not True:
            errors.append("operator.signed must be true")
        _require_string(errors, operator.get("signature"), "operator.signature")
        _require_string(errors, operator.get("capturedAt"), "operator.capturedAt")

    release_manifest_data = _validate_release_manifest(
        errors,
        report.get("releaseManifest"),
        expected_revision,
        expected_fingerprint,
        base_dir,
        require_files,
    )

    stages = report.get("stages")
    if not isinstance(stages, dict):
        errors.append("stages must be an object")
    else:
        for stage_id in REQUIRED_STAGES:
            if stage_id not in stages:
                errors.append(f"stages.{stage_id} is required")
        if _validate_stage_fields(
            errors,
            stages.get("stage0"),
            "stages.stage0",
            ("replayCycles", "stateHashStable", "outlierCount", "soloTeamMatrixPassed"),
        ):
            stage = stages["stage0"]
            if not isinstance(stage.get("replayCycles"), int) or stage["replayCycles"] < 20:
                errors.append("stages.stage0.replayCycles must be >= 20")
            if stage.get("stateHashStable") is not True:
                errors.append("stages.stage0.stateHashStable must be true")
            if stage.get("outlierCount") != 0:
                errors.append("stages.stage0.outlierCount must be 0")
            if stage.get("soloTeamMatrixPassed") is not True:
                errors.append("stages.stage0.soloTeamMatrixPassed must be true")
        if _validate_stage_fields(
            errors,
            stages.get("stage1"),
            "stages.stage1",
            ("visualCases", "consoleErrors", "pageErrors", "playwrightProcessesClosed"),
        ):
            stage = stages["stage1"]
            if not isinstance(stage.get("visualCases"), int) or stage["visualCases"] < 49:
                errors.append("stages.stage1.visualCases must be >= 49")
            if stage.get("consoleErrors") != []:
                errors.append("stages.stage1.consoleErrors must be empty")
            if stage.get("pageErrors") != []:
                errors.append("stages.stage1.pageErrors must be empty")
            if stage.get("playwrightProcessesClosed") is not True:
                errors.append("stages.stage1.playwrightProcessesClosed must be true")
        if _validate_stage_fields(
            errors,
            stages.get("stage2"),
            "stages.stage2",
            ("humanPlaytestValid", "playtestReport"),
        ):
            stage = stages["stage2"]
            if stage.get("humanPlaytestValid") is not True:
                errors.append("stages.stage2.humanPlaytestValid must be true")
            _require_evidence(
                errors,
                [stage.get("playtestReport")],
                "stages.stage2.playtestReport",
                base_dir,
                require_files,
            )
            _validate_local_playtest_report(
                errors,
                stage.get("playtestReport"),
                profile,
                base_dir,
                require_files,
            )
        if _validate_stage_fields(
            errors,
            stages.get("stage3"),
            "stages.stage3",
            (
                "sampledMatchShare",
                "affectedMatches",
                "abortGatesTriggered",
                "historicalBaseline",
            ),
        ):
            stage = stages["stage3"]
            share = stage.get("sampledMatchShare")
            if not _is_number(share) or not 0 < share <= 1:
                errors.append("stages.stage3.sampledMatchShare must be > 0 and <= 1")
            if not isinstance(stage.get("affectedMatches"), int) or stage["affectedMatches"] < 1:
                errors.append("stages.stage3.affectedMatches must be >= 1")
            if stage.get("abortGatesTriggered") != []:
                errors.append("stages.stage3.abortGatesTriggered must be empty")
            baseline = stage.get("historicalBaseline")
            baseline_path = "stages.stage3.historicalBaseline"
            if not isinstance(baseline, dict):
                errors.append(f"{baseline_path} must be an object")
            else:
                _require_evidence(
                    errors,
                    [baseline.get("source")],
                    f"{baseline_path}.source",
                    base_dir,
                    require_files,
                )
                baseline_revision = baseline.get("profileRevision")
                if not isinstance(baseline_revision, str) or not baseline_revision.strip():
                    errors.append(f"{baseline_path}.profileRevision must be a non-empty string")
                elif baseline_revision == expected_revision:
                    errors.append(
                        f"{baseline_path}.profileRevision must differ from current rules version"
                    )
                baseline_fingerprint = baseline.get("profileFingerprint")
                if not isinstance(baseline_fingerprint, str) or not FINGERPRINT_PATTERN.fullmatch(
                    baseline_fingerprint
                ):
                    errors.append(
                        f"{baseline_path}.profileFingerprint must be a 64-hex fingerprint"
                    )
                metrics = baseline.get("metrics")
                if not isinstance(metrics, list) or any(
                    not isinstance(metric, str) or not metric.strip() for metric in metrics
                ):
                    errors.append(
                        f"{baseline_path}.metrics must list the required comparison metrics"
                    )
                else:
                    missing_metrics = sorted(set(REQUIRED_HISTORICAL_METRICS) - set(metrics))
                    if missing_metrics:
                        errors.append(
                            f"{baseline_path}.metrics is missing required metrics: {missing_metrics}"
                        )
                comparison = baseline.get("comparison")
                comparison_path = f"{baseline_path}.comparison"
                if not isinstance(comparison, dict):
                    errors.append(f"{comparison_path} must be an object")
                else:
                    missing_comparisons = sorted(
                        set(REQUIRED_HISTORICAL_METRICS) - set(comparison)
                    )
                    if missing_comparisons:
                        errors.append(
                            f"{comparison_path} is missing required metrics: {missing_comparisons}"
                        )
                    for metric in REQUIRED_HISTORICAL_METRICS:
                        values = comparison.get(metric)
                        metric_path = f"{comparison_path}.{metric}"
                        if not isinstance(values, dict):
                            errors.append(f"{metric_path} must contain baseline, candidate and delta")
                            continue
                        baseline_value = values.get("baseline")
                        candidate_value = values.get("candidate")
                        delta_value = values.get("delta")
                        if not all(
                            _is_number(value)
                            for value in (baseline_value, candidate_value, delta_value)
                        ):
                            errors.append(f"{metric_path} values must be numeric")
                            continue
                        if abs((candidate_value - baseline_value) - delta_value) > 1e-6:
                            errors.append(f"{metric_path}.delta must equal candidate - baseline")

    rollback = report.get("rollback")
    if not isinstance(rollback, dict):
        errors.append("rollback must be an object")
    else:
        if rollback.get("status") != "pass":
            errors.append("rollback.status must be pass")
        _require_string(errors, rollback.get("rollbackRef"), "rollback.rollbackRef")
        if not isinstance(rollback.get("rollbackDurationMs"), int) or rollback["rollbackDurationMs"] <= 0:
            errors.append("rollback.rollbackDurationMs must be > 0")
        if not _is_nonnegative_int(rollback.get("affectedRooms")):
            errors.append("rollback.affectedRooms must be a non-negative integer")
        if rollback.get("errorCount") != 0:
            errors.append("rollback.errorCount must be 0")
        if rollback.get("postRollbackStateHashesMatch") is not True:
            errors.append("rollback.postRollbackStateHashesMatch must be true")
        counters = rollback.get("postRollbackCounters")
        if not isinstance(counters, dict) or not counters:
            errors.append("rollback.postRollbackCounters must be a non-empty object")
        elif any(
            not isinstance(key, str)
            or not key.strip()
            or not _is_nonnegative_int(value)
            for key, value in counters.items()
        ):
            errors.append(
                "rollback.postRollbackCounters must contain non-negative integer values"
            )
        if isinstance(release_manifest_data, dict):
            manifest_rollback = release_manifest_data.get("rollback")
            if not isinstance(manifest_rollback, dict):
                errors.append(
                    "releaseManifest.manifest must contain a validated rollback object"
                )
            else:
                if manifest_rollback.get("errors") != []:
                    errors.append(
                        "releaseManifest.manifest rollback validation errors must be empty"
                    )
                if manifest_rollback.get("ref") != rollback.get("rollbackRef"):
                    errors.append(
                        "releaseManifest.manifest rollback ref must match rollback.rollbackRef"
                    )
                if manifest_rollback.get("profileRevision") != expected_revision:
                    errors.append(
                        "releaseManifest.manifest rollback profileRevision mismatch"
                    )
                if manifest_rollback.get("fingerprint") != expected_fingerprint:
                    errors.append(
                        "releaseManifest.manifest rollback fingerprint mismatch"
                    )
        _require_evidence(
            errors,
            rollback.get("evidence"),
            "rollback.evidence",
            base_dir,
            require_files,
        )

    if report.get("abortGatesTriggered") != []:
        errors.append("abortGatesTriggered must be empty")
    _require_evidence(errors, report.get("evidence"), "evidence", base_dir, require_files)
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--require-files", action="store_true")
    parser.add_argument("--base-dir", type=Path)
    args = parser.parse_args()
    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
        errors = validate_rollout_report(
            report,
            base_dir=args.base_dir or args.report.parent,
            require_files=args.require_files,
        )
        result = {"report": str(args.report), "valid": not errors, "errors": errors}
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        result = {"report": str(args.report), "valid": False, "errors": [str(exc)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
