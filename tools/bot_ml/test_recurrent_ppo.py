import math
import unittest

from tools.bot_ml.parallel_env import TrajectoryParallelEnv
from tools.bot_ml.recurrent_ppo import (
    HAS_TORCH,
    MaskedRecurrentActorCritic,
    PPOConfig,
    export_checkpoint,
    ppo_update,
    recurrent_forward,
    train_recurrent_behavior_cloning,
    train_recurrent_ppo,
)
from tools.bot_ml.schema import (
    ACTION_NAMES,
    COMBAT_PROFILE_ID,
    COMBAT_RULES_VERSION,
    OBSERVATION_SIZE,
    SCHEMA_FINGERPRINT,
    SCHEMA_VERSION,
)


@unittest.skipUnless(HAS_TORCH, "PyTorch training dependency is not installed")
class RecurrentPPOContractTests(unittest.TestCase):
    def test_forward_is_recurrent_and_masks_logits(self):
        import torch

        model = MaskedRecurrentActorCritic(OBSERVATION_SIZE, 8, len(ACTION_NAMES))
        values = torch.zeros(3, 1, OBSERVATION_SIZE)
        mask = torch.tensor(
            [
                [[True, True, False, False]],
                [[True, False, False, False]],
                [[True, True, True, False]],
            ]
        )
        logits, critic, hidden = model(values, action_mask=mask)
        self.assertEqual(tuple(logits.shape), (3, 1, len(ACTION_NAMES)))
        self.assertEqual(tuple(critic.shape), (3, 1))
        self.assertEqual(tuple(hidden[0].shape), (1, 1, 8))
        self.assertLess(float(logits[0, 0, 2].detach()), -1e8)
        self.assertLess(float(logits[1, 0, 1].detach()), -1e8)

    def test_export_contains_go_runtime_matrices_and_fingerprint(self):
        model = MaskedRecurrentActorCritic(OBSERVATION_SIZE, 4, len(ACTION_NAMES))
        checkpoint = export_checkpoint(model)
        self.assertEqual(checkpoint["kind"], "recurrent-ppo-lstm-v1")
        self.assertEqual(checkpoint["schemaVersion"], SCHEMA_VERSION)
        self.assertEqual(checkpoint["schemaFingerprint"], SCHEMA_FINGERPRINT)
        self.assertEqual(checkpoint["combatProfileId"], COMBAT_PROFILE_ID)
        self.assertEqual(checkpoint["combatRulesVersion"], COMBAT_RULES_VERSION)
        self.assertEqual(len(checkpoint["inputToHidden"]), 16)
        self.assertEqual(len(checkpoint["inputToHidden"][0]), OBSERVATION_SIZE)
        self.assertEqual(len(checkpoint["actorWeight"]), len(ACTION_NAMES))

    def test_training_produces_a_versioned_checkpoint(self):
        records = []
        for action in range(len(ACTION_NAMES)):
            values = [0.0] * OBSERVATION_SIZE
            values[action] = 1.0
            records.append(
                {
                    "episodeId": "fixture",
                    "botId": "bot",
                    "observation": {
                        "schemaVersion": SCHEMA_VERSION,
                        "values": values,
                        "actionMask": [True] * len(ACTION_NAMES),
                    },
                    "action": action,
                }
            )
        _, checkpoint = train_recurrent_behavior_cloning(
            records, hidden_size=8, epochs=20, learning_rate=0.01
        )
        self.assertEqual(checkpoint["kind"], "recurrent-ppo-lstm-v1")
        self.assertEqual(checkpoint["sampleCount"], len(records))
        self.assertGreaterEqual(checkpoint["trainAccuracy"], 0.75)

    def test_ppo_update_has_finite_masked_loss(self):
        import torch

        model = MaskedRecurrentActorCritic(OBSERVATION_SIZE, 8, len(ACTION_NAMES))
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        values = torch.zeros(4, 1, OBSERVATION_SIZE)
        masks = torch.tensor([[[True, True, False, False]]] * 4)
        actions = torch.zeros(4, 1, dtype=torch.long)
        old_log_probs = torch.zeros(4, 1)
        advantages = torch.ones(4, 1)
        returns = torch.ones(4, 1)
        metrics = ppo_update(
            model,
            optimizer,
            values,
            masks,
            actions,
            old_log_probs,
            advantages,
            returns,
            PPOConfig(hidden_size=8),
        )
        self.assertTrue(math.isfinite(metrics["loss"]))
        self.assertTrue(math.isfinite(metrics["policyLoss"]))

    def test_recurrent_rollout_preserves_state_and_resets_at_episode_boundary(self):
        import torch

        torch.manual_seed(17)
        model = MaskedRecurrentActorCritic(OBSERVATION_SIZE, 8, len(ACTION_NAMES))
        values = torch.zeros(4, 1, OBSERVATION_SIZE)
        values[1, 0, 0] = 1.0
        values[2, 0, 1] = 1.0
        values[3, 0, 2] = 1.0
        masks = torch.ones(4, 1, len(ACTION_NAMES), dtype=torch.bool)

        sequential_logits, _, _ = recurrent_forward(model, values, masks)
        starts = torch.tensor([[True], [False], [True], [False]])
        reset_logits, _, _ = recurrent_forward(
            model, values, masks, episode_starts=starts
        )

        self.assertFalse(torch.allclose(sequential_logits[2], reset_logits[2]))
        self.assertTrue(
            torch.allclose(sequential_logits[3], reset_logits[3], atol=1e-6) is False
        )

    def test_ppo_training_runs_on_parallel_environment(self):
        records = []
        for step, action in enumerate([0, 1, 0, 1]):
            values = [0.0] * OBSERVATION_SIZE
            values[step] = 1.0
            records.append(
                {
                    "episodeId": "ppo-fixture",
                    "botId": "bot",
                    "observation": {
                        "schemaVersion": SCHEMA_VERSION,
                        "values": values,
                        "actionMask": [True, True, False, False],
                    },
                    "action": action,
                }
            )
        env = TrajectoryParallelEnv(records)
        _, checkpoint, history = train_recurrent_ppo(
            env,
            PPOConfig(hidden_size=8, rollout_length=4, update_epochs=1),
            updates=2,
            seed=3,
        )
        self.assertEqual(checkpoint["training"], "ppo")
        self.assertEqual(checkpoint["schemaFingerprint"], SCHEMA_FINGERPRINT)
        self.assertEqual(len(history), 2)
        self.assertTrue(all(math.isfinite(item["loss"]) for item in history))

    def test_ppo_accepts_a_behavior_cloning_warm_start(self):
        records = [
            {
                "episodeId": "warm-start",
                "botId": "bot",
                "observation": {
                    "schemaVersion": SCHEMA_VERSION,
                    "values": [0.0] * OBSERVATION_SIZE,
                    "actionMask": [True] * len(ACTION_NAMES),
                },
                "action": 0,
            }
        ]
        warm_model, _ = train_recurrent_behavior_cloning(
            records, hidden_size=8, epochs=1, learning_rate=0.01
        )
        env = TrajectoryParallelEnv(records)
        _, checkpoint, _ = train_recurrent_ppo(
            env,
            PPOConfig(hidden_size=8, rollout_length=2, update_epochs=1),
            updates=1,
            seed=5,
            initial_model=warm_model,
        )
        self.assertEqual(checkpoint["hiddenSize"], 8)


if __name__ == "__main__":
    unittest.main()
