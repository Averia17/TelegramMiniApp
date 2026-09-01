import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class ComposeIsolationTests(unittest.TestCase):
    def test_dev_and_prod_have_explicitly_different_networks(self):
        dev = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        prod = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")

        self.assertIn("name: dev_app-net", dev)
        self.assertIn("name: prod_app-net", prod)

    def test_nginx_uses_environment_qualified_backends(self):
        dev = (ROOT / "nginx/dev.conf").read_text(encoding="utf-8")
        prod = (ROOT / "nginx/prod.conf").read_text(encoding="utf-8")

        for service in ("account", "shop", "battle", "leaderboard", "party", "news"):
            self.assertIn(f"http://dev-{service}:", dev)
            self.assertIn(f"http://prod-{service}:", prod)

    def test_application_dependencies_are_environment_qualified(self):
        dev = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        prod = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")

        for prefix, compose in (("dev", dev), ("prod", prod)):
            for service in (
                "db",
                "redis",
                "kafka",
                "shop-db",
                "battle-redis",
                "leaderboard-redis",
                "account",
                "shop",
            ):
                self.assertIn(f"{prefix}-{service}", compose)

    def test_prometheus_targets_the_same_environment(self):
        dev = (ROOT / "observability/prometheus.dev.yml").read_text(encoding="utf-8")
        prod = (ROOT / "observability/prometheus.prod.yml").read_text(encoding="utf-8")

        self.assertIn("targets: [dev-battle:8000]", dev)
        self.assertIn("targets: [prod-battle:8000]", prod)

    def test_shop_payment_target_is_environment_qualified(self):
        dev = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        prod = (ROOT / "docker-compose.prod.yml").read_text(encoding="utf-8")

        self.assertIn("USERS_SERVICE_URL: http://dev-account:8000", dev)
        self.assertIn("USERS_SERVICE_URL: http://prod-account:8000", prod)


if __name__ == "__main__":
    unittest.main()
