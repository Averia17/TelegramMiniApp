import unittest

from services.nickname import normalize_nickname


class NicknameTests(unittest.TestCase):
    def test_normalize_nickname_trims_outer_whitespace(self):
        self.assertEqual(normalize_nickname("  Shadow  "), "Shadow")

    def test_normalize_nickname_allows_names_longer_than_three_without_uniqueness_check(
        self,
    ):
        self.assertEqual(normalize_nickname("Shadow"), "Shadow")
        self.assertEqual(normalize_nickname("Shadow"), "Shadow")

    def test_normalize_nickname_rejects_names_shorter_than_four_characters(self):
        for nickname in ("a", "ab", "abc"):
            with self.subTest(nickname=nickname):
                with self.assertRaisesRegex(ValueError, "4"):
                    normalize_nickname(nickname)

    def test_normalize_nickname_rejects_blank_names(self):
        with self.assertRaisesRegex(ValueError, "пустым"):
            normalize_nickname("   ")

    def test_normalize_nickname_allows_names_up_to_20_characters(self):
        self.assertEqual(normalize_nickname("a" * 20), "a" * 20)

    def test_normalize_nickname_rejects_names_longer_than_20_characters(self):
        with self.assertRaisesRegex(ValueError, "20"):
            normalize_nickname("a" * 21)


if __name__ == "__main__":
    unittest.main()
