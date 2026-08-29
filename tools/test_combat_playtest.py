import copy
import sys
import unittest
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from generate_combat_profile import profile_fingerprint  # noqa: E402
from init_combat_playtest import build_playtest_template  # noqa: E402
from validate_combat_playtest import (  # noqa: E402
    REQUIRED_CASES,
    validate_playtest_report,
)
from validate_combat_profile import read_profile  # noqa: E402


def valid_case(case_id, mode, hero="Kaze"):
    return {
        "caseId": case_id,
        "hero": hero,
        "mode": mode,
        "correctAnswers": 4,
        "requiredAnswers": 5,
        "evidence": [f"screen-{case_id}.png"],
        "consoleErrors": [],
        "pageErrors": [],
        "telemetry": {
            "timeToFirstContact": 1200,
            "combatUptime": 4200,
            "uncontestedTravel": 800,
            "deaths": 0,
            "skillCasts": 2,
            "hitMissReason": "impact",
            "resourceContest": "none",
        },
        "answers": [
            "hero answer",
            "danger answer",
            "hit answer",
            "avoid answer",
            "resource answer",
        ],
    }


def valid_report():
    modes = {
        "C1": "solo",
        "C2": "solo",
        "C3": "team",
        "C4": "team",
        "C5": "team",
        "C6": "solo",
    }
    first_heroes = [
        "Needle",
        "Mandy",
        "Fairy Mina",
        "Brock Zeus",
        "Kaze",
        "Wukong Mico",
    ]
    second_heroes = ["Persephone Lumi", "Katty", "Kaze", "Kaze", "Kaze", "Kaze"]

    def participant(participant_id, heroes):
        return {
            "participantId": participant_id,
            "signed": True,
            "signature": f"signature-{participant_id}",
            "capturedAt": "2026-08-27T12:00:00Z",
            "cases": [
                valid_case(case_id, modes[case_id], heroes[index])
                for index, case_id in enumerate(REQUIRED_CASES)
            ],
        }

    return {
        "profileId": "combat-profile",
        "combatRulesVersion": "2026-08-27-skill-cooldown-source",
        "combatProfileFingerprint": profile_fingerprint(read_profile()),
        "heroCoverage": [
            "Needle",
            "Mandy",
            "Fairy Mina",
            "Brock Zeus",
            "Kaze",
            "Wukong Mico",
            "Persephone Lumi",
            "Katty",
        ],
        "heroCoverageEvidence": [
            {"hero": "Needle", "participantId": "p-1", "caseId": "C1"},
            {"hero": "Mandy", "participantId": "p-1", "caseId": "C2"},
            {"hero": "Fairy Mina", "participantId": "p-1", "caseId": "C3"},
            {"hero": "Brock Zeus", "participantId": "p-1", "caseId": "C4"},
            {"hero": "Kaze", "participantId": "p-1", "caseId": "C5"},
            {"hero": "Wukong Mico", "participantId": "p-1", "caseId": "C6"},
            {"hero": "Persephone Lumi", "participantId": "p-2", "caseId": "C1"},
            {"hero": "Katty", "participantId": "p-2", "caseId": "C2"},
        ],
        "participants": [
            participant("p-1", first_heroes),
            participant("p-2", second_heroes),
        ],
    }


