import unittest
from unittest.mock import patch

from deploy.release_plan import build_plan, changed_paths


class ReleasePlanTests(unittest.TestCase):
    def test_first_release_builds_all_application_images(self):
        plan = build_plan(["battle/internal/room/room.go"], previous_manifest=None)
        self.assertEqual(
            plan["build"],
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

    def test_incremental_release_builds_only_changed_service(self):
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
        plan = build_plan(["battle/internal/room/room.go"], previous_manifest=previous)
        self.assertEqual(plan["build"], ["battle"])
        self.assertEqual(plan["recreate"], ["battle"])

    def test_missing_new_service_is_started_when_backfilling_manifest(self):
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
                    "frontend",
                    "nginx",
                )
            }
        }
        plan = build_plan(["docs/release.md"], previous_manifest=previous)
        self.assertEqual(plan["build"], ["news"])
        self.assertEqual(plan["recreate"], ["news"])

    @patch("deploy.release_plan._git")
    def test_changed_paths_use_all_tracked_files_for_first_release(self, git):
        git.return_value = ["battle/main.go", "frontend/package.json"]
        self.assertEqual(
            changed_paths(None), ["battle/main.go", "frontend/package.json"]
        )
        git.assert_called_once_with("ls-files")


if __name__ == "__main__":
    unittest.main()
