from collections import defaultdict
from copy import deepcopy
from typing import Dict, Iterable, List

from .schema import ACTION_NAMES, OBSERVATION_SIZE, SCHEMA_VERSION


class TrajectoryParallelEnv:
    """Small PettingZoo-style parallel adapter over recorded episodes.

    It is used for PPO smoke/fine-tuning and contract tests. The authoritative
    Go simulator remains the evaluation environment; this adapter never claims
    to replace its physics or combat rules.
    """

    def __init__(self, records: Iterable[Dict]):
        grouped = defaultdict(list)
        for record in records:
            grouped[record.get("episodeId", "episode-0")].append(record)
        self._episodes = [rows for _, rows in sorted(grouped.items()) if rows]
        if not self._episodes:
            raise ValueError(
                "parallel environment requires at least one trajectory episode"
            )
        self.agents: List[str] = []
        self._episode: List[Dict] = []
        self._position = 0
        self._done = True

    def reset(self, seed: int = 0):
        self._episode = self._episodes[seed % len(self._episodes)]
        self._position = 0
        self._done = False
        bot_id = self._episode[0].get("botId", "bot")
        self.agents = [bot_id]
        return {bot_id: deepcopy(self._episode[0]["observation"])}, {
            bot_id: self._info()
        }

    def step(self, actions: Dict[str, int]):
        if self._done or not self.agents:
            raise RuntimeError("parallel environment must be reset before step")
        bot_id = self.agents[0]
        record = self._episode[self._position]
        action = actions.get(bot_id)
        mask = record["observation"]["actionMask"]
        invalid = (
            not isinstance(action, int)
            or isinstance(action, bool)
            or not 0 <= action < len(ACTION_NAMES)
            or not mask[action]
        )
        reward = -1.0 if invalid else (1.0 if action == record["action"] else -1.0)
        self._position += 1
        terminated = self._position >= len(self._episode)
        self._done = terminated
        next_observation = self._episode[min(self._position, len(self._episode) - 1)][
            "observation"
        ]
        info = self._info()
        info["invalidAction"] = invalid
        if terminated:
            self.agents = []
            return {}, {bot_id: reward}, {bot_id: True}, {bot_id: False}, {bot_id: info}
        return (
            {bot_id: deepcopy(next_observation)},
            {bot_id: reward},
            {bot_id: False},
            {bot_id: False},
            {bot_id: info},
        )

    def _info(self) -> Dict:
        return {"schemaVersion": SCHEMA_VERSION, "observationSize": OBSERVATION_SIZE}
