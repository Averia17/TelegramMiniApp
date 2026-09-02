import hashlib

SCHEMA_VERSION = "bot-ml-observation-v1"
OBSERVATION_SIZE = 48
COMBAT_PROFILE_ID = "combat-profile"
COMBAT_RULES_VERSION = "2026-08-29-kaze-cadence"

FEATURE_NAMES = [
    "health_fraction",
    "target_health_fraction",
    "target_distance",
    "pickup_distance",
    "preferred_range",
    "attack_range",
    "visible_enemies",
    "visible_allies",
    "health_stacks",
    "ammo_fraction",
    "target_none",
    "target_player",
    "target_monster",
    "target_objective",
    "pickup_present",
    "pickup_health_boost",
    "pickup_lunar",
    "pickup_contested",
    "pickup_enemy_distance",
    "target_present",
    "target_in_attack_range",
    "target_stunned",
    "target_recently_fired",
    "bot_expected_damage",
    "target_expected_damage",
    "bot_time_to_kill",
    "target_time_to_kill",
    "bot_wins_damage_race",
    "target_wins_damage_race",
    "target_can_attack",
    "team_mode",
    "low_health",
    "empty_ammo",
    "current_roam",
    "current_engage",
    "current_retreat",
    "current_collect",
    "action_age",
    "target_memory_age",
    "target_contested",
    "target_bearing",
    "pickup_bearing",
    "position_x",
    "position_y",
    "storm_pressure",
    "aim_error",
    "velocity_x",
    "velocity_y",
]

ACTION_NAMES = ["roam", "engage", "retreat", "collect_pickup"]


def schema_fingerprint() -> str:
    payload = "\x00".join(
        [SCHEMA_VERSION, "\x00".join(FEATURE_NAMES), *ACTION_NAMES]
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


SCHEMA_FINGERPRINT = schema_fingerprint()
