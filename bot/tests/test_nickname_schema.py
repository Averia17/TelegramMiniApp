import unittest
from pathlib import Path

ROOT = Path(__file__).parents[2]


class NicknameSchemaTests(unittest.TestCase):
    def test_account_and_bot_models_require_a_non_nullable_nickname(self):
        for filename in (
            "account/infrastructure/database/models/user.py",
            "bot/infrastructure/database/models/users.py",
        ):
            with self.subTest(filename=filename):
                source = (ROOT / filename).read_text(encoding="utf-8")
                self.assertIn("nickname: Mapped[str]", source)
                self.assertIn("nullable=False", source)
                self.assertIn("ck_users_nickname_min_length", source)

    def test_user_creation_uses_telegram_id_as_the_initial_nickname(self):
        for filename in (
            "account/infrastructure/database/repo/user.py",
            "bot/infrastructure/database/repo/users.py",
        ):
            with self.subTest(filename=filename):
                source = (ROOT / filename).read_text(encoding="utf-8")
                self.assertIn("nickname=str(user_id)", source)


if __name__ == "__main__":
    unittest.main()
