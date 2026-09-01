import unittest

from deploy.create_manifest import create_manifest
from deploy.manifest import (
    build_release_manifest,
    required_build_units,
    validate_release_manifest,
)


class ReleaseManifestTests(unittest.TestCase):
    def test_validate_release_manifest_accepts_complete_immutable_manifest(self):
        manifest = {
            "schema_version": 1,
            "tag": "v0.0.2",
            "commit": "abc123",
            "config_sha256": "a" * 64,
            "build_units": [],
            "recreate_units": [],
            "full_reconcile": False,
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:{'0' * 64}"
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

        validate_release_manifest(manifest)

    def test_validate_release_manifest_rejects_mutable_image_reference(self):
        manifest = {
            "schema_version": 1,
            "tag": "v0.0.2",
            "commit": "abc123",
            "config_sha256": "a" * 64,
            "build_units": [],
            "recreate_units": [],
            "full_reconcile": False,
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:{'0' * 64}"
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
        manifest["images"]["battle"] = "ghcr.io/example/battle:latest"

        with self.assertRaisesRegex(ValueError, "immutable image reference"):
            validate_release_manifest(manifest)

    def test_validate_release_manifest_rejects_stateful_recreate_unit(self):
        manifest = {
            "schema_version": 1,
            "tag": "v0.0.2",
            "commit": "abc123",
            "config_sha256": "a" * 64,
            "build_units": [],
            "recreate_units": ["db"],
            "full_reconcile": False,
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:{'0' * 64}"
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

        with self.assertRaisesRegex(ValueError, "recreate_units"):
            validate_release_manifest(manifest)

    def test_validate_release_manifest_requires_built_units_to_be_recreated(self):
        manifest = {
            "schema_version": 1,
            "tag": "v0.0.2",
            "commit": "abc123",
            "config_sha256": "a" * 64,
            "build_units": ["battle"],
            "recreate_units": [],
            "full_reconcile": False,
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:{'0' * 64}"
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

        with self.assertRaisesRegex(ValueError, "built units must be recreated"):
            validate_release_manifest(manifest)

    def test_validate_release_manifest_requires_all_runtime_units_for_full_reconcile(
        self,
    ):
        manifest = {
            "schema_version": 1,
            "tag": "v0.0.2",
            "commit": "abc123",
            "config_sha256": "a" * 64,
            "build_units": [],
            "recreate_units": ["battle"],
            "full_reconcile": True,
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:{'0' * 64}"
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

        with self.assertRaisesRegex(ValueError, "full_reconcile"):
            validate_release_manifest(manifest)

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
                unit: f"registry/{unit}@sha256:{'0' * 64}"
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

        manifest = build_release_manifest(
            tag="v0.0.2",
            commit="abc123",
            plan=plan,
            previous_manifest=previous,
            built_images={"battle": f"registry/battle@sha256:{'1' * 64}"},
            config_sha256="a" * 64,
        )

        self.assertEqual(manifest["previous_tag"], "v0.0.1")
        self.assertEqual(
            manifest["images"]["account"], f"registry/account@sha256:{'0' * 64}"
        )
        self.assertEqual(
            manifest["images"]["battle"], f"registry/battle@sha256:{'1' * 64}"
        )
        self.assertEqual(manifest["tag"], "v0.0.2")

    def test_create_manifest_records_digest_refs_and_config_hash(self):
        previous = {
            "tag": "v0.0.1",
            "images": {
                unit: f"ghcr.io/example/{unit}@sha256:{'0' * 64}"
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
            built_images={"battle": f"ghcr.io/example/battle@sha256:{'1' * 64}"},
            previous_manifest=previous,
        )
        self.assertEqual(
            result["images"]["battle"],
            f"ghcr.io/example/battle@sha256:{'1' * 64}",
        )
        self.assertEqual(
            result["images"]["account"],
            f"ghcr.io/example/account@sha256:{'0' * 64}",
        )
        self.assertEqual(len(result["config_sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
