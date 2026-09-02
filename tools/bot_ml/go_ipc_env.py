import json
import queue
import subprocess
import threading
from typing import Dict, List, Optional

from .schema import SCHEMA_VERSION


class GoSimulatorParallelEnv:
    """PettingZoo-style bridge to the authoritative Go tactical simulator."""

    def __init__(
        self,
        command: List[str],
        workdir: str,
        duration_ms: int = 5000,
        timeout_seconds: float = 10,
        scenarios: Optional[List[str]] = None,
    ):
        self.command = list(command)
        self.workdir = workdir
        self.duration_ms = duration_ms
        self.timeout_seconds = timeout_seconds
        self.scenarios = list(scenarios or ["open_engage"])
        self.agents: List[str] = []
        self.last_report: Optional[Dict] = None
        self._process = None
        self._messages = None
        self._reader = None
        self._pending_action = False

    def reset(self, seed: int = 0):
        self.close()
        self.last_report = None
        scenario = self.scenarios[seed % len(self.scenarios)]
        command = self.command + [
            "-duration-ms",
            str(self.duration_ms),
            "-seed",
            str(seed),
            "-scenario",
            scenario,
        ]
        self._process = subprocess.Popen(
            command,
            cwd=self.workdir,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            text=True,
            bufsize=1,
        )
        self._messages = queue.Queue()
        self._reader = threading.Thread(target=self._read_stdout, daemon=True)
        self._reader.start()
        ready = self._read_message()
        if ready.get("type") != "ready" or ready.get("schemaVersion") != SCHEMA_VERSION:
            raise RuntimeError(f"invalid Go simulator ready message: {ready}")
        observation = self._read_message()
        if observation.get("type") != "observation":
            raise RuntimeError(
                f"Go simulator did not expose an observation: {observation}"
            )
        self.agents = ["bot"]
        return {"bot": observation["observation"]}, {
            "bot": {"schemaVersion": SCHEMA_VERSION}
        }

    def step(self, actions: Dict[str, int]):
        if not self._process or not self.agents:
            raise RuntimeError("Go simulator must be reset before step")
        action = actions.get(self.agents[0], 0)
        self._pending_action = False
        self._process.stdin.write(json.dumps({"action": action}) + "\n")
        self._process.stdin.flush()
        message = self._read_message()
        if message.get("type") == "observation":
            self._pending_action = True
            return (
                {"bot": message["observation"]},
                {"bot": float(message.get("reward", 0.0))},
                {"bot": False},
                {"bot": False},
                {"bot": {"schemaVersion": SCHEMA_VERSION}},
            )
        if message.get("type") == "report":
            self.last_report = message["report"]
            self._pending_action = False
            self.agents = []
            return (
                {},
                {"bot": 0.0},
                {"bot": True},
                {"bot": False},
                {"bot": {"schemaVersion": SCHEMA_VERSION}},
            )
        raise RuntimeError(f"invalid Go simulator step message: {message}")

    def close(self):
        if self._process is None:
            return
        self._complete_pending_action()
        if self._process.poll() is None:
            if self.last_report is not None:
                try:
                    self._process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self._process.terminate()
                    self._process.wait(timeout=2)
            else:
                self._process.terminate()
                try:
                    self._process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self._process.kill()
                    self._process.wait(timeout=2)
        if self._process.stdin is not None:
            self._process.stdin.close()
        if self._process.stdout is not None:
            self._process.stdout.close()
        self._process = None
        self.agents = []
        self._pending_action = False

    def _complete_pending_action(self):
        if (
            not self._pending_action
            or self._process is None
            or self._process.poll() is not None
        ):
            return
        try:
            for _ in range(32):
                self._process.stdin.write(json.dumps({"action": 0}) + "\n")
                self._process.stdin.flush()
                message = self._messages.get(timeout=self.timeout_seconds)
                if message is None:
                    return
                if isinstance(message, Exception):
                    raise message
                if message.get("type") == "report":
                    self.last_report = message["report"]
                    self._pending_action = False
                    return
                if message.get("type") != "observation":
                    return
        except (BrokenPipeError, OSError, queue.Empty):
            return

    def _read_stdout(self):
        process = self._process
        for line in process.stdout:
            try:
                self._messages.put(json.loads(line))
            except json.JSONDecodeError as error:
                self._messages.put(RuntimeError(f"invalid Go simulator JSON: {error}"))
        self._messages.put(None)

    def _read_message(self) -> Dict:
        try:
            message = self._messages.get(timeout=self.timeout_seconds)
        except queue.Empty as error:
            self.close()
            raise TimeoutError("Go simulator IPC response timed out") from error
        if isinstance(message, Exception):
            raise message
        if message is None:
            raise RuntimeError("Go simulator exited before sending a protocol message")
        return message
