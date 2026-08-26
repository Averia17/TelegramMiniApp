import copy
import sys
import unittest
from pathlib import Path


TOOLS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS_DIR))

from generate_combat_profile import validate_generated_artifacts
from validate_hero_combat_contracts import validate as validate_hero_combat_contracts
from validate_combat_profile import read_catalog, read_profile, validate_profile


class CombatProfileValidationTests(unittest.TestCase):
    def test_current_profile_matches_active_hero_catalog(self):
        profile = read_profile()
        catalog = read_catalog()

        self.assertEqual(validate_profile(profile, catalog), [])
        self.assertEqual(
            set(profile["heroes"]),
            {hero["id"] for hero in catalog["heroes"] if hero.get("status") == "active"},
        )

    def test_profile_separates_green_hp_cube_from_optional_non_hp_loot(self):
        loot = read_profile()["defaults"]["loot"]
        self.assertEqual(loot["healthPickupIds"], ["health_boost"])
        self.assertEqual(loot["nonHpPickupMode"], "optional_bonus")
        self.assertIn("lunar_speed", loot["nonHpPickupIds"])
        self.assertFalse(loot["nonHpAffectsCurrentLives"])

    def test_validator_rejects_a_second_health_pickup_type(self):
        profile = copy.deepcopy(read_profile())
        profile["defaults"]["loot"]["healthPickupIds"].append("potion-red")

        errors = validate_profile(profile, read_catalog())

        self.assertTrue(any("healthPickupIds" in error for error in errors))

    def test_validator_rejects_missing_hero_basic_contract(self):
        profile = copy.deepcopy(read_profile())
        profile["heroes"]["needle"]["basic"].pop("abilityId")

        errors = validate_profile(profile, read_catalog())

        self.assertTrue(any("needle.basic.abilityId" in error for error in errors))

    def test_validator_rejects_duplicate_or_unknown_hero_contracts(self):
        profile = copy.deepcopy(read_profile())
        profile["heroes"]["unknown"] = copy.deepcopy(profile["heroes"]["needle"])

        errors = validate_profile(profile, read_catalog())

        self.assertTrue(any("hero set" in error for error in errors))

    def test_every_hero_declares_a_role_power_budget_vector(self):
        profile = read_profile()
        budget_keys = {"threat", "control", "safety", "mobility", "sustain", "information", "objectiveValue"}

        for hero_id, contract in profile["heroes"].items():
            vector = contract.get("powerBudgetVector")
            self.assertEqual(set(vector or {}), budget_keys, hero_id)
            self.assertGreaterEqual(max(vector.values()), 0.85, hero_id)
            self.assertLessEqual(sum(vector.values()), 5.0, hero_id)

    def test_validator_rejects_an_incomplete_power_budget_vector(self):
        profile = copy.deepcopy(read_profile())
        profile["heroes"]["needle"]["powerBudgetVector"].pop("control")

        errors = validate_profile(profile, read_catalog())

        self.assertTrue(any("powerBudgetVector" in error for error in errors))

    def test_validator_rejects_unknown_legacy_fields(self):
        profile = copy.deepcopy(read_profile())
        profile["heroes"]["needle"]["basic"]["legacyCooldown"] = 9000

        errors = validate_profile(profile, read_catalog())

        self.assertTrue(any("legacyCooldown" in error for error in errors))

    def test_generated_backend_and_frontend_views_are_in_sync(self):
        self.assertEqual(validate_generated_artifacts(), [])

    def test_first_vertical_slice_contracts_match_the_combat_profile(self):
        self.assertEqual(validate_hero_combat_contracts(), [])


if __name__ == "__main__":
    unittest.main()
