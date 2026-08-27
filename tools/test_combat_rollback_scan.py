import json
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from scan_combat_rollback_refs import scan_refs, write_scan_report  # noqa: E402


class CombatRollbackScanTests(unittest.TestCase):
    def test_scan_separates_passing_refs_from_rejected_refs(self):
        responses = [
            {"profileRevision": "good-rev", "fingerprint": "a" * 64, "errors": []},
            {"profileRevision": "bad-rev", "fingerprint": "b" * 64, "errors": ["stale"]},
        ]
        with patch("scan_combat_rollback_refs.historical_preflight", side_effect=responses):
            report = scan_refs(["good", "bad"])

        self.assertEqual(report["checkedRefs"], 2)
        self.assertEqual(report["passingRefs"], [{"ref": "good", "profileRevision": "good-rev", "fingerprint": "a" * 64}])
        self.assertEqual(report["rejectedRefs"], [{"ref": "bad", "errors": ["stale"]}])

    def test_scan_records_unavailable_refs_without_stopping(self):
        with patch(
            "scan_combat_rollback_refs.historical_preflight",
            side_effect=ValueError("profile unavailable"),
        ):
            report = scan_refs(["missing"])

        self.assertEqual(report["checkedRefs"], 1)
        self.assertEqual(report["passingRefs"], [])
        self.assertEqual(report["rejectedRefs"][0]["errors"], ["profile unavailable"])

    def test_scan_report_write_is_create_once(self):
        report = {"scanVersion": 1, "checkedRefs": 0, "passingRefs": [], "rejectedRefs": []}
        with TemporaryDirectory() as directory:
            destination = write_scan_report(Path(directory), report)
            self.assertEqual(json.loads(destination.read_text(encoding="utf-8")), report)
            with self.assertRaises(FileExistsError):
                write_scan_report(Path(directory), report)


if __name__ == "__main__":
    unittest.main()
