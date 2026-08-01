"""Frame-accurate skill choreography for the eight shipped heroes.

The tables in the design brief describe semantic movement, while each source
hero uses a different local rig.  This module keeps the timing and intent in a
single data set and lets the author map it onto the discovered body chains.
Every frame is sampled explicitly by the Blender author; the resulting curves
are then auto-clamped Bezier curves for a continuous, natural result.
"""

from __future__ import annotations

import math

FRAME_ENDS = {
    "needle": {"attack": 24, "super": 42, "gadget": 24},
    "mandy": {"attack": 28, "super": 55, "gadget": 58},
    "fairy-mina": {"attack": 24, "super": 55, "gadget": 34},
    "brock-zeus": {"attack": 24, "super": 54, "gadget": 40},
    "kaze": {"attack": 38, "super": 34, "gadget": 48},
    "wukong-mico": {"attack": 40, "super": 110, "gadget": 68},
    "damian": {"attack": 28, "super": 40, "gadget": 35},
    "persephone-lumi": {"attack": 35, "super": 40, "gadget": 30},
}


# Runtime VFX owns projectiles/zones.  These markers travel with the focused
# scene as metadata and give the runtime/harness an unambiguous event clock.
EVENT_FRAMES = {
    "needle": {
        "attack": {"spawn": 10, "flight_start": 12, "flight_end": 18},
        "super": {"contact": 16, "root_spawn": 24, "root_peak": 30},
        "gadget": {"dash_start": 4, "dash_end": 10, "spore_start": 10, "spore_end": 20},
    },
    "mandy": {
        "attack": {"impact": 16, "shockwave_start": 14, "shockwave_end": 16},
        "super": {"wave_start": 38, "charge_end": 30},
        "gadget": {"plant_start": 10, "stance_start": 18, "stance_end": 48},
    },
    "fairy-mina": {
        "attack": {"release": 12, "home_start": 12, "home_end": 20},
        "super": {
            "star_start": 5,
            "star_end": 25,
            "cocoon_start": 25,
            "cocoon_end": 40,
        },
        "gadget": {"wave_start": 10, "wave_end": 20, "stun": 16},
    },
    "brock-zeus": {
        "attack": {"fire": 10, "projectile_end": 12},
        "super": {"lightning_1": 18, "lightning_2": 30, "lightning_3": 42},
        "gadget": {"beam": 18, "beam_end": 32, "breach": 32},
    },
    "kaze": {
        "attack": {"slash_1": 8, "slash_2": 16, "slash_3": 27},
        "super": {"dash_start": 8, "dash_end": 14, "mark_start": 14, "mark_end": 20},
        "gadget": {
            "fade_start": 8,
            "fade_end": 18,
            "reveal_start": 28,
            "reveal_end": 38,
        },
    },
    "wukong-mico": {
        "attack": {"impact": 19},
        "super": {"spin_start": 12, "spin_end": 90},
        "gadget": {"armor_start": 10, "armor_end": 16, "burst": 55},
    },
    "damian": {
        "attack": {"cast_start": 12, "release": 18},
        "super": {"totem_start": 18, "totem_end": 28},
        "gadget": {
            "swap_start": 14,
            "swap_end": 18,
            "burst_start": 18,
            "burst_end": 26,
        },
    },
    "persephone-lumi": {
        "attack": {"release": 16, "trail_start": 16},
        "super": {"roots_start": 18, "roots_end": 28},
        "gadget": {"charge_start": 8, "burst_start": 15, "burst_end": 20},
    },
}


