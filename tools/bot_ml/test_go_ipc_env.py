import unittest

from tools.bot_ml.go_ipc_env import GoSimulatorParallelEnv
from tools.bot_ml.schema import SCHEMA_VERSION


class GoIPCEnvironmentTests(unittest.TestCase):
    def test_authoritative_go_process_exposes_parallel_step_protocol(self):
        env = GoSimulatorParallelEnv(
            ["go", "run", "./cmd/bot-ml-episode"],
            workdir="battle",
            duration_ms=160,
            timeout_seconds=30,
        )
        self.addCleanup(env.close)
        observations, infos = env.reset(seed=11)
        self.assertEqual(env.agents, ["bot"])
        self.assertEqual(infos["bot"]["schemaVersion"], SCHEMA_VERSION)
        _, rewards, terminations, truncations, _ = env.step({"bot": 1})
        self.assertGreaterEqual(rewards["bot"], -1.0)
        self.assertTrue(terminations["bot"])
        self.assertFalse(truncations["bot"])


if __name__ == "__main__":
    unittest.main()
