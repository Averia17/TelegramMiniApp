import copy
import json
import sys
import unittest
from unittest.mock import patch
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from generate_combat_profile import (  # noqa: E402
    profile_fingerprint,
    validate_generated_artifact_blobs,
)
from validate_combat_profile import read_catalog, read_profile  # noqa: E402
from validate_combat_release import (  # noqa: E402
    historical_preflight,
    validate_profile_artifacts,
    validate_release_state,
)
from capture_combat_release import EVIDENCE_FILES, build_manifest, write_manifest  # noqa: E402


class CombatReleaseValidationTests(unittest.TestCase):
    def setUp(self):
        self.profile = read_profile()
        self.catalog = read_catalog()
        self.fingerprint = {
            "profileId": self.profile["profileId"],
            "schemaVersion": self.profile["schemaVersion"],
            "profileRevision": self.profile["profileRevision"],
            "fingerprint": profile_fingerprint(self.profile),
        }
        self.sources = {
            relative: (TOOLS_DIR.parent / relative).read_bytes()
            for relative in self.catalog["sourceFingerprints"]
        }

    def test_current_release_artifacts_are_self_consistent(self):
        self.assertEqual(
            validate_profile_artifacts(
                self.profile, self.fingerprint, self.catalog, self.sources
            ),
            [],
        )

    def test_generated_runtime_views_are_self_consistent(self):
        artifacts = {
            "battle/model/game/combat_profile_generated.go": (
                TOOLS_DIR.parent
                / "battle/model/game/combat_profile_generated.go"
            ).read_bytes(),
            "frontend/src/components/BattleGame/combatProfile.generated.js": (
                TOOLS_DIR.parent
                / "frontend/src/components/BattleGame/combatProfile.generated.js"
            ).read_bytes(),
        }
        self.assertEqual(validate_generated_artifact_blobs(self.profile, artifacts), [])

    def test_stale_generated_runtime_view_is_rejected(self):
        artifacts = {
            "battle/model/game/combat_profile_generated.go": b"stale",
            "frontend/src/components/BattleGame/combatProfile.generated.js": (
                TOOLS_DIR.parent
                / "frontend/src/components/BattleGame/combatProfile.generated.js"
            ).read_bytes(),
        }
        errors = validate_generated_artifact_blobs(self.profile, artifacts)
        self.assertTrue(any("generated artifact is stale" in error for error in errors))

    def test_malformed_profile_does_not_crash_generated_view_gate(self):
        errors = validate_generated_artifact_blobs({}, {})
        self.assertTrue(any("generated views cannot be rendered" in error for error in errors))

    def test_historical_preflight_checks_generated_runtime_views(self):
        artifacts = {
            "docs/combat-profile.json": json.dumps(self.profile).encode("utf-8"),
            "docs/combat-profile.fingerprint.json": json.dumps(
                self.fingerprint
            ).encode("utf-8"),
            "docs/hero-catalog.json": json.dumps(self.catalog).encode("utf-8"),
            **self.sources,
            "battle/model/game/combat_profile_generated.go": (
                TOOLS_DIR.parent
                / "battle/model/game/combat_profile_generated.go"
            ).read_bytes(),
            "frontend/src/components/BattleGame/combatProfile.generated.js": (
                TOOLS_DIR.parent
                / "frontend/src/components/BattleGame/combatProfile.generated.js"
            ).read_bytes(),
        }

        with patch(
            "validate_combat_release.git_blob",
            side_effect=lambda _ref, relative: artifacts[relative],
        ):
            result = historical_preflight("synthetic-ref", run_go_tests=False)
        self.assertEqual(result["errors"], [])

        artifacts["battle/model/game/combat_profile_generated.go"] = b"stale"
        with patch(
            "validate_combat_release.git_blob",
            side_effect=lambda _ref, relative: artifacts[relative],
        ):
            result = historical_preflight("synthetic-ref", run_go_tests=False)
        self.assertTrue(
            any("generated artifact is stale" in error for error in result["errors"])
        )

    def test_stale_profile_fingerprint_is_rejected(self):
        fingerprint = copy.deepcopy(self.fingerprint)
        fingerprint["fingerprint"] = "0" * 64
        errors = validate_profile_artifacts(
            self.profile, fingerprint, self.catalog, self.sources
        )
        self.assertTrue(any("fingerprint report is stale" in error for error in errors))

    def test_stale_catalog_source_is_rejected(self):
        sources = dict(self.sources)
        relative = next(iter(sources))
        sources[relative] = sources[relative] + b"\n"
        errors = validate_profile_artifacts(
            self.profile, self.fingerprint, self.catalog, sources
        )
        self.assertTrue(any("catalog fingerprint is stale" in error for error in errors))

    def test_release_mode_rejects_dirty_working_tree(self):
        self.assertEqual(
            validate_release_state(True, " M battle/model/game/game.go\n"),
            ["release preflight requires a clean working tree"],
        )

    def test_diagnostic_mode_allows_dirty_working_tree(self):
        self.assertEqual(validate_release_state(False, " M local-change"), [])

    def test_dirty_capture_is_explicitly_ineligible_for_release(self):
        manifest = build_manifest(allow_dirty=True)
        self.assertFalse(manifest["releaseEligible"])
        self.assertFalse(manifest["workingTreeClean"])
        self.assertEqual(manifest["profileRevision"], self.profile["profileRevision"])
        self.assertEqual(manifest["combatProfileFingerprint"], self.fingerprint["fingerprint"])
        self.assertEqual(set(manifest["evidenceFiles"]), set(EVIDENCE_FILES))

    def test_manifest_write_is_create_once(self):
        from tempfile import TemporaryDirectory

        manifest = {
            "manifestVersion": 1,
            "releaseEligible": False,
            "workingTreeClean": False,
        }
        with TemporaryDirectory() as directory:
            destination = write_manifest(Path(directory), manifest)
            self.assertTrue(destination.is_file())
            with self.assertRaises(FileExistsError):
                write_manifest(Path(directory), manifest)


if __name__ == "__main__":
    unittest.main()
