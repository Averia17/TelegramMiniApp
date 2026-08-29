import unittest

from deploy.versioning import next_release_tag


class ReleaseVersioningTests(unittest.TestCase):
    def test_first_release_starts_at_patch_one(self):
        self.assertEqual(next_release_tag([], major=0, minor=0), "v0.0.1")

    def test_patch_increments_only_within_selected_series(self):
        tags = ["v0.0.1", "v0.0.2", "v1.0.9", "not-a-release"]

        self.assertEqual(next_release_tag(tags, major=0, minor=0), "v0.0.3")

    def test_new_major_series_starts_at_patch_one(self):
        self.assertEqual(
            next_release_tag(["v0.0.8", "v1.2.4"], major=2, minor=0), "v2.0.1"
        )

    def test_existing_tag_is_never_reused(self):
        with self.assertRaises(ValueError):
            next_release_tag(["v0.0.1"], major=0, minor=0, requested_patch=1)


if __name__ == "__main__":
    unittest.main()
