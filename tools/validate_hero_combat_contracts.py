"""Validate the contract cards used by the first combat vertical slices."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS_PATH = ROOT / "docs" / "hero-combat-contracts.json"
PROFILE_PATH = ROOT / "docs" / "combat-profile.json"

REQUIRED_ABILITY_KEYS = (
    "abilityId", "target", "castMs", "telegraphMs", "activeWindowMs",
    "impact", "status", "resourceCost", "missOutcome", "interrupt",
    "telemetryEvent",
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_contracts(contracts: dict[str, Any], profile: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    heroes = contracts.get("heroes")
    profile_heroes = profile.get("heroes", {})
    if not isinstance(heroes, dict) or not heroes:
        return ["contracts.heroes must be a non-empty object"]

    for hero_id, contract in heroes.items():
        path = f"contracts.heroes.{hero_id}"
        if hero_id not in profile_heroes:
            errors.append(f"{path} is not present in combat profile")
        if not isinstance(contract, dict):
            errors.append(f"{path} must be an object")
            continue
        for key in ("role", "fantasy", "winCondition", "counterplay", "soloAcceptance", "teamAcceptance"):
            if not isinstance(contract.get(key), str) or not contract[key].strip():
                errors.append(f"{path}.{key} must be a non-empty string")
        abilities = contract.get("abilities")
        if not isinstance(abilities, dict) or set(abilities) != {"basic", "super", "gadget"}:
            errors.append(f"{path}.abilities must contain basic, super and gadget")
            continue
        profile_hero = profile_heroes.get(hero_id, {})
        for slot, ability in abilities.items():
            ability_path = f"{path}.abilities.{slot}"
            if not isinstance(ability, dict):
                errors.append(f"{ability_path} must be an object")
                continue
            for key in REQUIRED_ABILITY_KEYS:
                if key not in ability:
                    errors.append(f"{ability_path}.{key} is required")
            expected_id = profile_hero.get(slot, {}).get("abilityId")
            if ability.get("abilityId") != expected_id:
                errors.append(f"{ability_path}.abilityId differs from combat profile")
            for key in ("castMs", "telegraphMs", "activeWindowMs"):
                value = ability.get(key)
                if not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0:
                    errors.append(f"{ability_path}.{key} must be a non-negative number")
            if not isinstance(ability.get("status"), list) or not ability["status"]:
                errors.append(f"{ability_path}.status must be a non-empty list")
            if not isinstance(ability.get("resourceCost"), dict) or not ability["resourceCost"]:
                errors.append(f"{ability_path}.resourceCost must be a non-empty object")
            for key in ("target", "impact", "missOutcome", "interrupt", "telemetryEvent"):
                if not isinstance(ability.get(key), str) or not ability[key].strip():
                    errors.append(f"{ability_path}.{key} must be a non-empty string")
    return errors


def validate() -> list[str]:
    return validate_contracts(read_json(CONTRACTS_PATH), read_json(PROFILE_PATH))


if __name__ == "__main__":
    errors = validate()
    if errors:
        for error in errors:
            print(f"[ERROR] {error}")
        raise SystemExit(1)
    print("[OK] hero combat contracts are valid")
