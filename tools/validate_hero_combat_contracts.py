"""Validate the contract cards used by the first combat vertical slices."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS_PATH = ROOT / "docs" / "hero-combat-contracts.json"
PROFILE_PATH = ROOT / "docs" / "combat-profile.json"
HERO_DISPLAY_NAMES = {
    "needle": "Needle",
    "mandy": "Mandy",
    "fairy-mina": "Fairy Mina",
    "brock-zeus": "Brock Zeus",
    "wukong-mico": "Wukong Mico",
    "persephone-lumi": "Persephone Lumi",
    "kaze": "Kaze",
    "katty": "Katty",
}

REQUIRED_ABILITY_KEYS = (
    "abilityId", "target", "castMs", "telegraphMs", "activeWindowMs",
    "recoveryMs", "counterplayWindowMs",
    "impact", "status", "resourceCost", "missOutcome", "interrupt",
    "telemetryEvent",
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_contracts(contracts: dict[str, Any], profile: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    heroes = contracts.get("heroes")
    profile_heroes = profile.get("heroes", {})
    if contracts.get("profileRevision") != profile.get("profileRevision"):
        errors.append(
            "contracts.profileRevision must match profile.profileRevision "
            f"({contracts.get('profileRevision')!r} != {profile.get('profileRevision')!r})"
        )
    if not isinstance(heroes, dict) or not heroes:
        return ["contracts.heroes must be a non-empty object"]

    expected_hero_ids = set(profile_heroes)
    missing_hero_ids = sorted(expected_hero_ids - set(heroes))
    if missing_hero_ids:
        errors.append(f"contracts.heroes is missing active heroes: {', '.join(missing_hero_ids)}")
    extra_hero_ids = sorted(set(heroes) - expected_hero_ids)
    if extra_hero_ids:
        errors.append(f"contracts.heroes contains inactive heroes: {', '.join(extra_hero_ids)}")

    for hero_id, contract in heroes.items():
        path = f"contracts.heroes.{hero_id}"
        if hero_id not in profile_heroes:
            errors.append(f"{path} is not present in combat profile")
        if not isinstance(contract, dict):
            errors.append(f"{path} must be an object")
            continue
        profile_hero = profile_heroes.get(hero_id, {})
        if contract.get("role") != profile_hero.get("role"):
            errors.append(
                f"{path}.role differs from combat profile "
                f"({contract.get('role')!r} != {profile_hero.get('role')!r})"
            )
        for key in ("role", "fantasy", "winCondition", "counterplay", "soloAcceptance", "teamAcceptance"):
            if not isinstance(contract.get(key), str) or not contract[key].strip():
                errors.append(f"{path}.{key} must be a non-empty string")
        matchups = contract.get("benchmarkMatchups")
        if not isinstance(matchups, list) or not 2 <= len(matchups) <= 3:
            errors.append(f"{path}.benchmarkMatchups must contain 2 or 3 entries")
        else:
            seen_opponents: set[str] = set()
            active_names = set(HERO_DISPLAY_NAMES.values())
            for index, matchup in enumerate(matchups):
                matchup_path = f"{path}.benchmarkMatchups[{index}]"
                if not isinstance(matchup, dict):
                    errors.append(f"{matchup_path} must be an object")
                    continue
                for key in ("opponent", "scenario", "expectedAdvantage", "counterplayMetric"):
                    if not isinstance(matchup.get(key), str) or not matchup[key].strip():
                        errors.append(f"{matchup_path}.{key} must be a non-empty string")
                opponent = matchup.get("opponent")
                if isinstance(opponent, str):
                    if opponent in seen_opponents:
                        errors.append(f"{matchup_path}.opponent must be unique")
                    seen_opponents.add(opponent)
                    if opponent not in active_names:
                        errors.append(f"{matchup_path}.opponent must be an active hero name")
                    if opponent == HERO_DISPLAY_NAMES.get(hero_id):
                        errors.append(f"{matchup_path}.opponent cannot be the same hero")
        abilities = contract.get("abilities")
        if not isinstance(abilities, dict) or set(abilities) != {"basic", "super", "gadget"}:
            errors.append(f"{path}.abilities must contain basic, super and gadget")
            continue
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
            for key in ("castMs", "telegraphMs", "activeWindowMs", "recoveryMs", "counterplayWindowMs"):
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
