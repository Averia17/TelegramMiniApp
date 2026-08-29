import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("production_deploy.sh")
COMPOSE = SCRIPT.parents[1] / "docker-compose.prod.yml"


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

    def test_deployer_supports_a_separate_staging_env_and_checks_rollback_readiness(
        self,
    ):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT/.env.prod}"', source)
        self.assertIn(
            'DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-$ROOT/docker-compose.prod.yml}"',
            source,
        )
        self.assertNotIn('cp "$ROOT/.env"', source)
        self.assertNotIn('cat "$ROOT/.env"', source)
        self.assertIn('cp "$DEPLOY_ENV_FILE" "$RELEASE_ROOT/compose.env"', source)
        self.assertIn(
            'wait_ready "$unit" || echo "rollback readiness failed for $unit"', source
        )
        self.assertIn("rollback release metadata mismatch", source)

    def test_production_uses_cloudflare_without_an_ngrok_service_or_public_tunnel_port(
        self,
    ):
        compose = COMPOSE.read_text(encoding="utf-8")
        self.assertNotIn("ngrok", compose.lower())
        self.assertIn("cloudflare/cloudflared:", compose)
        self.assertIn("profiles: [cloudflare]", compose)
        self.assertIn("TUNNEL_TOKEN:", compose)
        self.assertIn('"127.0.0.1:8081:8080"', compose)


if __name__ == "__main__":
    unittest.main()
