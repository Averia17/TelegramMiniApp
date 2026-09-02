import math
from typing import Dict, Iterable, List, Sequence

from .schema import ACTION_NAMES, OBSERVATION_SIZE, SCHEMA_FINGERPRINT, SCHEMA_VERSION


def _sample_parts(sample: Dict):
    try:
        observation = sample["observation"]
        values = observation["values"]
        mask = observation["actionMask"]
        action = sample["action"]
    except (KeyError, TypeError) as error:
        raise ValueError(f"invalid behavior-cloning sample: {error}") from error
    if observation.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError("behavior-cloning sample schema version mismatch")
    if len(values) != OBSERVATION_SIZE or len(mask) != len(ACTION_NAMES):
        raise ValueError("behavior-cloning sample has incompatible shape")
    if not 0 <= action < len(ACTION_NAMES) or not mask[action]:
        raise ValueError("behavior-cloning expert action is not allowed by its mask")
    if not any(mask):
        raise ValueError("behavior-cloning sample has no valid actions")
    if any(
        not isinstance(value, (int, float)) or not math.isfinite(value)
        for value in values
    ):
        raise ValueError("behavior-cloning sample contains a non-finite feature")
    return values, mask, action


def _masked_softmax(logits: Sequence[float], mask: Sequence[bool]) -> List[float]:
    allowed = [index for index, valid in enumerate(mask) if valid]
    if not allowed:
        raise ValueError("policy action mask has no valid actions")
    maximum = max(logits[index] for index in allowed)
    exponentials = [0.0] * len(logits)
    total = 0.0
    for index in allowed:
        exponentials[index] = math.exp(logits[index] - maximum)
        total += exponentials[index]
    return [value / total for value in exponentials]


def train_linear_policy(
    samples: Iterable[Dict], epochs: int = 100, learning_rate: float = 0.1
) -> Dict:
    """Train a tiny masked linear softmax policy for dataset smoke checks.

    This is deliberately dependency-free and is only a behavior-cloning
    warm-start artifact. Recurrent PPO remains the production candidate.
    """
    parsed = [_sample_parts(sample) for sample in samples]
    if not parsed:
        raise ValueError("behavior-cloning dataset contains no samples")
    if epochs <= 0 or learning_rate <= 0:
        raise ValueError("epochs and learning_rate must be positive")

    weights = [[0.0] * OBSERVATION_SIZE for _ in ACTION_NAMES]
    bias = [0.0] * len(ACTION_NAMES)
    for _ in range(epochs):
        for values, mask, target in parsed:
            logits = [
                sum(row[index] * values[index] for index in range(OBSERVATION_SIZE))
                + bias[action]
                for action, row in enumerate(weights)
            ]
            probabilities = _masked_softmax(logits, mask)
            for action in range(len(ACTION_NAMES)):
                if not mask[action]:
                    continue
                gradient = probabilities[action] - (1.0 if action == target else 0.0)
                for index, value in enumerate(values):
                    weights[action][index] -= learning_rate * gradient * value
                bias[action] -= learning_rate * gradient

    model = {
        "kind": "linear-softmax-v1",
        "schemaVersion": SCHEMA_VERSION,
        "schemaFingerprint": SCHEMA_FINGERPRINT,
        "observationSize": OBSERVATION_SIZE,
        "actionNames": ACTION_NAMES,
        "weights": weights,
        "bias": bias,
        "epochs": epochs,
        "sampleCount": len(parsed),
    }
    correct = sum(
        predict_action(model, values, mask) == target for values, mask, target in parsed
    )
    model["trainAccuracy"] = correct / len(parsed)
    return model


def predict_action(
    model: Dict, values: Sequence[float], action_mask: Sequence[bool]
) -> int:
    if (
        model.get("schemaVersion") != SCHEMA_VERSION
        or model.get("schemaFingerprint") != SCHEMA_FINGERPRINT
    ):
        raise ValueError("model schema metadata mismatch")
    if (
        len(values) != OBSERVATION_SIZE
        or len(action_mask) != len(ACTION_NAMES)
        or not any(action_mask)
    ):
        raise ValueError("prediction input has incompatible shape or empty action mask")
    weights = model.get("weights")
    bias = model.get("bias")
    if (
        not isinstance(weights, list)
        or len(weights) != len(ACTION_NAMES)
        or not isinstance(bias, list)
        or len(bias) != len(ACTION_NAMES)
    ):
        raise ValueError("model parameters have incompatible shape")
    logits = [
        sum(weights[action][index] * values[index] for index in range(OBSERVATION_SIZE))
        + bias[action]
        for action in range(len(ACTION_NAMES))
    ]
    return max(
        (action for action, valid in enumerate(action_mask) if valid),
        key=lambda action: logits[action],
    )
