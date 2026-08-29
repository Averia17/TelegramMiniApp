import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from deploy.release import (
    commit_message,
    execute_release,
    load_dotenv,
    local_compose_environment,
    main,
    parse_release_settings,
    secret_scan,
)


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

    def test_load_dotenv_reads_simple_values_without_overwriting_shell_state(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text(
                '# comment\nAPP_VERSION=v0.0.9\nQUOTED="value"\nINVALID-KEY=ignored\n',
                encoding="utf-8",
            )
            self.assertEqual(
                load_dotenv(path), {"APP_VERSION": "v0.0.9", "QUOTED": "value"}
            )

    def test_local_compose_environment_reads_only_the_selected_production_file(self):
        with TemporaryDirectory() as directory:
            production_env = Path(directory) / ".env.prod"
            production_env.write_text(
                "PRODUCTION_ONLY=present\nAPP_VERSION=old\n",
                encoding="utf-8",
            )
            with patch.dict("os.environ", {}, clear=True):
                with patch("deploy.release.git", return_value="sha-local"):
                    environment = local_compose_environment(
                        "v0.0.2", env_file=production_env
                    )

        self.assertEqual(environment["PRODUCTION_ONLY"], "present")
        self.assertNotIn("LOCAL_ONLY", environment)
        self.assertEqual(environment["APP_VERSION"], "v0.0.2")
        self.assertEqual(environment["GIT_SHA"], "sha-local")
        self.assertEqual(environment["COMPOSE_PROFILES"], "")

    def test_local_compose_environment_can_pin_runtime_bind_mounts(self):
        with TemporaryDirectory() as directory:
            production_env = Path(directory) / ".env.prod"
            production_env.write_text("APP_VERSION=old\n", encoding="utf-8")
            with patch.dict("os.environ", {}, clear=True):
                with patch("deploy.release.git", return_value="sha-local"):
                    environment = local_compose_environment(
                        "v0.0.2",
                        env_file=production_env,
                        compose_bind_root=Path("C:/stable/runtime"),
                    )

        self.assertEqual(environment["COMPOSE_BIND_ROOT"], "C:/stable/runtime")

    def test_local_release_unwinds_commit_when_tag_creation_fails(self):
        calls = []
        rev_parse_calls = 0

        def fake_git(*args):
            nonlocal rev_parse_calls
            calls.append(args)
            if args == ("rev-parse", "HEAD"):
                rev_parse_calls += 1
                return "old-head" if rev_parse_calls == 1 else "new-head"
            if args == ("diff", "--cached", "--name-only"):
                return "tracked.py\n"
            if args == ("tag", "-a", "v0.0.2", "-m", "Release v0.0.2"):
                raise RuntimeError("tag failed")
            return ""

        with patch("deploy.release.git", side_effect=fake_git):
            with patch("deploy.release.candidate_paths", return_value=["tracked.py"]):
                with patch("deploy.release.secret_scan", return_value=[]):
                    with self.assertRaisesRegex(RuntimeError, "tag failed"):
                        execute_release("v0.0.2", push=False)

        self.assertIn(("reset", "--mixed", "old-head"), calls)

    def test_local_release_failure_rolls_back_before_any_commit(self):
        with patch("sys.argv", ["release.py"]):
            with patch(
                "deploy.release.release_preview",
                return_value=("v0.0.2", {}, []),
            ):
                with patch("deploy.release.git", return_value="old-head"):
                    with patch(
                        "deploy.release.deploy_local",
                        side_effect=RuntimeError("compose failed"),
                    ):
                        with patch(
                            "deploy.release.rollback_local", return_value=True
                        ) as rollback:
                            with patch("deploy.release.execute_release") as execute:
                                self.assertEqual(main(), 1)

        rollback.assert_called_once_with("old-head", None)
        execute.assert_not_called()

    def test_local_rollback_reuses_current_deployment_safety_files(self):
        from deploy.release import ROLLBACK_DEPLOYMENT_FILES

        self.assertIn("docker-compose.prod.yml", ROLLBACK_DEPLOYMENT_FILES)
        self.assertIn("nginx/Dockerfile", ROLLBACK_DEPLOYMENT_FILES)
        self.assertIn("nginx/prod.conf", ROLLBACK_DEPLOYMENT_FILES)


if __name__ == "__main__":
    unittest.main()
