import unittest

from tools.bot_ml.behavior_cloning import predict_action, train_linear_policy
from tools.bot_ml.schema import (
    ACTION_NAMES,
    OBSERVATION_SIZE,
    SCHEMA_FINGERPRINT,
    SCHEMA_VERSION,
)


def record(action, feature):
    values = [0.0] * OBSERVATION_SIZE
    values[feature] = 1.0
    return {
        "observation": {
            "schemaVersion": SCHEMA_VERSION,
            "values": values,
            "actionMask": [True] * len(ACTION_NAMES),
        },
        "action": action,
    }


class BehaviorCloningTests(unittest.TestCase):
    def test_tiny_linear_policy_learns_masked_expert_fixture(self):
        samples = [record(action, action) for action in range(len(ACTION_NAMES))] * 8
        model = train_linear_policy(samples, epochs=120, learning_rate=0.25)
        self.assertEqual(model["schemaFingerprint"], SCHEMA_FINGERPRINT)
        self.assertGreaterEqual(model["trainAccuracy"], 0.99)
        self.assertEqual(
            predict_action(
                model, [1.0] + [0.0] * (OBSERVATION_SIZE - 1), [True, False, True, True]
            ),
            0,
        )

    def test_prediction_respects_action_mask(self):
        samples = [record(1, 0), record(1, 0), record(0, 1)]
        model = train_linear_policy(samples, epochs=40, learning_rate=0.2)
        self.assertEqual(
            predict_action(
                model, samples[0]["observation"]["values"], [True, False, True, True]
            ),
            0,
        )


if __name__ == "__main__":
    unittest.main()
