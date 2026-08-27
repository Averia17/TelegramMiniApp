import copy
import json
import sys
from tempfile import TemporaryDirectory
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from generate_combat_profile import profile_fingerprint  # noqa: E402
from validate_combat_profile import read_profile  # noqa: E402
from validate_combat_rollout import validate_rollout_report  # noqa: E402


def valid_report():
    profile = read_profile()
    return {
        "reportVersion": 1,
        "profileId": profile["profileId"],
        "combatRulesVersion": profile["profileRevision"],
        "combatProfileFingerprint": profile_fingerprint(profile),
        "operator": {
            "operatorId": "ops-1",
            "signed": True,
            "signature": "signed-evidence-1",
            "capturedAt": "2026-08-27T12:00:00Z",
        },
        "releaseManifest": {
            "manifest": "https://evidence.example/release.json",
            "releaseEligible": True,
            "workingTreeClean": True,
            "gitCommit": "a" * 40,
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
                "status": "pass",
                "humanPlaytestValid": True,
                "playtestReport": "https://evidence.example/playtest.json",
            },
            "stage3": {
                "status": "pass",
                "sampledMatchShare": 0.1,
                "affectedMatches": 20,
                "abortGatesTriggered": [],
                "historicalBaseline": {
                    "source": "https://evidence.example/historical-baseline.json",
                    "profileRevision": "previous-approved-2026-08",
                    "profileFingerprint": "B" * 64,
                    "metrics": [
                        "ttk",
                        "fullAmmoDeletion",
                        "reloadDeadTime",
                        "skillConversion",
                        "botIdleRetreat",
                        "resourceContest",
                        "matchDuration",
                        "winRate",
                    ],
                    "comparison": {
                        "ttk": {"baseline": 1800, "candidate": 1650, "delta": -150},
                        "fullAmmoDeletion": {"baseline": 0.80, "candidate": 0.78, "delta": -0.02},
                        "reloadDeadTime": {"baseline": 0.62, "candidate": 0.48, "delta": -0.14},
                        "skillConversion": {"baseline": 0.35, "candidate": 0.55, "delta": 0.20},
                        "botIdleRetreat": {"baseline": 0.22, "candidate": 0.08, "delta": -0.14},
                        "resourceContest": {"baseline": 0.40, "candidate": 0.52, "delta": 0.12},
                        "matchDuration": {"baseline": 160000, "candidate": 145000, "delta": -15000},
                        "winRate": {"baseline": 0.50, "candidate": 0.50, "delta": 0.0},
                    },
                },
            },
        },
        "rollback": {
            "status": "pass",
            "rollbackRef": "previous-release-1",
            "rollbackDurationMs": 120000,
            "affectedRooms": 3,
            "errorCount": 0,
            "postRollbackStateHashesMatch": True,
            "postRollbackCounters": {"snapshotMismatches": 0},
            "evidence": ["https://evidence.example/rollback.json"],
        },
        "evidence": ["https://evidence.example/staged-rollout.json"],
        "abortGatesTriggered": [],
    }


