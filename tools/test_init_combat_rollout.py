import json
import sys
from tempfile import TemporaryDirectory
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from generate_combat_profile import profile_fingerprint  # noqa: E402
from init_combat_rollout import build_rollout_template, write_rollout_template  # noqa: E402
from validate_combat_profile import read_profile  # noqa: E402


class CombatRolloutTemplateTests(unittest.TestCase):
    def test_template_uses_current_profile_and_preserves_automated_evidence(self):
        profile = read_profile()
        report = build_rollout_template()

        self.assertEqual(report["profileId"], profile["profileId"])
        self.assertEqual(report["combatRulesVersion"], profile["profileRevision"])
        self.assertEqual(report["combatProfileFingerprint"], profile_fingerprint(profile))
        self.assertEqual(report["stages"]["stage0"]["status"], "pass")
        self.assertEqual(report["stages"]["stage0"]["replayCycles"], 20)
        self.assertEqual(report["stages"]["stage1"]["status"], "pass")
        self.assertEqual(report["stages"]["stage1"]["visualCases"], 49)

    def test_template_marks_external_gates_incomplete(self):
        report = build_rollout_template()

        self.assertFalse(report["operator"]["signed"])
        self.assertFalse(report["releaseManifest"]["releaseEligible"])
        self.assertEqual(report["stages"]["stage2"]["status"], "not_run")
        self.assertEqual(report["stages"]["stage3"]["status"], "not_run")
        self.assertEqual(report["rollback"]["status"], "not_run")

    def test_template_write_is_create_once(self):
        report = build_rollout_template()
        with TemporaryDirectory() as directory:
            destination = write_rollout_template(Path(directory) / "rollout.json", report)
            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), report)
            with self.assertRaises(FileExistsError):
                write_rollout_template(destination, report)


if __name__ == "__main__":
    unittest.main()
