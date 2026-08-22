import re
import unittest
from pathlib import Path

MIGRATIONS = Path(__file__).parents[1] / "migrations" / "versions"


def revision_dependency(filename: str) -> str:
    source = (MIGRATIONS / filename).read_text(encoding="utf-8")
    match = re.search(r'down_revision:\s*[^=]+?=\s*"([^"]+)"', source)
    if not match:
        raise AssertionError(f"No down_revision found in {filename}")
    return match.group(1)


class MigrationChainTests(unittest.TestCase):
    def test_nickname_migration_follows_current_account_schema_head(self):
        self.assertEqual(
            revision_dependency("c7d8e9f0a1b2_add_nickname.py"),
            "b3c4d5e6f7a8",
        )

    def test_nickname_constraints_migration_follows_nickname_migration(self):
        filename = "d8e9f0a1b2c3_enforce_nickname_constraints.py"
        source = (MIGRATIONS / filename).read_text(encoding="utf-8")
        self.assertEqual(revision_dependency(filename), "c7d8e9f0a1b2")
        self.assertIn("nullable=False", source)
        self.assertIn("ck_users_nickname_min_length", source)
        self.assertIn("char_length(btrim(nickname)) > 3", source)


if __name__ == "__main__":
    unittest.main()
