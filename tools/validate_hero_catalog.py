"""Validate the AI-maintained hero catalog against runtime contracts.

This intentionally uses only the Python standard library so it can run in CI,
from an agent session, and from a fresh checkout without extra dependencies.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "docs" / "hero-catalog.json"
HEROES_GO = ROOT / "battle" / "model" / "game" / "heroes.go"
ATTACK_CONFIG_GO = ROOT / "battle" / "model" / "game" / "attack_config.go"
ANIMATION_MANIFEST = ROOT / "tools" / "blender" / "hero_animation_scene_manifest.json"

ARCHETYPES = {
    "AttackProjectile": "projectile",
    "AttackBurst": "burst",
    "AttackShotgun": "shotgun",
    "AttackPiercingArea": "piercing_area",
    "AttackThrower": "thrower",
    "AttackDash": "dash",
    "AttackReturning": "returning",
    "AttackMeleeCone": "melee_cone",
}

GO_TO_CATALOG = {
    "Color": ("identity", "color"),
    "Radius": ("identity", "radius"),
    "Role": ("identity", "role"),
    "MaxLives": ("balance", "maxLives"),
    "Speed": ("balance", "speed"),
    "AttackDamage": ("balance", "attackDamage"),
    "AttackRate": ("balance", "attackRateMs"),
    "ReloadTime": ("balance", "reloadTimeMs"),
    "MaxAmmo": ("balance", "maxAmmo"),
    "BulletSpeed": ("balance", "bulletSpeed"),
    "BulletSize": ("balance", "bulletSize"),
    "RegenRate": ("balance", "regenRate"),
    "AttackType": ("balance", "attackType"),
}

ATTACK_FIELDS = {
    "Archetype": "archetype",
    "AimShape": "aimShape",
    "Range": "range",
    "ProjectileKind": "projectileKind",
    "ProjectileCount": "projectileCount",
    "SpreadDegrees": "spreadDegrees",
    "Pierce": "pierce",
    "Poison": "poison",
    "SplashRadius": "splashRadius",
    "Chain": "chain",
    "HalfArcDegrees": "halfArcDegrees",
    "DashDistance": "dashDistance",
    "FlightTimeMs": "flightTimeMs",
    "ImpactRadius": "impactRadius",
    "ZoneTicks": "zoneTicks",
    "ZoneIntervalMs": "zoneIntervalMs",
    "Modifier": "modifier",
}


def parse_literal(value: str) -> Any:
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return json.loads(value)
    if value in {"true", "false"}:
        return value == "true"
    if re.fullmatch(r"[-+]?\d+", value):
        return int(value)
    if re.fullmatch(r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)", value):
        return float(value)
    return value


def parse_go_fields(body: str, fields: list[str]) -> dict[str, Any]:
    parsed: dict[str, Any] = {}
    for field in fields:
        match = re.search(
            rf"\b{re.escape(field)}:\s*(\"(?:\\.|[^\"])*\"|[-+]?(?:\d+(?:\.\d*)?|\.\d+)|true|false|[A-Za-z_][A-Za-z0-9_]*)",
            body,
        )
        if match:
            parsed[field] = parse_literal(match.group(1))
    return parsed


def read_catalog() -> dict[str, Any]:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def parse_game_heroes() -> dict[str, dict[str, Any]]:
    source = HEROES_GO.read_text(encoding="utf-8")
    result: dict[str, dict[str, Any]] = {}
    fields = list(GO_TO_CATALOG)
    for match in re.finditer(r'\{Name:\s*"([^"]+)"(?P<body>[^}]*)\},', source):
        name = match.group(1)
        result[name] = parse_go_fields(match.group("body"), fields)
    return result


def parse_attack_configs() -> dict[str, dict[str, Any]]:
    source = ATTACK_CONFIG_GO.read_text(encoding="utf-8")
    result: dict[str, dict[str, Any]] = {}
    for match in re.finditer(r'"([^"]+)":\s*\{(?P<body>[^}]*)\},', source):
        raw = parse_go_fields(match.group("body"), list(ATTACK_FIELDS))
        if "Archetype" not in raw:
            continue
        parsed = {ATTACK_FIELDS[key]: value for key, value in raw.items()}
        parsed["archetype"] = ARCHETYPES.get(parsed["archetype"], parsed["archetype"])
        result[match.group(1)] = parsed
    return result


def close_enough(left: Any, right: Any) -> bool:
    if isinstance(left, float) or isinstance(right, float):
        return abs(float(left) - float(right)) < 1e-9
    return left == right


def add_error(errors: list[str], message: str) -> None:
    errors.append(message)


def validate() -> list[str]:
    errors: list[str] = []
    catalog = read_catalog()
    heroes = catalog.get("heroes", [])
    by_name = {hero.get("name"): hero for hero in heroes}

    if len(by_name) != len(heroes):
        add_error(errors, "catalog contains duplicate or empty hero names")

    for relative, expected_hash in catalog.get("sourceFingerprints", {}).items():
        path = ROOT / relative
        if not path.exists():
            add_error(errors, f"fingerprint source is missing: {relative}")
            continue
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest().upper()
        if actual_hash != expected_hash.upper():
            add_error(errors, f"catalog fingerprint is stale: {relative}")

    source_heroes = parse_game_heroes()
    source_attacks = parse_attack_configs()
    manifest = json.loads(ANIMATION_MANIFEST.read_text(encoding="utf-8"))
    catalog_active = {hero["name"] for hero in heroes if hero.get("status") == "active"}

    if catalog_active != set(source_heroes):
        add_error(
            errors,
            f"active hero set mismatch: catalog={sorted(catalog_active)}, source={sorted(source_heroes)}",
        )

    contracts = catalog.get("contracts", {})
    if contracts.get("runtimeAnimationFps") != manifest.get("fps"):
        add_error(errors, "runtime animation fps differs from Blender manifest")
    if contracts.get("runtimeAnimationClips") != manifest.get("event_clips"):
        add_error(errors, "runtime animation clip list differs from Blender manifest")
    expected_ability_clips = {
        str(value).lower()
        for value in contracts.get("abilityAnimationClips", {}).values()
    }
    if not expected_ability_clips.issubset(set(manifest.get("ability_clips", []))):
        add_error(
            errors, "ability animation map contains a clip absent from Blender manifest"
        )

    for name, source in source_heroes.items():
        hero = by_name.get(name)
        if hero is None:
            add_error(errors, f"source hero is missing from catalog: {name}")
            continue
        for go_field, (section, catalog_field) in GO_TO_CATALOG.items():
            expected = source.get(go_field)
            if expected is None and catalog_field in {
                "radius",
                "maxLives",
                "speed",
                "attackDamage",
                "attackRateMs",
                "reloadTimeMs",
                "maxAmmo",
                "bulletSpeed",
                "bulletSize",
                "regenRate",
            }:
                expected = 0
            actual = hero.get(section, {}).get(catalog_field)
            if not close_enough(actual, expected):
                add_error(
                    errors,
                    f"{name}: {section}.{catalog_field}={actual!r}, source={expected!r}",
                )

        expected_attack = source_attacks.get(name)
        actual_attack = hero.get("basicAttack", {})
        if expected_attack is None:
            add_error(errors, f"{name}: attack config is missing from source")
        elif actual_attack != expected_attack:
            add_error(errors, f"{name}: basicAttack differs from attack_config.go")

        abilities = hero.get("abilities", {})
        for slot in ("basic", "super", "gadget"):
            ability = abilities.get(slot, {})
            if not ability.get("id") or not ability.get("description"):
                add_error(
                    errors, f"{name}: {slot} ability must have id and description"
                )

        animation = hero.get("animations", {})
        manifest_slug = animation.get("manifestSlug", hero.get("slug"))
        expected_animation_clips = list(contracts.get("runtimeAnimationClips", []))
        expected_animation_clips.extend(
            manifest.get("hero_animation_extras", {}).get(manifest_slug, [])
        )
        if animation.get("available") != expected_animation_clips:
            add_error(
                errors,
                f"{name}: per-hero animation list differs from the runtime contract",
            )
        if animation.get("abilityClips", {}).get("basic") != contracts.get(
            "abilityAnimationClips", {}
        ).get("basic"):
            add_error(errors, f"{name}: basic ability animation mapping is stale")
        if animation.get("abilityClips", {}).get("super") != contracts.get(
            "abilityAnimationClips", {}
        ).get("super"):
            add_error(errors, f"{name}: super ability animation mapping is stale")
        if animation.get("abilityClips", {}).get("gadget") != contracts.get(
            "abilityAnimationClips", {}
        ).get("gadget"):
            add_error(errors, f"{name}: gadget ability animation mapping is stale")

        if manifest_slug and manifest_slug not in manifest.get("heroes", []):
            add_error(
                errors, f"{name}: animation manifest has no hero slug {manifest_slug!r}"
            )

        for asset_key in (
            "sourceMaster",
            "sceneDirectory",
            "runtimeHero",
        ):
            asset_path = hero.get("assets", {}).get(asset_key)
            if asset_path and not (ROOT / asset_path).exists():
                add_error(errors, f"{name}: missing asset {asset_key}: {asset_path}")

    return errors


def main() -> int:
    try:
        errors = validate()
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"[ERROR] catalog validation could not run: {exc}")
        return 2
    if errors:
        for error in errors:
            print(f"[ERROR] {error}")
        return 1
    print(f"[OK] hero catalog is synchronized ({len(read_catalog()['heroes'])} cards)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
