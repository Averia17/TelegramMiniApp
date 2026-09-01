import re
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

    def test_deployer_accepts_eta_parameter_and_sends_start_message_before_drain_wait(
        self,
    ):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("--eta-minutes", source)
        self.assertIn("DEPLOY_ESTIMATED_MINUTES", source)
        self.assertIn("DEPLOYMENT_MESSAGE", source)
        self.assertIn('"message"', source)
        self.assertLess(
            source.index("DEPLOYMENT_MESSAGE"), source.index("wait_for_drain")
        )

    def test_deployer_backups_databases_before_migrations_and_publishes_news(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("backup_databases", source)
        self.assertIn("backup_database news-db", source)
        self.assertIn("pg_restore --list", source)
        self.assertLess(
            source.index("backup_databases"), source.index("run_migrations")
        )
        self.assertIn("publish_release_news", source)

    def test_deployer_validates_manifest_integrity_before_creating_release_state(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("validate_release_manifest", source)
        self.assertIn("config_sha256", source)
        self.assertIn("git rev-parse --verify HEAD", source)
        self.assertIn("manifest commit does not match checked-out HEAD", source)
        self.assertLess(
            source.index("validate_release_manifest"), source.index("mkdir -p")
        )

    def test_deployer_does_not_allow_stateful_or_mutable_manifest_units(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("from deploy.manifest import validate_release_manifest", source)
        self.assertIn("manifest production configuration hash mismatch", source)

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
        self.assertIn('"127.0.0.1:19090:9090"', compose)
        self.assertIn('"127.0.0.1:13000:3000"', compose)
        self.assertIn("${COMPOSE_BIND_ROOT:-.}/.release/current", compose)
        self.assertIn(
            "${COMPOSE_BIND_ROOT:-.}/observability/prometheus.prod.yml", compose
        )

    def test_local_migration_jobs_have_build_contexts(self):
        for service in ("bot", "shop", "news"):
            compose = (
                SCRIPT.parents[1] / service / "docker-compose.prod.yml"
            ).read_text(encoding="utf-8")
            migration = re.search(
                rf"^  {service}-migrate:\n(?P<section>.*?)(?=^  [A-Za-z0-9_-]+:|\Z)",
                compose,
                flags=re.MULTILINE | re.DOTALL,
            )
            self.assertIsNotNone(migration)
            self.assertRegex(
                migration.group("section"),
                r"(?m)^    build:\n      context: \.$",
            )

    def test_frontend_build_has_writable_vite_tempfs_with_read_only_root(self):
        compose = COMPOSE.read_text(encoding="utf-8")
        frontend = re.search(
            r"^  frontend:\n(?P<section>.*?)(?=^  nginx:)",
            compose,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(frontend)
        section = frontend.group("section")
        self.assertIn("read_only: true", section)
        self.assertIn(
            "/home/node/app/node_modules/.vite-temp:uid=1000,gid=1000,mode=700",
            section,
        )

    def test_nginx_image_contains_bind_mount_target_for_external_hero_assets(self):
        dockerfile = (SCRIPT.parents[1] / "nginx" / "Dockerfile").read_text(
            encoding="utf-8"
        )
        self.assertIn("RUN mkdir -p /src/hero-assets", dockerfile)
        compose = COMPOSE.read_text(encoding="utf-8")
        self.assertIn(
            "${COMPOSE_BIND_ROOT:-.}/frontend/public/assets/heroes:/src/hero-assets:ro",
            compose,
        )
        nginx = (SCRIPT.parents[1] / "nginx" / "prod.conf").read_text(encoding="utf-8")
        self.assertIn("alias /src/hero-assets/$1;", nginx)

    def test_nginx_tmpfs_directories_are_writable_by_the_non_root_user(self):
        compose = COMPOSE.read_text(encoding="utf-8")
        nginx = re.search(
            r"^  nginx:\n(?P<section>.*?)(?=^  cloudflared:)",
            compose,
            flags=re.MULTILINE | re.DOTALL,
        )
        self.assertIsNotNone(nginx)
        section = nginx.group("section")
        self.assertIn('user: "101:101"', section)
        self.assertIn("/var/cache/nginx:uid=101,gid=101,mode=700", section)
        self.assertIn("/var/run:uid=101,gid=101,mode=755", section)


if __name__ == "__main__":
    unittest.main()
