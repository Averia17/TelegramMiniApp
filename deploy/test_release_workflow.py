import unittest
from pathlib import Path

WORKFLOW = Path(__file__).parents[1] / ".github" / "workflows" / "release.yml"


class ReleaseWorkflowIntegrityTests(unittest.TestCase):
    def test_remote_rollouts_verify_the_tag_points_to_the_release_commit(self):
        source = WORKFLOW.read_text(encoding="utf-8")

        self.assertEqual(source.count('bash -s -- "$GITHUB_REF_NAME"'), 2)
        self.assertEqual(source.count("\"$GITHUB_SHA\" <<'REMOTE'"), 2)
        self.assertEqual(source.count('commit="$3"'), 2)
        self.assertEqual(source.count('git rev-parse "$tag^{commit}"'), 2)
        self.assertEqual(source.count('git checkout --detach "$commit"'), 2)

    def test_production_waits_for_staging_success(self):
        source = WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("needs: [manifest, deploy-staging]", source)
        self.assertIn(
            "if: needs.manifest.result == 'success' && needs.deploy-staging.result == 'success'",
            source,
        )

    def test_existing_github_release_manifest_must_match_before_reuse(self):
        source = WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("gh release download", source)
        self.assertIn("cmp --silent release-manifest.json", source)
        self.assertIn("release manifest is immutable for this tag", source)
        self.assertNotIn(
            'gh release upload "$GITHUB_REF_NAME" release-manifest.json --clobber',
            source,
        )


if __name__ == "__main__":
    unittest.main()
