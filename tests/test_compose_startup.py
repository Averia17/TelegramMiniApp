import json
import os
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ComposeStartupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["docker", "compose", "--profile", "dev-bot", "config", "--format", "json"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            env={
                **os.environ,
                "APP_AUTH_SECRET": "compose-test-app-auth-secret",
                "POSTGRES_USER": "compose-test-user",
                "POSTGRES_PASSWORD": "compose-test-password",
                "REDIS_PASSWORD": "compose-test-redis-password",
            },
        )
        cls.services = json.loads(result.stdout)["services"]

    def test_stateful_dependencies_have_readiness_checks(self):
        for service in (
            "db",
            "shop-db",
            "redis",
            "battle-redis",
            "leaderboard-redis",
            "kafka",
        ):
            with self.subTest(service=service):
                self.assertIn("healthcheck", self.services[service])

    def test_startup_services_wait_for_ready_dependencies(self):
        expected = {
            "account": {"db", "kafka"},
            "shop": {"shop-db", "redis", "kafka"},
            "bot": {"db", "redis"},
            "battle": {"account", "battle-redis", "kafka"},
            "leaderboard": {"leaderboard-redis", "kafka"},
            "party": {"account", "kafka"},
        }
        for service, dependencies in expected.items():
            with self.subTest(service=service):
                actual = self.services[service].get("depends_on", {})
                self.assertEqual(set(actual), dependencies)
                self.assertTrue(
                    all(
                        dependency["condition"] == "service_healthy"
                        for dependency in actual.values()
                    )
                )

    def test_gateway_and_broker_restart_after_host_restart_or_crash(self):
        for service in ("nginx", "kafka"):
            with self.subTest(service=service):
                self.assertIn(
                    self.services[service].get("restart"), {"always", "unless-stopped"}
                )

    def test_gateway_waits_for_every_public_service(self):
        dependencies = self.services["nginx"]["depends_on"]
        for service in ("account", "shop", "battle", "leaderboard", "frontend"):
            with self.subTest(service=service):
                self.assertEqual(dependencies[service]["condition"], "service_healthy")

    def test_gateway_exposes_nickname_update_to_account_service(self):
        for filename in ("dev.conf", "prod.conf"):
            with self.subTest(filename=filename):
                config = (ROOT / "nginx" / filename).read_text(encoding="utf-8")
                location = "location = /api/accounts/users/me/nickname"
                self.assertIn(location, config)
                route = config[config.index(location) :]
                self.assertIn("if ($request_method != PATCH)", route)
                self.assertIn("proxy_pass $account_backend", route)

    def test_party_uses_the_development_reload_loop(self):
        party = self.services["party"]
        self.assertEqual(party["build"].get("target"), "development")
        self.assertEqual(party.get("working_dir"), "/app")
        self.assertIn(
            {"type": "bind", "source": str(ROOT / "party"), "target": "/app"},
            [
                {
                    key: value
                    for key, value in volume.items()
                    if key in {"type", "source", "target"}
                }
                for volume in party.get("volumes", [])
            ],
        )
        dockerfile = (ROOT / "party" / "Dockerfile").read_text(encoding="utf-8")
        self.assertIn("AS development", dockerfile)
        self.assertIn("air", dockerfile)


if __name__ == "__main__":
    unittest.main()