def _smooth(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def sample(frame: int, points: list[tuple[int, float]]) -> float:
    """Sample a semantic control with eased transitions at authored frames."""
    if not points:
        return 0.0
    if frame <= points[0][0]:
        return points[0][1]
    for (start, start_value), (end, end_value) in zip(points, points[1:]):
        if frame <= end:
            span = max(1, end - start)
            t = _smooth((frame - start) / span)
            return start_value + (end_value - start_value) * t
    return points[-1][1]


def _add(pose, name, x=0.0, y=0.0, z=0.0):
    if not name:
        return
    old = pose.get(name, (0.0, 0.0, 0.0))
    pose[name] = (old[0] + x, old[1] + y, old[2] + z)


def _body(pose, groups, frame, body):
    mapping = {
        "hips_bend": (groups.get("hips"), "x"),
        "hips_twist": (groups.get("hips"), "y"),
        "spine_bend": (groups.get("spine_lower"), "x"),
        "spine_twist": (groups.get("spine_lower"), "y"),
        "chest_bend": (groups.get("spine_upper"), "x"),
        "chest_twist": (groups.get("spine_upper"), "y"),
        "head_bend": (groups.get("head"), "x"),
        "head_twist": (groups.get("head"), "y"),
    }
    for channel, (name, axis) in mapping.items():
        if channel not in body:
            continue
        value = sample(frame, body[channel])
        _add(pose, name, **{axis: math.radians(value)})


def _arms(pose, groups, frame, arms):
    for side, controls in arms.items():
        sign = -1.0 if side == "L" else 1.0
        shoulder = sample(frame, controls.get("shoulder", []))
        elbow = sample(frame, controls.get("elbow", []))
        wrist = sample(frame, controls.get("wrist", []))
        _add(
            pose,
            groups.get(f"{side}_shoulder"),
            x=math.radians(shoulder),
            z=math.radians(sign * controls.get("shoulder_z", 0.0)),
        )
        _add(
            pose,
            groups.get(f"{side}_elbow"),
            x=math.radians(elbow),
            z=math.radians(sign * controls.get("elbow_z", 0.0)),
        )
        _add(
            pose,
            groups.get(f"{side}_wrist"),
            x=math.radians(wrist),
            z=math.radians(sign * controls.get("wrist_z", 0.0)),
        )


def _legs(pose, groups, frame, legs):
    for side, controls in legs.items():
        sign = -1.0 if side == "L" else 1.0
        _add(
            pose,
            groups.get(f"{side}_upper_leg"),
            x=math.radians(sample(frame, controls.get("thigh", []))),
            z=math.radians(sign * controls.get("thigh_z", 0.0)),
        )
        _add(
            pose,
            groups.get(f"{side}_knee"),
            x=math.radians(sample(frame, controls.get("knee", []))),
        )
        _add(
            pose,
            groups.get(f"{side}_ankle"),
            x=math.radians(sample(frame, controls.get("ankle", []))),
        )


def _fingers(pose, groups, frame, side, close_points, amount=18.0):
    fingers = groups.get("fingers_by_side", {}).get(side, {})
    close = sample(frame, close_points)
    # Index-to-pinky release order is intentionally delayed by one frame per
    # finger, which prevents a single rigid hand shape at the impact frame.
    order = ("index", "middle", "ring", "pinky", "thumb")
    for index, finger in enumerate(order):
        for bone in fingers.get(finger, []):
            delay = index * 0.08
            value = max(0.0, min(1.0, close - delay))
            _add(pose, bone, x=math.radians(amount * value))


def _wings(pose, groups, frame, points, wave=False):
    value = sample(frame, points)
    for index, name in enumerate(groups.get("wings", [])):
        extra = math.sin(frame * 0.65 + index) * value * 0.12 if wave else 0.0
        _add(pose, name, z=math.radians(value * (1 if index % 2 == 0 else -1) + extra))


def _profile(hero: str, clip: str):
    # Values are local semantic angles.  They deliberately stay below the
    # mechanical limit of the rigs; the visible arc is produced by the chain
    # (shoulder + elbow + wrist), not by one bone snapping 120 degrees.
    p = {
        "body": {},
        "arms": {},
        "legs": {},
        "fingers": [],
        "wings": None,
        "wing_wave": False,
    }
    if hero == "needle":
        if clip == "attack":
            p.update(
                body={
                    "hips_twist": [(1, 0), (7, 20), (12, -5), (22, 0), (24, 0)],
                    "spine_bend": [(1, 0), (7, -10), (12, 3), (22, 0), (24, 0)],
                    "spine_twist": [(1, 0), (7, 18), (12, -8), (22, 0), (24, 0)],
                    "head_twist": [(1, 0), (6, 15), (14, 15), (24, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (6, -32), (10, 36), (18, 4), (24, 0)],
                        "elbow": [(1, 0), (6, 35), (10, -18), (18, 10), (24, 0)],
                        "wrist": [(1, 0), (8, 0), (10, -28), (14, -8), (24, 0)],
                        "shoulder_z": 8,
                        "wrist_z": 7,
                    },
                    "L": {
                        "shoulder": [(1, 0), (10, 12), (18, 0), (24, 0)],
                        "elbow": [(1, 0), (10, -8), (18, 0), (24, 0)],
                    },
                },
                fingers=[(8, 0), (10, 1), (16, 0)],
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_bend": [(1, 0), (14, 18), (24, 18), (34, -10), (42, 0)],
                    "spine_bend": [(1, 0), (14, -40), (24, -40), (34, 10), (42, 0)],
                    "head_bend": [(1, 0), (18, 18), (24, 18), (30, -10), (42, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (14, 35),
                            (18, 40),
                            (30, -52),
                            (38, -48),
                            (42, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (14, 35),
                            (18, 38),
                            (30, -24),
                            (38, -20),
                            (42, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (14, 20),
                            (18, 28),
                            (30, -18),
                            (38, -12),
                            (42, 0),
                        ],
                        "shoulder_z": 5,
                    },
                    "L": {
                        "shoulder": [(1, 0), (14, 4), (24, 4), (34, -20), (42, 0)],
                        "elbow": [(1, 0), (14, 8), (34, 0), (42, 0)],
                    },
                },
                fingers=[(1, 0), (14, 0), (18, 1), (30, 0), (34, 0)],
            )
        else:
            p.update(
                body={
                    "hips_bend": [(1, 5), (4, 5), (10, -8), (16, 8), (24, 0)],
                    "hips_twist": [(1, 0), (4, 0), (10, -12), (16, 4), (24, 0)],
                    "spine_bend": [(1, -30), (4, -30), (10, -12), (16, 6), (24, 0)],
                    "spine_twist": [(1, 0), (4, 0), (10, 8), (16, 0), (24, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (4, -10), (10, 22), (16, 4), (24, 0)],
                        "elbow": [(1, 0), (4, 20), (10, -10), (16, 8), (24, 0)],
                        "wrist": [(1, 0), (4, 0), (10, -15), (16, 0), (24, 0)],
                        "shoulder_z": 8,
                    },
                    "L": {
                        "shoulder": [(1, 0), (4, -8), (10, -16), (16, 0), (24, 0)],
                        "elbow": [(1, 0), (4, 14), (10, 0), (16, 4), (24, 0)],
                    },
                },
                legs={
                    "R": {
                        "thigh": [(1, 0), (4, -8), (10, 12), (16, 0), (24, 0)],
                        "knee": [(1, 0), (4, 18), (10, 32), (16, 5), (24, 0)],
                    },
                    "L": {
                        "thigh": [(1, 0), (4, 0), (10, -16), (16, 0), (24, 0)],
                        "knee": [(1, 0), (4, 0), (10, 12), (16, 0), (24, 0)],
                    },
                },
            )
    elif hero == "mandy":
        if clip == "attack":
            p.update(
                body={
                    "hips_twist": [(1, 0), (10, 30), (16, -15), (22, 4), (28, 0)],
                    "spine_bend": [(1, 0), (10, -5), (16, 8), (22, 0), (28, 0)],
                    "spine_twist": [(1, 0), (10, 22), (16, -18), (28, 0)],
                    "head_twist": [(1, 0), (10, 20), (16, -20), (28, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, 0), (10, -28), (16, 38), (22, 20), (28, 0)],
                        "elbow": [(1, 0), (10, 18), (16, -5), (28, 0)],
                        "wrist": [(1, 0), (10, -5), (16, 2), (28, 0)],
                        "shoulder_z": -10,
                    },
                    "R": {
                        "shoulder": [(1, 0), (10, -28), (16, 38), (22, 20), (28, 0)],
                        "elbow": [(1, 0), (10, 18), (16, -5), (28, 0)],
                        "wrist": [(1, 0), (10, -5), (16, 2), (28, 0)],
                        "shoulder_z": 10,
                    },
                },
                fingers=[(1, 0), (10, 0), (16, 1), (28, 0)],
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_twist": [
                        (1, 0),
                        (20, 0),
                        (30, 24),
                        (38, -24),
                        (44, 0),
                        (55, 0),
                    ],
                    "spine_bend": [
                        (1, 0),
                        (20, 0),
                        (30, -12),
                        (38, 10),
                        (44, 0),
                        (55, 0),
                    ],
                    "spine_twist": [
                        (1, 0),
                        (20, 0),
                        (30, 25),
                        (38, -25),
                        (44, 0),
                        (55, 0),
                    ],
                    "head_bend": [(1, 8), (20, 8), (36, 0), (55, 0)],
                    "head_twist": [(1, 0), (30, 0), (38, -6), (55, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (20, -15),
                            (30, -28),
                            (38, 35),
                            (44, 20),
                            (55, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (20, 15),
                            (30, 25),
                            (38, -8),
                            (44, 10),
                            (55, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (20, 0),
                            (30, -8),
                            (38, 3),
                            (44, 10),
                            (55, 0),
                        ],
                        "shoulder_z": -12,
                    },
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (20, -15),
                            (30, -30),
                            (38, 42),
                            (44, 24),
                            (55, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (20, 15),
                            (30, 28),
                            (38, -8),
                            (44, 12),
                            (55, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (20, 0),
                            (30, -10),
                            (38, 5),
                            (44, 12),
                            (55, 0),
                        ],
                        "shoulder_z": 12,
                    },
                },
                fingers=[(1, 0), (30, 0), (38, 1), (44, 0), (55, 0)],
            )
        else:
            p.update(
                body={
                    "hips_bend": [(1, 0), (10, 8), (18, 14), (48, 0), (58, 0)],
                    "spine_bend": [(1, 0), (18, -20), (48, 0), (58, 0)],
                    "hips_twist": [(1, 0), (18, 0), (48, 0), (58, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, 0), (10, -50), (18, 40), (48, 20), (58, 0)],
                        "elbow": [(1, 0), (10, 8), (18, -5), (48, 10), (58, 0)],
                        "wrist": [(1, 0), (10, -10), (18, 3), (48, 2), (58, 0)],
                        "shoulder_z": -8,
                    },
                    "R": {
                        "shoulder": [(1, 0), (10, -50), (18, 40), (48, 20), (58, 0)],
                        "elbow": [(1, 0), (10, 8), (18, -5), (48, 10), (58, 0)],
                        "wrist": [(1, 0), (10, -10), (18, 3), (48, 2), (58, 0)],
                        "shoulder_z": 8,
                    },
                },
                fingers=[(1, 0), (10, 1), (18, 0), (48, 0), (58, 0)],
            )
    elif hero == "fairy-mina":
        if clip == "attack":
            p.update(
                body={
                    "hips_twist": [(1, 0), (8, -18), (15, 16), (24, 0)],
                    "spine_bend": [(1, 0), (8, -10), (15, 8), (24, 0)],
                    "spine_twist": [(1, 0), (8, -12), (15, 14), (24, 0)],
                    "head_twist": [(1, 0), (8, -8), (15, 8), (24, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (8, -36), (12, 24), (18, 8), (24, 0)],
                        "elbow": [(1, 0), (8, 32), (12, -18), (18, 8), (24, 0)],
                        "wrist": [(1, 0), (8, 0), (12, -22), (18, -4), (24, 0)],
                        "shoulder_z": 12,
                    },
                    "L": {
                        "shoulder": [(1, 0), (8, 8), (16, -12), (24, 0)],
                        "elbow": [(1, 0), (8, -4), (16, 0), (24, 0)],
                    },
                },
                fingers=[(1, 0), (10, 0), (12, 1), (18, 0), (24, 0)],
                wings=[(1, 0), (8, -15), (16, 45), (24, 18)],
                wing_wave=True,
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_bend": [(1, 0), (12, -8), (20, 4), (45, 0), (55, 0)],
                    "spine_bend": [(1, 0), (12, 12), (20, -16), (45, 0), (55, 0)],
                    "head_bend": [(1, 0), (12, -10), (20, 3), (45, 0), (55, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, 0), (12, -50), (20, 30), (45, 22), (55, 0)],
                        "elbow": [(1, 0), (12, 34), (20, -18), (45, -5), (55, 0)],
                        "wrist": [(1, 0), (12, -18), (20, -28), (45, -8), (55, 0)],
                        "shoulder_z": -10,
                    },
                    "R": {
                        "shoulder": [(1, 0), (12, -50), (20, 30), (45, 22), (55, 0)],
                        "elbow": [(1, 0), (12, 34), (20, -18), (45, -5), (55, 0)],
                        "wrist": [(1, 0), (12, -18), (20, -28), (45, -8), (55, 0)],
                        "shoulder_z": 10,
                    },
                },
                fingers=[(1, 0), (12, 0), (20, 1), (45, 0), (55, 0)],
                wings=[(1, 0), (12, 60), (20, 22), (45, 38), (55, 0)],
                wing_wave=True,
            )
        else:
            p.update(
                body={
                    "hips_bend": [(1, 8), (8, 12), (16, -8), (26, 0), (34, 0)],
                    "spine_bend": [(1, 18), (8, 32), (16, -20), (26, 0), (34, 0)],
                    "hips_twist": [(1, 0), (8, 0), (16, 0), (26, 0), (34, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, 0), (8, 28), (16, -35), (26, -15), (34, 0)],
                        "elbow": [(1, 0), (8, -15), (16, 12), (26, 6), (34, 0)],
                        "wrist": [(1, 0), (8, 0), (16, -12), (26, 0), (34, 0)],
                        "shoulder_z": -20,
                    },
                    "R": {
                        "shoulder": [(1, 0), (8, 28), (16, -35), (26, -15), (34, 0)],
                        "elbow": [(1, 0), (8, -15), (16, 12), (26, 6), (34, 0)],
                        "wrist": [(1, 0), (8, 0), (16, -12), (26, 0), (34, 0)],
                        "shoulder_z": 20,
                    },
                },
                fingers=[(1, 0), (8, 1), (16, 0), (34, 0)],
                wings=[(1, 0), (8, -45), (16, 65), (26, 24), (34, 0)],
                wing_wave=True,
            )
    elif hero == "brock-zeus":
        if clip == "attack":
            p.update(
                body={
                    "hips_bend": [(1, 0), (10, 0), (14, 7), (24, 0)],
                    "spine_bend": [(1, -4), (10, -4), (14, 8), (24, 0)],
                    "head_bend": [(1, 0), (10, -8), (14, 4), (24, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (10, -30), (14, 14), (24, 0)],
                        "elbow": [(1, 0), (10, 28), (14, 12), (24, 0)],
                        "wrist": [(1, 0), (10, 0), (14, -6), (24, 0)],
                        "shoulder_z": 8,
                    },
                    "L": {
                        "shoulder": [(1, 0), (10, -16), (14, 8), (24, 0)],
                        "elbow": [(1, 0), (10, 12), (14, 6), (24, 0)],
                        "wrist": [(1, 0), (10, 0), (14, -4), (24, 0)],
                        "shoulder_z": -6,
                    },
                },
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_twist": [
                        (1, 0),
                        (15, 0),
                        (20, -18),
                        (27, 18),
                        (32, -18),
                        (39, 18),
                        (44, 0),
                        (54, 0),
                    ],
                    "spine_twist": [
                        (1, 0),
                        (15, 0),
                        (20, -15),
                        (27, 15),
                        (32, -15),
                        (39, 15),
                        (44, 0),
                        (54, 0),
                    ],
                    "spine_bend": [(1, 0), (44, 12), (54, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [
                            (1, -55),
                            (15, -55),
                            (20, 0),
                            (27, -18),
                            (32, 0),
                            (39, -55),
                            (44, 45),
                            (54, 0),
                        ],
                        "elbow": [
                            (1, 20),
                            (15, 20),
                            (20, 5),
                            (27, 14),
                            (32, 5),
                            (39, 20),
                            (44, -18),
                            (54, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (15, 0),
                            (20, -5),
                            (27, 0),
                            (32, -5),
                            (39, 0),
                            (44, -12),
                            (54, 0),
                        ],
                        "shoulder_z": 12,
                    },
                    "L": {
                        "shoulder": [(1, -25), (44, 15), (54, 0)],
                        "elbow": [(1, 18), (44, 5), (54, 0)],
                        "wrist": [(1, 0), (44, 0), (54, 0)],
                        "shoulder_z": -8,
                    },
                },
            )
        else:
            p.update(
                body={
                    "hips_bend": [(1, 0), (12, -5), (18, 0), (22, 8), (32, 0), (40, 0)],
                    "spine_bend": [
                        (1, 0),
                        (12, -4),
                        (18, 0),
                        (22, -10),
                        (32, -6),
                        (40, 0),
                    ],
                    "hips_twist": [(1, 0), (18, 0), (22, -8), (32, 0), (40, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (12, -18),
                            (18, -35),
                            (22, 18),
                            (32, 8),
                            (40, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (12, 15),
                            (18, 28),
                            (22, -10),
                            (32, 12),
                            (40, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (12, 0),
                            (18, -10),
                            (22, 3),
                            (32, 0),
                            (40, 0),
                        ],
                        "shoulder_z": 8,
                    },
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (12, -12),
                            (18, -22),
                            (22, 10),
                            (32, 5),
                            (40, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (12, 8),
                            (18, 16),
                            (22, -5),
                            (32, 8),
                            (40, 0),
                        ],
                        "wrist": [(1, 0), (12, 0), (18, -6), (22, 0), (32, 0), (40, 0)],
                        "shoulder_z": -6,
                    },
                },
            )
    elif hero == "kaze":
        if clip == "attack":
            p.update(
                body={
                    "hips_twist": [
                        (1, 0),
                        (6, -20),
                        (10, 24),
                        (14, 28),
                        (18, -24),
                        (24, -24),
                        (30, 0),
                        (38, 0),
                    ],
                    "spine_twist": [
                        (1, 0),
                        (6, -24),
                        (10, 28),
                        (14, 30),
                        (18, -28),
                        (24, -20),
                        (30, 0),
                        (38, 0),
                    ],
                    "spine_bend": [(1, 8), (18, 18), (24, 18), (30, -8), (38, 0)],
                    "head_twist": [(1, 0), (18, 8), (24, 0), (30, 0), (38, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (6, -40),
                            (10, 45),
                            (24, 0),
                            (30, 30),
                            (38, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (6, 35),
                            (10, -18),
                            (24, 0),
                            (30, -10),
                            (38, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (6, 0),
                            (10, -18),
                            (24, 0),
                            (30, -10),
                            (38, 0),
                        ],
                        "shoulder_z": 18,
                    },
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (10, -40),
                            (14, 45),
                            (24, 0),
                            (30, 30),
                            (38, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (10, 30),
                            (14, -18),
                            (24, 0),
                            (30, -10),
                            (38, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (10, 0),
                            (14, -18),
                            (24, 0),
                            (30, -10),
                            (38, 0),
                        ],
                        "shoulder_z": -18,
                    },
                },
                fingers=[(1, 0), (10, 0), (18, 0), (24, 1), (30, 0), (38, 0)],
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_bend": [
                        (1, 18),
                        (8, 22),
                        (14, 5),
                        (20, 18),
                        (26, 20),
                        (34, 0),
                    ],
                    "spine_bend": [
                        (1, 22),
                        (8, 30),
                        (14, 5),
                        (20, 22),
                        (26, 24),
                        (34, 0),
                    ],
                    "spine_twist": [(1, 0), (14, 0), (20, 0), (26, 0), (34, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (8, -28),
                            (14, -45),
                            (20, 26),
                            (26, 18),
                            (34, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (8, 22),
                            (14, 30),
                            (20, -15),
                            (26, 8),
                            (34, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (8, -8),
                            (14, -16),
                            (20, 5),
                            (26, 0),
                            (34, 0),
                        ],
                        "shoulder_z": -12,
                    },
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (8, -28),
                            (14, -45),
                            (20, 26),
                            (26, 18),
                            (34, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (8, 22),
                            (14, 30),
                            (20, -15),
                            (26, 8),
                            (34, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (8, -8),
                            (14, -16),
                            (20, 5),
                            (26, 0),
                            (34, 0),
                        ],
                        "shoulder_z": 12,
                    },
                },
                legs={
                    "L": {
                        "thigh": [(1, 0), (8, -12), (20, 12), (26, 8), (34, 0)],
                        "knee": [(1, 0), (8, 20), (20, 28), (26, 14), (34, 0)],
                    },
                    "R": {
                        "thigh": [(1, 0), (8, 12), (20, -8), (26, -4), (34, 0)],
                        "knee": [(1, 0), (8, 14), (20, 22), (26, 8), (34, 0)],
                    },
                },
                fingers=[(1, 0), (14, 0), (20, 1), (34, 0)],
            )
        else:
            p.update(
                body={
                    "hips_bend": [(1, 0), (8, 0), (18, 6), (28, 0), (38, 0), (48, 0)],
                    "spine_bend": [(1, 0), (18, -8), (28, 0), (38, 0), (48, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (8, -30),
                            (18, 10),
                            (28, 0),
                            (38, 12),
                            (48, 0),
                        ],
                        "elbow": [(1, 0), (8, 25), (18, 0), (28, 8), (38, 0), (48, 0)],
                        "wrist": [
                            (1, 0),
                            (8, -12),
                            (18, 0),
                            (28, -4),
                            (38, 0),
                            (48, 0),
                        ],
                        "shoulder_z": 14,
                    },
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (8, 10),
                            (18, -8),
                            (28, 0),
                            (38, 10),
                            (48, 0),
                        ],
                        "elbow": [(1, 0), (8, -8), (18, 0), (28, 8), (38, 0), (48, 0)],
                        "wrist": [(1, 0), (8, 0), (18, 0), (28, -4), (38, 0), (48, 0)],
                        "shoulder_z": -14,
                    },
                },
                fingers=[(1, 0), (8, 1), (18, 0), (28, 0), (38, 0), (48, 0)],
            )
    elif hero == "wukong-mico":
        if clip == "attack":
            p.update(
                body={
                    "hips_twist": [(1, 0), (14, 25), (22, -38), (30, -10), (40, 0)],
                    "spine_bend": [(1, 0), (14, -10), (22, 8), (30, 0), (40, 0)],
                    "spine_twist": [(1, 0), (14, 18), (22, -28), (30, -8), (40, 0)],
                    "head_twist": [(1, 0), (14, 10), (22, -18), (40, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, -20), (14, -55), (22, 40), (30, 20), (40, 0)],
                        "elbow": [(1, 10), (14, 35), (22, -20), (30, 10), (40, 0)],
                        "wrist": [(1, 0), (14, -12), (22, 18), (30, 8), (40, 0)],
                        "shoulder_z": -14,
                    },
                    "R": {
                        "shoulder": [(1, -20), (14, -55), (22, 40), (30, 20), (40, 0)],
                        "elbow": [(1, 10), (14, 35), (22, -20), (30, 10), (40, 0)],
                        "wrist": [(1, 0), (14, -12), (22, 18), (30, 8), (40, 0)],
                        "shoulder_z": 14,
                    },
                },
                fingers=[(1, 0), (14, 0), (22, 1), (30, 0), (40, 0)],
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_twist": [(1, 0), (12, 0), (90, 360), (100, 380), (110, 360)],
                    "spine_bend": [(1, 0), (12, 0), (90, -8), (100, 0), (110, 0)],
                    "head_twist": [(1, 0), (12, 0), (90, 0), (100, 12), (110, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [
                            (1, -20),
                            (12, -20),
                            (90, -20),
                            (100, 18),
                            (110, 0),
                        ],
                        "elbow": [(1, 12), (12, 12), (90, 12), (100, -8), (110, 0)],
                        "wrist": [(1, 0), (12, 0), (90, 0), (100, -12), (110, 0)],
                        "shoulder_z": -10,
                    },
                    "R": {
                        "shoulder": [
                            (1, -20),
                            (12, -20),
                            (90, -20),
                            (100, 18),
                            (110, 0),
                        ],
                        "elbow": [(1, 12), (12, 12), (90, 12), (100, -8), (110, 0)],
                        "wrist": [(1, 0), (12, 0), (90, 0), (100, -12), (110, 0)],
                        "shoulder_z": 10,
                    },
                },
                fingers=[(1, 0), (12, 0), (90, 0), (100, 1), (110, 0)],
            )
        else:
            p.update(
                body={
                    "hips_bend": [
                        (1, 0),
                        (10, 10),
                        (16, 20),
                        (50, 20),
                        (58, -12),
                        (68, 0),
                    ],
                    "spine_bend": [(1, 0), (16, 0), (50, 0), (58, 12), (68, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (10, -25),
                            (16, 30),
                            (50, 30),
                            (58, 45),
                            (68, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (10, 12),
                            (16, -8),
                            (50, -8),
                            (58, -20),
                            (68, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (10, 0),
                            (16, -4),
                            (50, -4),
                            (58, 12),
                            (68, 0),
                        ],
                        "shoulder_z": -12,
                    },
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (10, -25),
                            (16, 30),
                            (50, 30),
                            (58, 45),
                            (68, 0),
                        ],
                        "elbow": [
                            (1, 0),
                            (10, 12),
                            (16, -8),
                            (50, -8),
                            (58, -20),
                            (68, 0),
                        ],
                        "wrist": [
                            (1, 0),
                            (10, 0),
                            (16, -4),
                            (50, -4),
                            (58, 12),
                            (68, 0),
                        ],
                        "shoulder_z": 12,
                    },
                },
                fingers=[(1, 0), (10, 0), (16, 1), (50, 0), (58, 1), (68, 0)],
            )
    elif hero == "damian":
        if clip == "attack":
            p.update(
                body={
                    "hips_bend": [(1, 0), (12, 0), (18, -5), (28, 0)],
                    "spine_bend": [(1, 0), (12, 0), (18, -10), (28, 0)],
                    "head_twist": [(1, 0), (12, 10), (18, 15), (28, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, 0), (12, -30), (18, -8), (28, 0)],
                        "elbow": [(1, 35), (12, 35), (18, -12), (28, 0)],
                        "wrist": [(1, 0), (12, 0), (18, -20), (28, 0)],
                        "shoulder_z": -12,
                    },
                    "R": {
                        "shoulder": [(1, 0), (12, 0), (28, 0)],
                        "elbow": [(1, 0), (28, 0)],
                        "wrist": [(1, 0), (28, 0)],
                    },
                },
                fingers=[(1, 0), (12, 1), (18, 0), (28, 0)],
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_bend": [(1, 0), (12, 8), (20, -4), (40, 0)],
                    "spine_bend": [(1, 0), (12, -10), (20, 5), (40, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (12, -52), (20, 42), (28, 0), (40, 0)],
                        "elbow": [(1, 0), (12, 30), (20, -15), (28, 0), (40, 0)],
                        "wrist": [(1, 0), (12, -8), (20, 12), (28, 0), (40, 0)],
                        "shoulder_z": 10,
                    },
                    "L": {
                        "shoulder": [(1, 0), (12, -18), (20, 26), (28, 10), (40, 0)],
                        "elbow": [(1, 0), (12, 18), (20, -8), (28, 0), (40, 0)],
                        "wrist": [(1, 0), (12, 0), (20, -12), (28, 0), (40, 0)],
                        "shoulder_z": -8,
                    },
                },
                fingers=[(1, 0), (12, 0), (20, 1), (28, 0), (40, 0)],
            )
        else:
            p.update(
                body={
                    "hips_twist": [
                        (1, 0),
                        (6, -20),
                        (14, 30),
                        (18, 0),
                        (26, 18),
                        (35, 0),
                    ],
                    "hips_bend": [
                        (1, 0),
                        (6, 18),
                        (14, 28),
                        (18, -6),
                        (26, 0),
                        (35, 0),
                    ],
                    "spine_bend": [
                        (1, 0),
                        (6, 20),
                        (14, 42),
                        (18, -6),
                        (26, 0),
                        (35, 0),
                    ],
                    "head_twist": [(1, 0), (6, -18), (14, 0), (18, 0), (35, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [
                            (1, 0),
                            (6, -20),
                            (14, 32),
                            (18, 0),
                            (26, 16),
                            (35, 0),
                        ],
                        "elbow": [(1, 0), (6, 18), (14, -8), (18, 8), (26, 0), (35, 0)],
                        "wrist": [(1, 0), (6, 0), (14, 10), (18, 0), (26, 0), (35, 0)],
                        "shoulder_z": 10,
                    },
                    "L": {
                        "shoulder": [
                            (1, 0),
                            (6, 8),
                            (14, 24),
                            (18, 18),
                            (26, 0),
                            (35, 0),
                        ],
                        "elbow": [(1, 0), (6, 0), (14, -8), (18, 0), (26, 0), (35, 0)],
                        "wrist": [(1, 0), (35, 0)],
                        "shoulder_z": -8,
                    },
                },
                fingers=[(1, 0), (6, 1), (14, 0), (18, 1), (26, 0), (35, 0)],
            )
    elif hero == "persephone-lumi":
        if clip == "attack":
            p.update(
                body={
                    "hips_bend": [(1, 0), (10, 0), (16, -5), (35, 0)],
                    "spine_bend": [(1, 0), (10, 0), (16, -5), (35, 0)],
                    "head_twist": [(1, 0), (10, 8), (16, 12), (26, 8), (35, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (10, -30), (16, 22), (26, 18), (35, 0)],
                        "elbow": [(1, 10), (10, 26), (16, -12), (26, -8), (35, 0)],
                        "wrist": [(1, 0), (10, 0), (16, -14), (26, -5), (35, 0)],
                        "shoulder_z": 12,
                    },
                    "L": {
                        "shoulder": [(1, 0), (10, -18), (16, 16), (26, 12), (35, 0)],
                        "elbow": [(1, 12), (10, 20), (16, -8), (26, -5), (35, 0)],
                        "wrist": [(1, 0), (10, 0), (16, -8), (26, 0), (35, 0)],
                        "shoulder_z": -8,
                    },
                },
                fingers=[(1, 0), (10, 0), (16, 1), (26, 0), (35, 0)],
            )
        elif clip == "super":
            p.update(
                body={
                    "hips_bend": [(1, 0), (10, 8), (18, -8), (28, -14), (40, 0)],
                    "spine_bend": [(1, 0), (10, -12), (18, 18), (28, 10), (40, 0)],
                    "head_bend": [(1, -10), (10, -10), (18, 10), (28, -8), (40, 0)],
                },
                arms={
                    "L": {
                        "shoulder": [(1, 0), (10, -38), (18, 30), (28, -20), (40, 0)],
                        "elbow": [(1, 12), (10, 28), (18, -12), (28, 15), (40, 0)],
                        "wrist": [(1, 0), (10, -8), (18, -18), (28, 12), (40, 0)],
                        "shoulder_z": -10,
                    },
                    "R": {
                        "shoulder": [(1, 0), (10, -38), (18, 30), (28, -20), (40, 0)],
                        "elbow": [(1, 12), (10, 28), (18, -12), (28, 15), (40, 0)],
                        "wrist": [(1, 0), (10, -8), (18, -18), (28, 12), (40, 0)],
                        "shoulder_z": 10,
                    },
                },
                fingers=[(1, 0), (10, 1), (18, 0), (28, 1), (40, 0)],
            )
        else:
            p.update(
                body={
                    "hips_twist": [(1, 0), (8, 18), (15, 0), (20, -12), (30, 0)],
                    "hips_bend": [(1, 0), (8, 0), (15, 0), (20, 8), (30, 0)],
                    "spine_twist": [(1, 0), (8, 18), (15, 0), (20, -10), (30, 0)],
                    "spine_bend": [(1, 0), (8, -8), (15, 0), (20, 10), (30, 0)],
                    "head_twist": [(1, 0), (8, 18), (15, 0), (20, 24), (30, 0)],
                },
                arms={
                    "R": {
                        "shoulder": [(1, 0), (8, -28), (15, 10), (20, 28), (30, 0)],
                        "elbow": [(1, 0), (8, 20), (15, 0), (20, -10), (30, 0)],
                        "wrist": [(1, 0), (8, 0), (15, -12), (20, 14), (30, 0)],
                        "shoulder_z": 12,
                    },
                    "L": {
                        "shoulder": [(1, 0), (8, 8), (15, 0), (20, 4), (30, 0)],
                        "elbow": [(1, 0), (8, 0), (15, 0), (20, 0), (30, 0)],
                        "wrist": [(1, 0), (30, 0)],
                        "shoulder_z": -8,
                    },
                },
                fingers=[(1, 0), (8, 0), (15, 1), (20, 0), (30, 0)],
            )
    return p


def profile_pose(hero: str, clip: str, frame: int, groups: dict):
    p = _profile(hero, clip)
    pose = {}
    _body(pose, groups, frame, p["body"])
    _arms(pose, groups, frame, p["arms"])
    _legs(pose, groups, frame, p["legs"])
    if p["fingers"]:
        close = p["fingers"]
        for side in ("L", "R"):
            _fingers(
                pose, groups, frame, side, close, amount=14.0 if side == "L" else 16.0
            )
    if p["wings"]:
        _wings(pose, groups, frame, p["wings"], p["wing_wave"])
    # Subtle secondary follow-through keeps long props/hair from stopping at
    # exactly the same frame as the torso.  The object stays bone-parented.
    for index, name in enumerate(groups.get("special", [])):
        _add(pose, name, y=math.radians(2.5 * math.sin(frame * 0.16 + index)))
    return pose
