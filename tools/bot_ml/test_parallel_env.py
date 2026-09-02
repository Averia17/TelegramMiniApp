import unittest

from tools.bot_ml.parallel_env import TrajectoryParallelEnv
from tools.bot_ml.schema import ACTION_NAMES, OBSERVATION_SIZE, SCHEMA_VERSION


def fixture_record(action, step):
    values = [0.0] * OBSERVATION_SIZE
    values[step] = 1.0
    return {
        "episodeId": "episode-1",
        "botId": "bot",
        "observation": {
            "schemaVersion": SCHEMA_VERSION,
            "values": values,
            "actionMask": [True] * len(ACTION_NAMES),
        },
        "action": action,
    }


class ParallelEnvironmentTests(unittest.TestCase):
    def test_reset_and_step_follow_parallel_api(self):
        env = TrajectoryParallelEnv([fixture_record(1, 0), fixture_record(0, 1)])
        observations, infos = env.reset(seed=7)
        self.assertEqual(env.agents, ["bot"])
        self.assertEqual(len(observations["bot"]["values"]), OBSERVATION_SIZE)
        self.assertEqual(infos["bot"]["schemaVersion"], SCHEMA_VERSION)

        observations, rewards, terminations, truncations, infos = env.step({"bot": 1})
        self.assertEqual(rewards["bot"], 1.0)
        self.assertFalse(terminations["bot"])
        self.assertFalse(truncations["bot"])
        self.assertEqual(observations["bot"]["values"][1], 1.0)

    def test_invalid_action_is_penalized_and_masked(self):
        sample = fixture_record(1, 0)
        sample["observation"]["actionMask"] = [True, True, False, False]
        env = TrajectoryParallelEnv([sample])
        env.reset(seed=1)
        _, rewards, terminations, truncations, infos = env.step({"bot": 3})
        self.assertEqual(rewards["bot"], -1.0)
        self.assertTrue(terminations["bot"])
        self.assertFalse(truncations["bot"])
        self.assertEqual(infos["bot"]["invalidAction"], True)


if __name__ == "__main__":
    unittest.main()
