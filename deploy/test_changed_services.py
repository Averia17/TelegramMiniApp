import unittest

from deploy.changed_services import affected_units, classify_paths
from deploy.release_manifest import merge_image_digests


class ChangedServicesTests(unittest.TestCase):
    def test_battle_only_change_deploys_battle(self):
        result = affected_units(["battle/handler/messages.go", "battle/Dockerfile"])

        self.assertEqual(result["build"], ["battle"])
        self.assertEqual(result["recreate"], ["battle"])
        self.assertFalse(result["full_reconcile"])

    def test_frontend_change_also_reloads_gateway(self):
        result = affected_units(["frontend/src/App.jsx"])

        self.assertEqual(result["build"], ["frontend"])
        self.assertEqual(result["recreate"], ["frontend", "nginx"])

    def test_observability_change_does_not_touch_application_images(self):
        result = affected_units(["observability/grafana/dashboards/battle.json"])

        self.assertEqual(result["build"], [])
        self.assertEqual(result["recreate"], ["prometheus", "grafana"])

    def test_root_compose_change_requires_reconcile_without_image_rebuild(self):
        result = affected_units(["docker-compose.prod.yml"])

        self.assertEqual(result["build"], [])
        self.assertTrue(result["full_reconcile"])

    def test_root_compose_reconcile_still_builds_changed_service_only(self):
        result = affected_units(["docker-compose.prod.yml", "battle/main.go"])

        self.assertEqual(result["build"], ["battle"])
        self.assertTrue(result["full_reconcile"])

    def test_development_compose_is_ignored_for_production(self):
        result = affected_units(["bot/docker-compose.yml", "docker-compose.yml"])

        self.assertEqual(result["build"], [])
        self.assertEqual(result["recreate"], [])

    def test_non_deploy_files_are_ignored(self):
        result = affected_units(["docs/battle-architecture.md", "tasks/todo.md"])

        self.assertEqual(result["build"], [])
        self.assertEqual(result["recreate"], [])
        self.assertFalse(result["full_reconcile"])

    def test_classification_preserves_reasons(self):
        result = classify_paths(["account/app.py", "nginx/prod.conf"])

        self.assertEqual(result["account"], ["account/app.py"])
        self.assertEqual(result["nginx"], ["nginx/prod.conf"])

    def test_manifest_keeps_previous_image_for_unchanged_service(self):
        previous = {
            "images": {
                "account": "sha256:account-old",
                "battle": "sha256:battle-old",
            }
        }

        images = merge_image_digests(previous, {"battle": "sha256:battle-new"})

        self.assertEqual(images["account"], "sha256:account-old")
        self.assertEqual(images["battle"], "sha256:battle-new")

    def test_news_change_rebuilds_only_news(self):
        result = affected_units(["news/app.py"])
        self.assertEqual(result["build"], ["news"])
        self.assertEqual(result["recreate"], ["news"])


if __name__ == "__main__":
    unittest.main()
