"""Validate signed human combat-clarity evidence before rollout approval."""

import argparse
import json
from pathlib import Path

from generate_combat_profile import profile_fingerprint
from validate_combat_profile import read_catalog, read_profile


REQUIRED_CASES = ("C1", "C2", "C3", "C4", "C5", "C6")
EXPECTED_MODES = {
    "C1": "solo",
    "C2": "solo",
    "C3": "team",
    "C4": "team",
    "C5": "team",
    "C6": "solo",
}
REQUIRED_TELEMETRY = (
    "timeToFirstContact",
    "combatUptime",
    "uncontestedTravel",
    "deaths",
    "skillCasts",
    "hitMissReason",
    "resourceContest",
)


def active_hero_names():
    return tuple(
        hero.get("name")
        for hero in read_catalog().get("heroes", [])
        if hero.get("status") == "active" and isinstance(hero.get("name"), str)
    )


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_placeholder(value):
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower()
    return normalized.startswith("replace-with") or (normalized.startswith("<") and normalized.endswith(">"))


def _require_concrete_string(value, path, errors):
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path} must be a non-empty string")
    elif _is_placeholder(value):
        errors.append(f"{path} must contain captured evidence, not a placeholder")


def _validate_hero_coverage_evidence(report, participants, available_heroes, errors):
    coverage = report.get("heroCoverageEvidence")
    if not isinstance(coverage, list):
        errors.append(
            "heroCoverageEvidence must be a list of {hero, participantId, caseId} entries"
        )
        return

    participant_cases = {}
    for participant in participants:
        if not isinstance(participant, dict):
            continue
        participant_id = participant.get("participantId")
        cases = participant.get("cases")
        if not isinstance(participant_id, str) or not isinstance(cases, list):
            continue
        participant_cases[participant_id] = {
            case.get("caseId"): case
            for case in cases
            if isinstance(case, dict) and case.get("caseId")
        }

    evidenced_heroes = set()
    for index, entry in enumerate(coverage):
        prefix = f"heroCoverageEvidence[{index}]"
        if not isinstance(entry, dict):
            errors.append(f"{prefix} must be an object")
            continue
        hero = entry.get("hero")
        participant_id = entry.get("participantId")
        case_id = entry.get("caseId")
        if hero not in available_heroes:
            errors.append(f"{prefix}.hero is an unknown hero")
            continue
        if not isinstance(participant_id, str) or not participant_id:
            errors.append(f"{prefix}.participantId is required")
            continue
        if not isinstance(case_id, str) or not case_id:
            errors.append(f"{prefix}.caseId is required")
            continue
        cases = participant_cases.get(participant_id)
        if cases is None:
            errors.append(f"{prefix} references unknown participant {participant_id!r}")
            continue
        case = cases.get(case_id)
        if case is None:
            errors.append(
                f"{prefix} references missing case {case_id!r} for participant {participant_id!r}"
            )
            continue
        if case.get("hero") != hero:
            errors.append(
                f"{prefix} does not match {participant_id!r}/{case_id!r} hero"
            )
            continue
        evidenced_heroes.add(hero)

    missing_heroes = sorted(available_heroes - evidenced_heroes)
    if missing_heroes:
        errors.append(f"heroCoverageEvidence is missing active heroes: {missing_heroes}")


