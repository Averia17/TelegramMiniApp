import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ComposeStartupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run(
            ["docker", "compose", "config", "--format", "json"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
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
            "battle": {"battle-redis", "kafka"},
            "leaderboard": {"leaderboard-redis", "kafka"},
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


if __name__ == "__main__":
    unittest.main()
