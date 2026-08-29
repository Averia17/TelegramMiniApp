"""Validate the versioned combat balance profile against the hero catalog."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "docs" / "combat-profile.json"
CATALOG_PATH = ROOT / "docs" / "hero-catalog.json"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_profile() -> dict[str, Any]:
    return read_json(PROFILE_PATH)


def read_catalog() -> dict[str, Any]:
    return read_json(CATALOG_PATH)


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _require_number(
    errors: list[str], value: Any, path: str, *, minimum: float | None = None
) -> None:
    if not _is_number(value):
        errors.append(f"{path} must be a number")
    elif minimum is not None and value < minimum:
        errors.append(f"{path} must be >= {minimum}")


def _require_integer(
    errors: list[str], value: Any, path: str, *, minimum: int | None = None
) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        errors.append(f"{path} must be an integer")
    elif minimum is not None and value < minimum:
        errors.append(f"{path} must be >= {minimum}")


def _require_fraction(errors: list[str], value: Any, path: str) -> None:
    if not _is_number(value):
        errors.append(f"{path} must be a number")
    elif value < 0 or value > 1:
        errors.append(f"{path} must be between 0 and 1")


def _require_string(errors: list[str], value: Any, path: str) -> None:
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{path} must be a non-empty string")


def _require_keys(
    errors: list[str], value: Any, path: str, keys: tuple[str, ...]
) -> None:
    if not isinstance(value, dict):
        errors.append(f"{path} must be an object")
        return
    for key in keys:
        if key not in value:
            errors.append(f"{path}.{key} is required")


def _reject_unknown_keys(
    errors: list[str], value: Any, path: str, keys: tuple[str, ...]
) -> None:
    if not isinstance(value, dict):
        return
    allowed = set(keys)
    for key in value:
        if key not in allowed:
            errors.append(f"{path}.{key} is not a supported profile field")


def validate_profile(profile: dict[str, Any], catalog: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    _require_keys(
        errors,
        profile,
        "profile",
        (
            "schemaVersion",
            "profileId",
            "profileRevision",
            "modes",
            "defaults",
            "heroes",
        ),
    )
    _reject_unknown_keys(
        errors,
        profile,
        "profile",
        (
            "$schema",
            "schemaVersion",
            "profileId",
            "profileRevision",
            "purpose",
            "modes",
            "defaults",
            "heroes",
        ),
    )
    if profile.get("schemaVersion") != 1:
        errors.append("profile.schemaVersion must be 1")
    _require_string(errors, profile.get("profileId"), "profile.profileId")
    _require_string(errors, profile.get("profileRevision"), "profile.profileRevision")

    modes = profile.get("modes")
    if (
        not isinstance(modes, list)
        or not modes
        or any(not isinstance(mode, str) for mode in modes)
    ):
        errors.append("profile.modes must be a non-empty string list")

    defaults = profile.get("defaults")
    _require_keys(
        errors,
        defaults,
        "profile.defaults",
        (
            "super",
            "gadget",
            "healthBoost",
            "respawn",
            "pickup",
            "loot",
            "bats",
            "telegraph",
            "ai",
        ),
    )
    if isinstance(defaults, dict):
        _reject_unknown_keys(
            errors,
            defaults,
            "profile.defaults",
            (
                "super",
                "gadget",
                "healthBoost",
                "respawn",
                "pickup",
                "loot",
                "bats",
                "telegraph",
                "ai",
            ),
        )
        _require_keys(
            errors,
            defaults.get("super"),
            "profile.defaults.super",
            ("maxChargePercent", "startChargePercent", "chargeSources"),
        )
        _require_keys(
            errors,
            defaults.get("gadget"),
            "profile.defaults.gadget",
            ("maxCharges", "chargesOnSpawn", "cooldownPolicy"),
        )
        _require_keys(
            errors,
            defaults.get("healthBoost"),
            "profile.defaults.healthBoost",
            (
                "pickupId",
                "stat",
                "fraction",
                "teamFraction",
                "maxStacks",
                "maxActivePickups",
                "ttlMs",
                "healsCurrentLives",
            ),
        )
        _require_keys(
            errors,
            defaults.get("respawn"),
            "profile.defaults.respawn",
            (
                "preserveHealthBoostStacks",
                "resetSuperCharge",
                "resetStatuses",
                "refillAmmo",
                "preserveGadgetCharges",
            ),
        )
        _require_keys(
            errors,
            defaults.get("pickup"),
            "profile.defaults.pickup",
            ("claimPolicy", "collectorOnly"),
        )
        _require_keys(
            errors,
            defaults.get("loot"),
            "profile.defaults.loot",
            (
                "healthPickupIds",
                "nonHpPickupIds",
                "nonHpPickupMode",
                "nonHpAffectsCurrentLives",
            ),
        )
        _require_keys(
            errors,
            defaults.get("bats"),
            "profile.defaults.bats",
            ("role", "respawnPolicy", "target"),
        )
        _require_keys(
            errors,
            defaults.get("telegraph"),
            "profile.defaults.telegraph",
            ("minDurationMs",),
        )
        _require_keys(
            errors,
            defaults.get("ai"),
            "profile.defaults.ai",
            (
                "lowHealthRetreatFraction",
                "criticalHealthRetreatFraction",
                "superUseAdvantageFraction",
                "pickupContestHealthFraction",
            ),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("super"),
            "profile.defaults.super",
            ("maxChargePercent", "startChargePercent", "chargeSources"),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("gadget"),
            "profile.defaults.gadget",
            ("maxCharges", "chargesOnSpawn", "cooldownPolicy"),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("healthBoost"),
            "profile.defaults.healthBoost",
            (
                "pickupId",
                "stat",
                "fraction",
                "teamFraction",
                "maxStacks",
                "maxActivePickups",
                "ttlMs",
                "healsCurrentLives",
            ),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("respawn"),
            "profile.defaults.respawn",
            (
                "preserveHealthBoostStacks",
                "resetSuperCharge",
                "resetStatuses",
                "refillAmmo",
                "preserveGadgetCharges",
            ),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("pickup"),
            "profile.defaults.pickup",
            ("claimPolicy", "collectorOnly"),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("loot"),
            "profile.defaults.loot",
            (
                "healthPickupIds",
                "nonHpPickupIds",
                "nonHpPickupMode",
                "nonHpAffectsCurrentLives",
            ),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("bats"),
            "profile.defaults.bats",
            ("role", "respawnPolicy", "target"),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("telegraph"),
            "profile.defaults.telegraph",
            ("minDurationMs",),
        )
        _reject_unknown_keys(
            errors,
            defaults.get("ai"),
            "profile.defaults.ai",
            (
                "lowHealthRetreatFraction",
                "criticalHealthRetreatFraction",
                "superUseAdvantageFraction",
                "pickupContestHealthFraction",
            ),
        )
        super_defaults = defaults.get("super")
        if isinstance(super_defaults, dict):
            _require_integer(
                errors,
                super_defaults.get("maxChargePercent"),
                "profile.defaults.super.maxChargePercent",
                minimum=1,
            )
            _require_integer(
                errors,
                super_defaults.get("startChargePercent"),
                "profile.defaults.super.startChargePercent",
                minimum=0,
            )
            if (
                _is_number(super_defaults.get("maxChargePercent"))
                and _is_number(super_defaults.get("startChargePercent"))
                and super_defaults["startChargePercent"]
                > super_defaults["maxChargePercent"]
            ):
                errors.append(
                    "profile.defaults.super.startChargePercent must be <= maxChargePercent"
                )
        gadget_defaults = defaults.get("gadget")
        if isinstance(gadget_defaults, dict):
            _require_integer(
                errors,
                gadget_defaults.get("maxCharges"),
                "profile.defaults.gadget.maxCharges",
                minimum=1,
            )
            _require_integer(
                errors,
                gadget_defaults.get("chargesOnSpawn"),
                "profile.defaults.gadget.chargesOnSpawn",
                minimum=0,
            )
            if (
                _is_number(gadget_defaults.get("maxCharges"))
                and _is_number(gadget_defaults.get("chargesOnSpawn"))
                and gadget_defaults["chargesOnSpawn"] > gadget_defaults["maxCharges"]
            ):
                errors.append(
                    "profile.defaults.gadget.chargesOnSpawn must be <= maxCharges"
                )
        health_defaults = defaults.get("healthBoost")
        _require_fraction(
            errors,
            (
                health_defaults.get("fraction")
                if isinstance(health_defaults, dict)
                else None
            ),
            "profile.defaults.healthBoost.fraction",
        )
        _require_fraction(
            errors,
            (
                health_defaults.get("teamFraction")
                if isinstance(health_defaults, dict)
                else None
            ),
            "profile.defaults.healthBoost.teamFraction",
        )
        _require_integer(
            errors,
            (
                health_defaults.get("maxStacks")
                if isinstance(health_defaults, dict)
                else None
            ),
            "profile.defaults.healthBoost.maxStacks",
            minimum=1,
        )
        _require_integer(
            errors,
            (
                health_defaults.get("maxActivePickups")
                if isinstance(health_defaults, dict)
                else None
            ),
            "profile.defaults.healthBoost.maxActivePickups",
            minimum=1,
        )
        _require_integer(
            errors,
            health_defaults.get("ttlMs") if isinstance(health_defaults, dict) else None,
            "profile.defaults.healthBoost.ttlMs",
            minimum=1,
        )
        if (
            isinstance(health_defaults, dict)
            and _is_number(health_defaults.get("fraction"))
            and _is_number(health_defaults.get("teamFraction"))
            and health_defaults["teamFraction"] > health_defaults["fraction"]
        ):
            errors.append(
                "profile.defaults.healthBoost.teamFraction must be <= fraction"
            )
        health_boost = defaults.get("healthBoost")
        heals_current_lives = (
            health_boost.get("healsCurrentLives")
            if isinstance(health_boost, dict)
            else None
        )
        if not isinstance(heals_current_lives, bool):
            errors.append(
                "profile.defaults.healthBoost.healsCurrentLives must be a boolean"
            )
        elif heals_current_lives:
            errors.append(
                "profile.defaults.healthBoost.healsCurrentLives must be false for MaxHP-only health boosts"
            )
        ai_defaults = defaults.get("ai")
        if isinstance(ai_defaults, dict):
            for key in (
                "lowHealthRetreatFraction",
                "criticalHealthRetreatFraction",
                "superUseAdvantageFraction",
                "pickupContestHealthFraction",
            ):
                _require_fraction(
                    errors, ai_defaults.get(key), f"profile.defaults.ai.{key}"
                )
            if (
                _is_number(ai_defaults.get("criticalHealthRetreatFraction"))
                and _is_number(ai_defaults.get("lowHealthRetreatFraction"))
                and ai_defaults["criticalHealthRetreatFraction"]
                > ai_defaults["lowHealthRetreatFraction"]
            ):
                errors.append(
                    "profile.defaults.ai.criticalHealthRetreatFraction must be <= lowHealthRetreatFraction"
                )
        _require_number(
            errors,
            (
                defaults.get("telegraph", {}).get("minDurationMs")
                if isinstance(defaults.get("telegraph"), dict)
                else None
            ),
            "profile.defaults.telegraph.minDurationMs",
            minimum=1,
        )
        loot = defaults.get("loot")
        if isinstance(loot, dict):
            for key in ("healthPickupIds", "nonHpPickupIds"):
                values = loot.get(key)
                if not isinstance(values, list) or any(
                    not isinstance(item, str) or not item.strip() for item in values
                ):
                    errors.append(f"profile.defaults.loot.{key} must be a string list")
            if loot.get("healthPickupIds") != ["health_boost"]:
                errors.append(
                    "profile.defaults.loot.healthPickupIds must contain only health_boost"
                )
            health_ids = (
                set(loot.get("healthPickupIds", []))
                if isinstance(loot.get("healthPickupIds"), list)
                else set()
            )
            non_hp_ids = (
                set(loot.get("nonHpPickupIds", []))
                if isinstance(loot.get("nonHpPickupIds"), list)
                else set()
            )
            if health_ids & non_hp_ids:
                errors.append(
                    "profile.defaults.loot health and non-HP pickup ids must not overlap"
                )
            if loot.get("nonHpPickupMode") != "optional_bonus":
                errors.append(
                    "profile.defaults.loot.nonHpPickupMode must be optional_bonus"
                )
            if loot.get("nonHpAffectsCurrentLives") is not False:
                errors.append(
                    "profile.defaults.loot.nonHpAffectsCurrentLives must be false"
                )

    catalog_heroes = catalog.get("heroes", [])
    active_catalog = {
        hero.get("id"): hero
        for hero in catalog_heroes
        if hero.get("status") == "active"
    }
    heroes = profile.get("heroes")
    if not isinstance(heroes, dict):
        errors.append("profile.heroes must be an object keyed by hero id")
        return errors
    if set(heroes) != set(active_catalog):
        errors.append(
            f"hero set mismatch: profile={sorted(heroes)}, catalog={sorted(active_catalog)}"
        )

    required_basic = (
        "abilityId",
        "attackType",
        "attackDamage",
        "attackCooldownMs",
        "reloadTimeMs",
        "maxAmmo",
        "archetype",
        "range",
    )
    budget_keys = (
        "threat",
        "control",
        "safety",
        "mobility",
        "sustain",
        "information",
        "objectiveValue",
    )
    for hero_id, contract in heroes.items():
        path = f"profile.heroes.{hero_id}"
        catalog_hero = active_catalog.get(hero_id)
        if catalog_hero is None:
            continue
        if not isinstance(contract, dict):
            errors.append(f"{path} must be an object")
            continue
        _reject_unknown_keys(
            errors,
            contract,
            "profile.heroes.%s" % hero_id,
            ("role", "powerBudget", "powerBudgetVector", "basic", "super", "gadget"),
        )
        _require_string(errors, contract.get("role"), f"{path}.role")
        if contract.get("role") != catalog_hero.get("identity", {}).get("role"):
            errors.append(f"{path}.role differs from hero catalog")
        _require_number(
            errors, contract.get("powerBudget"), f"{path}.powerBudget", minimum=0.1
        )
        budget = contract.get("powerBudgetVector")
        _require_keys(errors, budget, f"{path}.powerBudgetVector", budget_keys)
        if isinstance(budget, dict):
            for key in budget_keys:
                _require_fraction(
                    errors, budget.get(key), f"{path}.powerBudgetVector.{key}"
                )
            if not any(
                _is_number(budget.get(key)) and budget[key] >= 0.85
                for key in budget_keys
            ):
                errors.append(
                    f"{path}.powerBudgetVector must have a signature value >= 0.85"
                )
        basic = contract.get("basic")
        _require_keys(errors, basic, f"{path}.basic", required_basic)
        catalog_balance = catalog_hero.get("balance", {})
        catalog_attack = catalog_hero.get("basicAttack", {})
        if isinstance(basic, dict):
            _reject_unknown_keys(errors, basic, f"{path}.basic", required_basic)
            comparisons = {
                "abilityId": (
                    catalog_hero.get("abilities", {}).get("basic", {}).get("id"),
                    "ability id",
                ),
                "attackType": (catalog_balance.get("attackType"), "attack type"),
                "attackDamage": (catalog_balance.get("attackDamage"), "attack damage"),
                "attackCooldownMs": (
                    catalog_balance.get("attackRateMs"),
                    "attack cooldown",
                ),
                "reloadTimeMs": (catalog_balance.get("reloadTimeMs"), "reload time"),
                "maxAmmo": (catalog_balance.get("maxAmmo"), "max ammo"),
                "archetype": (catalog_attack.get("archetype"), "attack archetype"),
                "range": (catalog_attack.get("range"), "attack range"),
            }
            for key, (expected, label) in comparisons.items():
                if basic.get(key) != expected:
                    errors.append(f"{path}.basic.{key} differs from catalog {label}")
        for slot in ("super", "gadget"):
            ability = contract.get(slot)
            _require_keys(errors, ability, f"{path}.{slot}", ("abilityId",))
            if isinstance(ability, dict):
                allowed = (
                    ("abilityId", "chargeWeight", "cooldownMs")
                    if slot == "super"
                    else ("abilityId", "maxCharges", "cooldownMs")
                )
                _reject_unknown_keys(errors, ability, f"{path}.{slot}", allowed)
                expected_id = catalog_hero.get("abilities", {}).get(slot, {}).get("id")
                if ability.get("abilityId") != expected_id:
                    errors.append(f"{path}.{slot}.abilityId differs from catalog")
                _require_integer(
                    errors,
                    ability.get("cooldownMs"),
                    f"{path}.{slot}.cooldownMs",
                    minimum=1,
                )
        if isinstance(contract.get("super"), dict):
            _require_number(
                errors,
                contract["super"].get("chargeWeight"),
                f"{path}.super.chargeWeight",
                minimum=0.1,
            )
        if isinstance(contract.get("gadget"), dict):
            _require_number(
                errors,
                contract["gadget"].get("maxCharges"),
                f"{path}.gadget.maxCharges",
                minimum=1,
            )

    return errors


def validate() -> list[str]:
    try:
        return validate_profile(read_profile(), read_catalog())
    except (OSError, json.JSONDecodeError, TypeError) as exc:
        return [f"combat profile validation could not run: {exc}"]


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"[ERROR] {error}")
        return 1
    print("[OK] combat profile is valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