class CombatPlaytestValidationTests(unittest.TestCase):
    def test_accepts_complete_signed_report(self):
        self.assertEqual(validate_playtest_report(valid_report()), [])

    def test_rejects_incomplete_answers_and_missing_case(self):
        report = valid_report()
        report["participants"][0]["cases"] = report["participants"][0]["cases"][:-1]
        report["participants"][0]["cases"][0]["correctAnswers"] = 2
        errors = validate_playtest_report(report)
        self.assertTrue(any("missing required case C6" in error for error in errors))
        self.assertTrue(any("at least 3 correct answers" in error for error in errors))

    def test_rejects_unsigned_and_profile_mismatch(self):
        report = copy.deepcopy(valid_report())
        report["profileId"] = "old-profile"
        report["participants"][0]["signed"] = False
        errors = validate_playtest_report(report)
        self.assertTrue(any("profileId mismatch" in error for error in errors))
        self.assertTrue(any("must be signed" in error for error in errors))

    def test_rejects_placeholder_signature_answers_and_evidence(self):
        report = valid_report()
        participant = report["participants"][0]
        participant["signature"] = "replace-with-signature"
        participant["cases"][0]["evidence"] = ["replace-with-screen-or-video-path"]
        participant["cases"][0]["answers"][0] = "replace-with-verbatim-answer-1"

        errors = validate_playtest_report(report)

        self.assertTrue(
            any("signature" in error and "placeholder" in error for error in errors)
        )
        self.assertTrue(
            any("evidence" in error and "placeholder" in error for error in errors)
        )
        self.assertTrue(
            any("answers" in error and "placeholder" in error for error in errors)
        )

    def test_rejects_negative_playtest_telemetry(self):
        report = valid_report()
        report["participants"][0]["cases"][0]["telemetry"]["deaths"] = -1

        errors = validate_playtest_report(report)

        self.assertTrue(any("deaths must be non-negative" in error for error in errors))

    def test_rejects_stale_profile_fingerprint(self):
        report = valid_report()
        report["combatProfileFingerprint"] = "0" * 64

        errors = validate_playtest_report(report)

        self.assertTrue(
            any("combatProfileFingerprint mismatch" in error for error in errors)
        )

    def test_rejects_incomplete_hero_coverage(self):
        report = valid_report()
        report["heroCoverage"] = ["Kaze"]

        errors = validate_playtest_report(report)

        self.assertTrue(any("heroCoverage" in error for error in errors))

    def test_rejects_unknown_case_hero(self):
        report = valid_report()
        report["participants"][0]["cases"][0]["hero"] = "unknown-hero"

        errors = validate_playtest_report(report)

        self.assertTrue(any("unknown hero" in error for error in errors))

    def test_rejects_declared_hero_coverage_without_case_evidence(self):
        report = valid_report()
        report["heroCoverageEvidence"] = [
            {
                "hero": "Kaze",
                "participantId": "p-1",
                "caseId": "C1",
            }
        ]

        errors = validate_playtest_report(report)

        self.assertTrue(
            any(
                "heroCoverageEvidence is missing active heroes" in error
                for error in errors
            )
        )

    def test_rejects_runtime_errors_and_missing_telemetry(self):
        report = valid_report()
        report["participants"][0]["cases"][0]["consoleErrors"] = ["boom"]
        del report["participants"][0]["cases"][0]["telemetry"]["combatUptime"]
        errors = validate_playtest_report(report)
        self.assertTrue(any("consoleErrors must be empty" in error for error in errors))
        self.assertTrue(
            any("telemetry.combatUptime is required" in error for error in errors)
        )

    def test_rejects_missing_verbatim_answers(self):
        report = valid_report()
        del report["participants"][0]["cases"][0]["answers"]
        errors = validate_playtest_report(report)
        self.assertTrue(any("answers must contain 5" in error for error in errors))

    def test_accepts_remote_evidence_url_when_files_are_required(self):
        report = valid_report()
        for participant in report["participants"]:
            for case in participant["cases"]:
                case["evidence"] = [
                    f"https://example.test/{participant['participantId']}/{case['caseId']}.mp4"
                ]
        self.assertEqual(
            validate_playtest_report(report, require_files=True, base_dir="."), []
        )

    def test_generated_template_uses_active_heroes_for_cases(self):
        report = build_playtest_template()
        cases = [
            case
            for participant in report["participants"]
            for case in participant["cases"]
        ]

        self.assertEqual(len(cases), len(REQUIRED_CASES) * 2)
        self.assertTrue(all(case["hero"] in report["heroCoverage"] for case in cases))
        self.assertEqual(
            {entry["hero"] for entry in report["heroCoverageEvidence"]},
            set(report["heroCoverage"]),
        )
        errors = validate_playtest_report(report)
        self.assertFalse(any("heroCoverageEvidence" in error for error in errors))
        self.assertTrue(any("must be signed" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
