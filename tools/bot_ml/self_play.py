import hashlib
from typing import Iterable, List


class OpponentPool:
    """Deterministic rotating pool of current, historical and utility policies."""

    def __init__(self, policy_names: Iterable[str]):
        self._policies: List[str] = sorted({name for name in policy_names if name})
        if not self._policies:
            raise ValueError("opponent pool requires at least one policy")

    @property
    def policies(self) -> List[str]:
        return list(self._policies)

    def choose(self, seed: int, episode: int) -> str:
        digest = hashlib.sha256(f"{seed}:{episode}".encode("ascii")).digest()
        index = int.from_bytes(digest[:8], "big") % len(self._policies)
        return self._policies[index]
