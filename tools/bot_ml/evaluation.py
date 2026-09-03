from collections import defaultdict
from typing import Dict, Iterable


def _reports(payload) -> Iterable[Dict]:
    reports = payload.get("reports") if isinstance(payload, dict) else None
    return reports if isinstance(reports, list) else [payload]


def evaluate_benchmark(payload: Dict) -> Dict:
    """Apply conservative rollout gates to a Go benchmark or suite payload."""
    if (
        isinstance(payload, dict)
        and isinstance(payload.get("metrics"), dict)
        and isinstance(payload.get("deltas"), dict)
    ):
        return evaluate_tactical_benchmark(payload)
    sums = defaultdict(lambda: [0.0, 0.0, 0])
    for report in _reports(payload):
        for delta in report.get("deltas", []):
            name = delta.get("name")
            if not name:
                continue
            sums[name][0] += float(delta.get("baseline", 0.0))
            sums[name][1] += float(delta.get("candidate", 0.0))
            sums[name][2] += 1
    mean_deltas = {
        name: {
            "baseline": values[0] / values[2],
            "candidate": values[1] / values[2],
            "delta": (values[1] - values[0]) / values[2],
        }
        for name, values in sums.items()
        if values[2]
    }
    reasons = []
    for name in ("bot.mlFallbacks", "bot.idleDecisionTicks", "bot.stuckReplans"):
        if name in mean_deltas and mean_deltas[name]["delta"] > 0:
            label = "fallback rate" if name == "bot.mlFallbacks" else name
            reasons.append(f"{label} regression")
    outcome_names = (
        "bot.winRate",
        "bot.scorePerMinute",
        "bot.kills",
        "bot.damage",
        "bot.damagePerLife",
        "bot.attackHits",
        "bot.accuracy",
    )
    for name in outcome_names:
        if name in mean_deltas and mean_deltas[name]["delta"] < 0:
            reasons.append(f"{name} regression")
    improvements = [
        name
        for name in outcome_names
        if name in mean_deltas and mean_deltas[name]["delta"] > 0
    ]
    if not improvements:
        reasons.append("no positive outcome signal on holdout")
    return {
        "passed": not reasons,
        "reasons": reasons,
        "meanDeltas": mean_deltas,
        "positiveOutcomeSignals": improvements,
    }


def evaluate_tactical_benchmark(payload: Dict) -> Dict:
    """Gate tactical-v2 on team outcome, safety, and real behavior influence."""
    metrics = payload.get("metrics", {})
    baseline = metrics.get("baseline", {})
    candidate = metrics.get("tacticalV2", {})
    deltas = payload.get("deltas", {})
    reasons = []
    for name in ("damage", "aliveRate"):
        if float(deltas.get(name, 0.0)) < 0:
            reasons.append(f"{name} regression")
    if float(candidate.get("mlTacticalDecisions", 0.0)) <= 0:
        reasons.append("tactical model made no decisions")
    if float(candidate.get("mlTacticalBehaviorChanges", 0.0)) <= 0:
        reasons.append("no decisions changed behavior")
    if float(candidate.get("safetyFallbacks", 0.0)) > float(
        candidate.get("mlTacticalDecisions", 0.0)
    ):
        reasons.append("safety fallback count exceeds decisions")
    positive = [
        name for name in ("damage", "aliveRate") if float(deltas.get(name, 0.0)) > 0
    ]
    if not positive:
        reasons.append("no positive team outcome signal on holdout")
    return {
        "passed": not reasons,
        "reasons": reasons,
        "baseline": baseline,
        "candidate": candidate,
        "deltas": deltas,
        "positiveOutcomeSignals": positive,
    }
