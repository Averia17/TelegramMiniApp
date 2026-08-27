import json
import sys
from tempfile import TemporaryDirectory
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from init_combat_playtest import build_playtest_template, write_playtest_template  # noqa: E402
from generate_combat_profile import profile_fingerprint  # noqa: E402
from validate_combat_profile import read_profile  # noqa: E402


class CombatPlaytestTemplateTests(unittest.TestCase):
    def test_template_uses_current_profile_and_all_required_cases(self):
        profile = read_profile()
        report = build_playtest_template()

        self.assertEqual(report["profileId"], profile["profileId"])
        self.assertEqual(report["combatRulesVersion"], profile["profileRevision"])
        self.assertEqual(report["combatProfileFingerprint"], profile_fingerprint(profile))
        cases = report["participants"][0]["cases"]
        self.assertEqual([case["caseId"] for case in cases], ["C1", "C2", "C3", "C4", "C5", "C6"])
        self.assertEqual([case["mode"] for case in cases], ["solo", "solo", "team", "team", "team", "solo"])

    def test_template_scaffolds_evidence_for_every_active_hero(self):
        report = build_playtest_template()

        self.assertEqual(len(report["participants"]), 2)
        self.assertEqual(len(report["heroCoverageEvidence"]), 8)
        participant_ids = {
            participant["participantId"] for participant in report["participants"]
        }
        self.assertTrue(all(
            entry["participantId"] in participant_ids
            for entry in report["heroCoverageEvidence"]
        ))
        self.assertEqual(
            {entry["hero"] for entry in report["heroCoverageEvidence"]},
            set(report["heroCoverage"]),
        )

    def test_template_is_explicitly_incomplete_until_signed_and_filled(self):
        report = build_playtest_template()

        self.assertFalse(report["participants"][0]["signed"])
        self.assertEqual(report["participants"][0]["cases"][0]["correctAnswers"], 0)

    def test_template_write_is_create_once(self):
        report = build_playtest_template()
        with TemporaryDirectory() as directory:
            destination = write_playtest_template(Path(directory) / "report.json", report)
            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), report)
            with self.assertRaises(FileExistsError):
                write_playtest_template(destination, report)


if __name__ == "__main__":
    unittest.main()
