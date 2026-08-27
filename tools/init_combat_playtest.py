"""Create a current-version human combat playtest report template."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from generate_combat_profile import profile_fingerprint
from validate_combat_playtest import EXPECTED_MODES, REQUIRED_CASES, active_hero_names
from validate_combat_profile import read_profile


def _case_template(case_id: str, hero: str) -> dict:
    return {
        "caseId": case_id,
        "hero": hero,
        "mode": EXPECTED_MODES[case_id],
        "correctAnswers": 0,
        "requiredAnswers": 5,
        "evidence": ["replace-with-screen-or-video-path"],
        "consoleErrors": [],
        "pageErrors": [],
        "telemetry": {
            "timeToFirstContact": 0,
            "combatUptime": 0,
            "uncontestedTravel": 0,
            "deaths": 0,
            "skillCasts": 0,
            "hitMissReason": "replace-with-observed-reason",
            "resourceContest": "replace-with-observed-result",
        },
        "answers": [
            "replace-with-verbatim-answer-1",
            "replace-with-verbatim-answer-2",
            "replace-with-verbatim-answer-3",
            "replace-with-verbatim-answer-4",
            "replace-with-verbatim-answer-5",
        ],
    }


def build_playtest_template(participant_id: str = "replace-with-participant-id") -> dict:
    profile = read_profile()
    heroes = active_hero_names()
    if not heroes:
        raise ValueError("active hero catalog is empty")

    cases_per_participant = len(REQUIRED_CASES)
    participant_count = max(
        1, (len(heroes) + cases_per_participant - 1) // cases_per_participant
    )
    participants = []
    hero_coverage_evidence = []
    evidenced_heroes = set()
    for participant_index in range(participant_count):
        current_id = (
            participant_id
            if participant_count == 1
            else f"{participant_id}-{participant_index + 1}"
        )
        assigned_heroes = [
            heroes[(participant_index * cases_per_participant + case_index) % len(heroes)]
            for case_index in range(cases_per_participant)
        ]
        participants.append({
            "participantId": current_id,
            "signed": False,
            "signature": "replace-with-participant-signature",
            "capturedAt": "replace-with-iso-8601-timestamp",
            "cases": [
                _case_template(case_id, assigned_heroes[index])
                for index, case_id in enumerate(REQUIRED_CASES)
            ],
        })
        for case_id, hero in zip(REQUIRED_CASES, assigned_heroes):
            if hero not in evidenced_heroes:
                hero_coverage_evidence.append({
                    "hero": hero,
                    "participantId": current_id,
                    "caseId": case_id,
                })
                evidenced_heroes.add(hero)

    return {
        "profileId": profile["profileId"],
        "combatRulesVersion": profile["profileRevision"],
        "combatProfileFingerprint": profile_fingerprint(profile),
        "heroCoverage": list(heroes),
        "heroCoverageEvidence": hero_coverage_evidence,
        "participants": participants,
    }


def write_playtest_template(destination: Path, report: dict) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise FileExistsError(f"playtest template already exists: {destination}")
    with destination.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2, sort_keys=False)
        handle.write("\n")
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--participant-id", default="replace-with-participant-id")
    args = parser.parse_args()
    try:
        destination = write_playtest_template(
            args.output,
            build_playtest_template(args.participant_id),
        )
    except (OSError, KeyError, ValueError) as exc:
        parser.error(str(exc))
    print(json.dumps({"template": str(destination)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
