import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("production_deploy.sh")


class ProductionDeploySafetyTests(unittest.TestCase):
    def test_deployer_never_removes_stateful_volumes_or_all_images(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertNotIn("docker compose down -v", source)
        self.assertNotIn("docker volume rm", source)
        self.assertNotIn("docker volume prune", source)
        self.assertNotIn("docker image prune --all", source)

    def test_deployer_recreates_only_manifest_units_without_rebuilding(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("--no-build --no-deps --force-recreate", source)
        self.assertIn('for unit in "${RECREATE_UNITS[@]}"', source)

    def test_deployer_backups_databases_before_migrations_and_publishes_news(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("backup_databases", source)
        self.assertIn("backup_database news-db", source)
        self.assertLess(
            source.index("backup_databases"), source.index("run_migrations")
        )
        self.assertIn("publish_release_news", source)


if __name__ == "__main__":
    unittest.main()
