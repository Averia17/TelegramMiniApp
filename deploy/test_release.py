import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from deploy.release import commit_message, parse_release_settings, secret_scan


class ReleaseCommandTests(unittest.TestCase):
    def test_commit_message_contains_release_tag(self):
        self.assertEqual(commit_message("v0.0.1"), "deploy commit: v0.0.1")

    def test_release_settings_require_non_negative_series_numbers(self):
        self.assertEqual(
            parse_release_settings({"RELEASE_MAJOR": "0", "RELEASE_MINOR": "7"}), (0, 7)
        )

        with self.assertRaises(ValueError):
            parse_release_settings({"RELEASE_MAJOR": "-1", "RELEASE_MINOR": "0"})

    def test_secret_scan_blocks_hardcoded_password_but_allows_env_reference(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "compose.yml"
            password = "production-" + "password"
            secret_key = "POSTGRES_" + "PASSWORD"
            path.write_text(
                f"{secret_key}: {password}\n"
                "REDIS_PASSWORD: ${REDIS_PASSWORD:?must be set}\n",
                encoding="utf-8",
            )

            findings = secret_scan([str(path)])

        self.assertEqual(findings, [str(path)])

    def test_secret_scan_blocks_hardcoded_deploy_admin_token(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "compose.yml"
            path.write_text(
                "DEPLOY_ADMIN_TOKEN: actual-token-value\n", encoding="utf-8"
            )
            self.assertEqual(secret_scan([str(path)]), [str(path)])


if __name__ == "__main__":
    unittest.main()
