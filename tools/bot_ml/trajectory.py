import json
import math
from pathlib import Path
from typing import Dict, Iterator, Union

from .schema import (
    ACTION_NAMES,
    FEATURE_NAMES,
    OBSERVATION_SIZE,
    SCHEMA_FINGERPRINT,
    SCHEMA_VERSION,
)

PathLike = Union[str, Path]


def _read_jsonl(path: PathLike) -> Iterator[Dict]:
    with Path(path).open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"line {line_number}: invalid JSON: {error.msg}"
                ) from error
            if not isinstance(record, dict):
                raise ValueError(f"line {line_number}: record must be an object")
            yield record


def _validate_header(header: Dict) -> None:
    if header.get("recordType") != "header":
        raise ValueError("first record must be a header")
    if header.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("schema version mismatch")
    if header.get("schemaFingerprint") != SCHEMA_FINGERPRINT:
        raise ValueError("schema fingerprint mismatch")
    if header.get("observationSize") != OBSERVATION_SIZE:
        raise ValueError("observation size mismatch")
    if header.get("featureNames") != FEATURE_NAMES:
        raise ValueError("feature names mismatch")
    if header.get("actionNames") != ACTION_NAMES:
        raise ValueError("action names mismatch")


def _validate_sample(sample: Dict, line_number: int) -> None:
    if sample.get("recordType") != "sample":
        raise ValueError(f"line {line_number}: expected a sample record")
    for field in ("atMs", "botId", "hero", "policy", "observation", "action"):
        if field not in sample:
            raise ValueError(f"line {line_number}: sample is missing {field}")
    if not isinstance(sample["atMs"], int) or isinstance(sample["atMs"], bool):
        raise ValueError(f"line {line_number}: atMs must be an integer")
    for field in ("botId", "hero", "policy"):
        if not isinstance(sample[field], str) or not sample[field]:
            raise ValueError(f"line {line_number}: {field} must be non-empty")

    observation = sample["observation"]
    if not isinstance(observation, dict):
        raise ValueError(f"line {line_number}: observation must be an object")
    if observation.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"line {line_number}: observation schema version mismatch")
    values = observation.get("values")
    if not isinstance(values, list) or len(values) != OBSERVATION_SIZE:
        raise ValueError(
            f"line {line_number}: observation values must have {OBSERVATION_SIZE} entries"
        )
    for value in values:
        if (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not math.isfinite(value)
            or not -1 <= value <= 1
        ):
            raise ValueError(
                f"line {line_number}: observation values must be finite and clipped to [-1, 1]"
            )
    mask = observation.get("actionMask")
    if (
        not isinstance(mask, list)
        or len(mask) != len(ACTION_NAMES)
        or not all(isinstance(item, bool) for item in mask)
    ):
        raise ValueError(
            f"line {line_number}: observation action mask has invalid shape"
        )
    action = sample["action"]
    if (
        not isinstance(action, int)
        or isinstance(action, bool)
        or not 0 <= action < len(ACTION_NAMES)
    ):
        raise ValueError(f"line {line_number}: action is outside the action vocabulary")
    if not any(mask) or not mask[action]:
        raise ValueError(
            f"line {line_number}: action is not allowed by the observation mask"
        )


def iter_trajectory_records(path: PathLike) -> Iterator[Dict]:
    records = _read_jsonl(path)
    try:
        header = next(records)
    except StopIteration as error:
        raise ValueError("trajectory file is empty") from error
    _validate_header(header)
    for line_number, sample in enumerate(records, start=2):
        _validate_sample(sample, line_number)
        yield sample


def validate_trajectory_file(path: PathLike) -> int:
    """Validate a JSONL dataset and return its number of samples."""
    count = sum(1 for _ in iter_trajectory_records(path))
    if count == 0:
        raise ValueError("trajectory file contains no samples")
    return count
