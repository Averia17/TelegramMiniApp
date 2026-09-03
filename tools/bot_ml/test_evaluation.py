import unittest

from tools.bot_ml.evaluation import evaluate_benchmark
from tools.bot_ml.self_play import OpponentPool


def report(delta_values):
    deltas = [
        {
            "name": name,
            "baseline": base,
            "candidate": candidate,
            "delta": candidate - base,
        }
        for name, (base, candidate) in delta_values.items()
    ]
    return {
        "schemaVersion": "bot-ml-observation-v1",
        "schemaFingerprint": "b5d0859ca5d96741d11034c7b19329b6bcf36dbaae9a7310f156ec5996d542e5",
        "scenarioId": "fixture",
        "seed": 1,
        "baseline": {"policy": "utility-v1", "report": {"metrics": []}},
        "candidate": {"policy": "model", "report": {"metrics": []}},
        "deltas": deltas,
    }


class EvaluationTests(unittest.TestCase):
    def test_quality_gate_rejects_fallback_or_safety_regression(self):
        result = evaluate_benchmark(
            report(
                {
                    "bot.accuracy": (0.5, 0.6),
                    "bot.mlFallbacks": (0, 1),
                    "bot.idleDecisionTicks": (2, 3),
                    "bot.stuckReplans": (1, 1),
                }
            )
        )
        self.assertFalse(result["passed"])
        self.assertTrue(any("fallback" in reason for reason in result["reasons"]))

    def test_quality_gate_requires_an_outcome_signal(self):
        result = evaluate_benchmark(report({"bot.actionSwitches": (2, 1)}))
        self.assertFalse(result["passed"])
        self.assertIn("outcome", " ".join(result["reasons"]))

    def test_quality_gate_reports_negative_outcome_signal(self):
        result = evaluate_benchmark(
            report({"bot.damage": (100, 99), "bot.accuracy": (0.8, 0.7)})
        )
        self.assertFalse(result["passed"])
        self.assertIn("bot.damage regression", result["reasons"])
        self.assertIn("bot.accuracy regression", result["reasons"])

    def test_tactical_gate_rejects_damage_regression_even_when_model_changes_behavior(
        self,
    ):
        result = evaluate_benchmark(
            {
                "metrics": {
                    "baseline": {"damage": 100, "aliveRate": 1},
                    "tacticalV2": {
                        "damage": 90,
                        "aliveRate": 1,
                        "mlTacticalDecisions": 20,
                        "mlTacticalBehaviorChanges": 8,
                        "safetyFallbacks": 2,
                    },
                },
                "deltas": {"damage": -10, "aliveRate": 0},
            }
        )
        self.assertFalse(result["passed"])
        self.assertIn("damage regression", result["reasons"])

    def test_opponent_pool_is_deterministic_and_rotates(self):
        pool = OpponentPool(["utility-v1", "checkpoint-a", "checkpoint-b"])
        self.assertEqual(pool.choose(10, 4), pool.choose(10, 4))
        self.assertEqual(len({pool.choose(10, episode) for episode in range(8)}), 3)


if __name__ == "__main__":
    unittest.main()
