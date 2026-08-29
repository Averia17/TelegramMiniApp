import unittest

from deploy.create_manifest import create_manifest
from deploy.manifest import build_release_manifest, required_build_units


class ReleaseManifestTests(unittest.TestCase):
    def test_first_release_builds_every_application_image(self):
        plan = {"build": [], "recreate": [], "full_reconcile": False}

        self.assertEqual(
            required_build_units(plan, previous_manifest=None),
            [
                "account",
                "battle",
                "bot",
                "shop",
                "leaderboard",
                "party",
                "news",
                "frontend",
                "nginx",
            ],
        )

    def test_incremental_release_builds_only_changed_images(self):
        plan = {"build": ["battle"], "recreate": ["battle"], "full_reconcile": False}
        previous = {
            "images": {
                unit: f"sha256:{unit}-old"
                for unit in (
                    "account",
                    "battle",
                    "bot",
                    "shop",
                    "leaderboard",
                    "party",
                    "news",
                    "frontend",
                    "nginx",
                )
            }
        }

        self.assertEqual(required_build_units(plan, previous), ["battle"])

    def test_incomplete_previous_manifest_rebuilds_missing_image(self):
        plan = {"build": ["battle"], "recreate": ["battle"], "full_reconcile": False}
        previous = {"images": {"battle": "sha256:battle-old"}}
        self.assertEqual(
            required_build_units(plan, previous),
            [
                "account",
                "battle",
                "bot",
                "shop",
                "leaderboard",
                "party",
                "news",
                "frontend",
                "nginx",
            ],
        )

    def test_manifest_preserves_previous_image_and_records_plan(self):
        plan = {"build": ["battle"], "recreate": ["battle"], "full_reconcile": False}
        previous = {
            "tag": "v0.0.1",
            "images": {
                "account": "sha256:account-old",
                "battle": "sha256:battle-old",
                "bot": "sha256:bot-old",
                "shop": "sha256:shop-old",
                "leaderboard": "sha256:leaderboard-old",
                "party": "sha256:party-old",
                "news": "sha256:news-old",
                "frontend": "sha256:frontend-old",
                "nginx": "sha256:nginx-old",
            },
        }

        manifest = build_release_manifest(
            tag="v0.0.2",
            commit="abc123",
            plan=plan,
            previous_manifest=previous,
            built_images={"battle": "sha256:battle-new"},
        )

        self.assertEqual(manifest["previous_tag"], "v0.0.1")
        self.assertEqual(manifest["images"]["account"], "sha256:account-old")
        self.assertEqual(manifest["images"]["battle"], "sha256:battle-new")
        self.assertEqual(manifest["tag"], "v0.0.2")

    def test_create_manifest_records_digest_refs_and_config_hash(self):
        previous = {
            "tag": "v0.0.1",
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:old"
                for unit in (
                    "account",
                    "battle",
                    "bot",
                    "shop",
                    "leaderboard",
                    "party",
                    "news",
                    "frontend",
                    "nginx",
                )
            },
        }
        result = create_manifest(
            tag="v0.0.2",
            commit="abc123",
            plan={"build": ["battle"], "recreate": ["battle"]},
            built_images={"battle": "ghcr.io/example/battle@sha256:new"},
            previous_manifest=previous,
        )
        self.assertEqual(
            result["images"]["battle"], "ghcr.io/example/battle@sha256:new"
        )
        self.assertEqual(
            result["images"]["account"], "ghcr.io/example/account@sha256:old"
        )
        self.assertEqual(len(result["config_sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
