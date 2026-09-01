import unittest
from pathlib import Path

WORKFLOW = Path(__file__).parents[1] / ".github" / "workflows" / "ci.yml"


class CIWorkflowTests(unittest.TestCase):
    def test_secret_scan_heredoc_closes_inside_its_own_step(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        start = source.index("      - name: Scan tracked files for production secrets")
        end = source.index("      - name: Audit Python dependencies", start)
        secret_scan_step = source[start:end]

        self.assertIn("\n          PY\n", secret_scan_step)

        audit_step = source[end:]
        self.assertNotIn("\n          PY\n", audit_step)

    def test_ci_validates_deployment_shell_and_root_compose_contracts(self):
        source = WORKFLOW.read_text(encoding="utf-8")

        self.assertIn("bash -n deploy/production_deploy.sh", source)
        self.assertIn("bash -n deploy/retry_release_news.sh", source)
        self.assertIn("python -m unittest discover -s tests -p 'test_*.py' -v", source)

    def test_python_dependency_audit_installs_every_python_service(self):
        source = WORKFLOW.read_text(encoding="utf-8")
        audit_start = source.index("      - name: Audit Python dependencies")
        audit_step = source[audit_start:]

        for service in ("account", "bot", "news", "shop"):
            self.assertIn(f"-e ./{service}", audit_step)


if __name__ == "__main__":
    unittest.main()
