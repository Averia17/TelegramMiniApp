import unittest

from deploy.compose_env import render_image_env


class ComposeEnvTests(unittest.TestCase):
    def test_render_image_env_contains_all_application_units(self):
        images = {
            name: f"registry/{name}@sha256:{name}"
            for name in (
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

        rendered = render_image_env(images, "v0.0.2", "abc123")

        self.assertIn("ACCOUNT_IMAGE=registry/account@sha256:account", rendered)
        self.assertIn("NGINX_IMAGE=registry/nginx@sha256:nginx", rendered)
        self.assertIn("APP_VERSION=v0.0.2", rendered)
        self.assertIn("GIT_SHA=abc123", rendered)

    def test_missing_image_is_rejected(self):
        with self.assertRaises(ValueError):
            render_image_env({}, "v0.0.1", "abc123")


if __name__ == "__main__":
    unittest.main()