class CombatRolloutValidationTests(unittest.TestCase):
    def test_complete_rollout_report_passes(self):
        self.assertEqual(validate_rollout_report(valid_report()), [])

    def test_report_rejects_unstable_hashes_and_abort_gates(self):
        report = valid_report()
        report["stages"]["stage0"]["stateHashStable"] = False
        report["abortGatesTriggered"] = ["state_hash_mismatch"]

        errors = validate_rollout_report(report)

        self.assertTrue(any("stateHashStable" in error for error in errors))
        self.assertTrue(any("abortGatesTriggered" in error for error in errors))

    def test_report_rejects_placeholder_operator_and_evidence(self):
        report = valid_report()
        report["operator"]["signature"] = "replace-with-operator-signature"
        report["evidence"] = ["replace-with-staged-rollout-evidence"]

        errors = validate_rollout_report(report)

        self.assertTrue(any("operator.signature" in error and "placeholder" in error for error in errors))
        self.assertTrue(any("evidence" in error and "placeholder" in error for error in errors))

    def test_report_rejects_ineligible_release_and_incomplete_rollback(self):
        report = valid_report()
        report["releaseManifest"]["releaseEligible"] = False
        report["rollback"]["errorCount"] = 1
        report["rollback"]["postRollbackStateHashesMatch"] = False

        errors = validate_rollout_report(report)

        self.assertTrue(any("releaseEligible" in error for error in errors))
        self.assertTrue(any("errorCount" in error for error in errors))
        self.assertTrue(any("postRollbackStateHashesMatch" in error for error in errors))

    def test_rollback_counters_must_be_numeric_nonnegative_values(self):
        report = valid_report()
        report["rollback"]["postRollbackCounters"] = {
            "snapshotMismatches": "zero",
        }

        errors = validate_rollout_report(report)

        self.assertTrue(any("postRollbackCounters must contain" in error for error in errors))

    def test_report_rejects_wrong_profile_version_and_fingerprint(self):
        report = valid_report()
        report["combatRulesVersion"] = "stale"
        report["combatProfileFingerprint"] = "0" * 64

        errors = validate_rollout_report(report)

        self.assertTrue(any("combatRulesVersion mismatch" in error for error in errors))
        self.assertTrue(any("combatProfileFingerprint mismatch" in error for error in errors))

    def test_report_requires_human_stage_and_minimum_replays(self):
        report = valid_report()
        report["stages"]["stage0"]["replayCycles"] = 19
        report["stages"]["stage2"]["humanPlaytestValid"] = False

        errors = validate_rollout_report(report)

        self.assertTrue(any("replayCycles" in error for error in errors))
        self.assertTrue(any("humanPlaytestValid" in error for error in errors))

    def test_stage3_requires_historical_baseline_comparison(self):
        report = valid_report()
        del report["stages"]["stage3"]["historicalBaseline"]

        errors = validate_rollout_report(report)

        self.assertTrue(any("historicalBaseline" in error for error in errors))

    def test_stage3_requires_numeric_before_after_comparison(self):
        report = valid_report()
        report["stages"]["stage3"]["historicalBaseline"]["comparison"] = {
            "ttk": {"baseline": 1, "candidate": 1, "delta": "not-a-number"},
        }

        errors = validate_rollout_report(report)

        self.assertTrue(any("comparison.ttk" in error for error in errors))

    def test_stage3_requires_historical_baseline_profile_fingerprint(self):
        report = valid_report()
        report["stages"]["stage3"]["historicalBaseline"]["profileFingerprint"] = "bad"

        errors = validate_rollout_report(report)

        self.assertTrue(any("profileFingerprint" in error for error in errors))

    def test_require_files_rejects_missing_local_evidence(self):
        report = valid_report()
        report["stages"]["stage2"]["playtestReport"] = "missing-playtest.json"
        report["rollback"]["evidence"] = ["missing-rollback.json"]
        report["evidence"] = ["missing-rollout.json"]

        errors = validate_rollout_report(report, base_dir=Path.cwd(), require_files=True)

        self.assertTrue(any("missing-playtest.json" in error for error in errors))
        self.assertTrue(any("missing-rollback.json" in error for error in errors))
        self.assertTrue(any("missing-rollout.json" in error for error in errors))

    def test_local_release_manifest_must_match_report_commit(self):
        report = valid_report()
        report["releaseManifest"]["manifest"] = "release.json"
        with TemporaryDirectory() as directory:
            Path(directory, "release.json").write_text(
                json.dumps({
                    "releaseEligible": True,
                    "workingTreeClean": True,
                    "gitCommit": "b" * 40,
                    "profileRevision": report["combatRulesVersion"],
                    "combatProfileFingerprint": report["combatProfileFingerprint"],
                }),
                encoding="utf-8",
            )

            errors = validate_rollout_report(report, base_dir=directory, require_files=True)

        self.assertTrue(any("gitCommit mismatch" in error for error in errors))

    def test_local_release_manifest_must_include_validated_rollback(self):
        report = valid_report()
        report["releaseManifest"]["manifest"] = "release.json"
        with TemporaryDirectory() as directory:
            Path(directory, "release.json").write_text(
                json.dumps({
                    "releaseEligible": True,
                    "workingTreeClean": True,
                    "gitCommit": report["releaseManifest"]["gitCommit"],
                    "profileRevision": report["combatRulesVersion"],
                    "combatProfileFingerprint": report["combatProfileFingerprint"],
                    "rollback": None,
                }),
                encoding="utf-8",
            )

            errors = validate_rollout_report(report, base_dir=directory, require_files=True)

        self.assertTrue(any("validated rollback" in error for error in errors))

    def test_local_release_manifest_with_matching_rollback_passes(self):
        report = valid_report()
        report["releaseManifest"]["manifest"] = "release.json"
        with TemporaryDirectory() as directory:
            Path(directory, "release.json").write_text(
                json.dumps({
                    "releaseEligible": True,
                    "workingTreeClean": True,
                    "gitCommit": report["releaseManifest"]["gitCommit"],
                    "profileRevision": report["combatRulesVersion"],
                    "combatProfileFingerprint": report["combatProfileFingerprint"],
                    "rollback": {
                        "ref": report["rollback"]["rollbackRef"],
                        "profileRevision": report["combatRulesVersion"],
                        "fingerprint": report["combatProfileFingerprint"],
                        "errors": [],
                    },
                }),
                encoding="utf-8",
            )

            errors = validate_rollout_report(report, base_dir=directory, require_files=True)

        self.assertEqual(errors, [])

    def test_require_files_validates_local_playtest_report_contents(self):
        report = valid_report()
        report["stages"]["stage2"]["playtestReport"] = "playtest.json"
        with TemporaryDirectory() as directory:
            Path(directory, "playtest.json").write_text("{}", encoding="utf-8")

            errors = validate_rollout_report(report, base_dir=directory, require_files=True)

        self.assertTrue(any("playtestReport" in error and "profileId" in error for error in errors))

    def test_require_files_accepts_a_valid_local_playtest_report(self):
        profile = read_profile()
        report = valid_report()
        report["stages"]["stage2"]["playtestReport"] = "playtest.json"
        modes = {"C1": "solo", "C2": "solo", "C3": "team", "C4": "team", "C5": "team", "C6": "solo"}
        playtest = {
            "profileId": profile["profileId"],
            "combatRulesVersion": profile["profileRevision"],
            "combatProfileFingerprint": profile_fingerprint(profile),
            "heroCoverage": [
                "Needle", "Mandy", "Fairy Mina", "Brock Zeus",
                "Kaze", "Wukong Mico", "Persephone Lumi", "Katty",
            ],
            "heroCoverageEvidence": [
                {"hero": "Needle", "participantId": "human-1", "caseId": "C1"},
                {"hero": "Mandy", "participantId": "human-1", "caseId": "C2"},
                {"hero": "Fairy Mina", "participantId": "human-1", "caseId": "C3"},
                {"hero": "Brock Zeus", "participantId": "human-1", "caseId": "C4"},
                {"hero": "Kaze", "participantId": "human-1", "caseId": "C5"},
                {"hero": "Wukong Mico", "participantId": "human-1", "caseId": "C6"},
                {"hero": "Persephone Lumi", "participantId": "human-2", "caseId": "C1"},
                {"hero": "Katty", "participantId": "human-2", "caseId": "C2"},
            ],
            "participants": [{
                "participantId": "human-1",
                "signed": True,
                "signature": "signature-human-1",
                "capturedAt": "2026-08-27T12:00:00Z",
                "cases": [{
                    "caseId": case_id,
                    "hero": hero,
                    "mode": mode,
                    "correctAnswers": 3,
                    "requiredAnswers": 5,
                    "evidence": ["https://evidence.example/case.png"],
                    "consoleErrors": [],
                    "pageErrors": [],
                    "answers": ["answer"] * 5,
                    "telemetry": {
                        "timeToFirstContact": 1,
                        "combatUptime": 1,
                        "uncontestedTravel": 1,
                        "deaths": 0,
                        "skillCasts": 1,
                        "hitMissReason": "none",
                        "resourceContest": "observed",
                    },
                } for case_id, mode, hero in zip(
                    modes.keys(), modes.values(),
                    ["Needle", "Mandy", "Fairy Mina", "Brock Zeus", "Kaze", "Wukong Mico"],
                )],
            }, {
                "participantId": "human-2",
                "signed": True,
                "signature": "signature-human-2",
                "capturedAt": "2026-08-27T12:05:00Z",
                "cases": [{
                    "caseId": case_id,
                    "hero": hero,
                    "mode": mode,
                    "correctAnswers": 3,
                    "requiredAnswers": 5,
                    "evidence": ["https://evidence.example/case-2.png"],
                    "consoleErrors": [],
                    "pageErrors": [],
                    "answers": ["answer"] * 5,
                    "telemetry": {
                        "timeToFirstContact": 1,
                        "combatUptime": 1,
                        "uncontestedTravel": 1,
                        "deaths": 0,
                        "skillCasts": 1,
                        "hitMissReason": "none",
                        "resourceContest": "observed",
                    },
                } for case_id, mode, hero in zip(
                    modes.keys(), modes.values(),
                    ["Persephone Lumi", "Katty", "Kaze", "Kaze", "Kaze", "Kaze"],
                )],
            }],
        }
        with TemporaryDirectory() as directory:
            Path(directory, "playtest.json").write_text(
                json.dumps(playtest), encoding="utf-8"
            )

            errors = validate_rollout_report(report, base_dir=directory, require_files=True)

        self.assertEqual(errors, [])

    def test_report_does_not_mutate_input(self):
        report = valid_report()
        original = copy.deepcopy(report)

        validate_rollout_report(report)

        self.assertEqual(report, original)


if __name__ == "__main__":
    unittest.main()