def validate_playtest_report(report, current_profile=None, base_dir=None, require_files=False):
    """Return human-readable errors; an empty list means the evidence is complete."""
    errors = []
    if not isinstance(report, dict):
        return ["report must be a JSON object"]

    profile = current_profile or read_profile()
    expected_fields = {
        "profileId": profile["profileId"],
        # The editable profile stores this as profileRevision; the wire/report
        # contract exposes the same immutable value as combatRulesVersion.
        "combatRulesVersion": profile.get("combatRulesVersion", profile["profileRevision"]),
        "combatProfileFingerprint": profile_fingerprint(profile),
    }
    for field, expected in expected_fields.items():
        if report.get(field) != expected:
            errors.append(f"{field} mismatch: expected {expected!r}")

    available_heroes = set(active_hero_names())
    hero_coverage = report.get("heroCoverage")
    if not isinstance(hero_coverage, list) or any(
        not isinstance(hero, str) or not hero.strip() for hero in hero_coverage
    ):
        errors.append("heroCoverage must be a list of active hero names")
    else:
        covered_heroes = set(hero_coverage)
        unknown_heroes = sorted(covered_heroes - available_heroes)
        missing_heroes = sorted(available_heroes - covered_heroes)
        if unknown_heroes:
            errors.append(f"heroCoverage contains unknown heroes: {unknown_heroes}")
        if missing_heroes:
            errors.append(f"heroCoverage is missing active heroes: {missing_heroes}")

    participants = report.get("participants")
    if not isinstance(participants, list) or not participants:
        return errors + ["participants must contain at least one participant"]

    for participant_index, participant in enumerate(participants):
        prefix = f"participants[{participant_index}]"
        if not isinstance(participant, dict):
            errors.append(f"{prefix} must be an object")
            continue
        _require_concrete_string(participant.get("participantId"), f"{prefix}.participantId", errors)
        if participant.get("signed") is not True:
            errors.append(f"{prefix} must be signed")
        _require_concrete_string(participant.get("signature"), f"{prefix}.signature", errors)
        _require_concrete_string(participant.get("capturedAt"), f"{prefix}.capturedAt", errors)

        cases = participant.get("cases")
        if not isinstance(cases, list):
            errors.append(f"{prefix}.cases must be a list")
            continue
        by_id = {}
        for case_index, case in enumerate(cases):
            case_prefix = f"{prefix}.cases[{case_index}]"
            if not isinstance(case, dict):
                errors.append(f"{case_prefix} must be an object")
                continue
            case_id = case.get("caseId")
            if case_id in by_id:
                errors.append(f"{prefix} contains duplicate case {case_id}")
                continue
            by_id[case_id] = case
            if case.get("hero") not in available_heroes:
                errors.append(f"{case_prefix}.hero is an unknown hero")
            if case_id not in REQUIRED_CASES:
                errors.append(f"{case_prefix}.caseId is unknown: {case_id!r}")
                continue
            if case.get("mode") != EXPECTED_MODES[case_id]:
                errors.append(
                    f"{case_prefix}.mode must be {EXPECTED_MODES[case_id]!r}"
                )
            correct = case.get("correctAnswers")
            required = case.get("requiredAnswers", 5)
            if not isinstance(correct, int) or isinstance(correct, bool) or not 0 <= correct <= 5:
                errors.append(f"{case_prefix}.correctAnswers must be an integer from 0 to 5")
            elif correct < 3:
                errors.append(f"{case_prefix} needs at least 3 correct answers")
            if required != 5:
                errors.append(f"{case_prefix}.requiredAnswers must be 5")
            evidence = case.get("evidence")
            if not isinstance(evidence, list) or not evidence or not all(isinstance(item, str) and item.strip() for item in evidence):
                errors.append(f"{case_prefix}.evidence must contain at least one path or URL")
            elif any(_is_placeholder(item) for item in evidence):
                errors.append(f"{case_prefix}.evidence must contain captured paths or URLs, not placeholders")
            elif require_files:
                root = Path(base_dir or ".")
                for item in evidence:
                    if "://" in item:
                        continue
                    path = Path(item)
                    if not path.is_absolute():
                        path = root / path
                    if not path.is_file():
                        errors.append(f"{case_prefix}.evidence file does not exist: {item}")
            if case.get("consoleErrors") != []:
                errors.append(f"{case_prefix}.consoleErrors must be empty")
            if case.get("pageErrors") != []:
                errors.append(f"{case_prefix}.pageErrors must be empty")
            answers = case.get("answers")
            if (
                not isinstance(answers, list)
                or len(answers) != 5
                or not all(isinstance(answer, str) and answer.strip() for answer in answers)
            ):
                errors.append(f"{case_prefix}.answers must contain 5 non-empty verbatim answers")
            elif any(_is_placeholder(answer) for answer in answers):
                errors.append(f"{case_prefix}.answers must contain captured participant answers, not placeholders")
            telemetry = case.get("telemetry")
            if not isinstance(telemetry, dict):
                errors.append(f"{case_prefix}.telemetry is required")
            else:
                for metric in REQUIRED_TELEMETRY:
                    if metric not in telemetry:
                        errors.append(f"{case_prefix}.telemetry.{metric} is required")
                for metric in REQUIRED_TELEMETRY[:5]:
                    if metric in telemetry and not _is_number(telemetry[metric]):
                        errors.append(f"{case_prefix}.telemetry.{metric} must be numeric")
                    elif metric in telemetry and telemetry[metric] < 0:
                        errors.append(f"{case_prefix}.telemetry.{metric} must be non-negative")
                for metric in REQUIRED_TELEMETRY[5:]:
                    if metric in telemetry:
                        _require_concrete_string(telemetry[metric], f"{case_prefix}.telemetry.{metric}", errors)

        for case_id in REQUIRED_CASES:
            if case_id not in by_id:
                errors.append(f"{prefix} missing required case {case_id}")

    _validate_hero_coverage_evidence(report, participants, available_heroes, errors)
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--require-files", action="store_true")
    parser.add_argument("--base-dir", type=Path)
    args = parser.parse_args()
    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
        errors = validate_playtest_report(
            report,
            base_dir=args.base_dir or args.report.parent,
            require_files=args.require_files,
        )
        result = {"report": str(args.report), "valid": not errors, "errors": errors}
    except (OSError, json.JSONDecodeError, KeyError) as exc:
        result = {"report": str(args.report), "valid": False, "errors": [str(exc)]}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
