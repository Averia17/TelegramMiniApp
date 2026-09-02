import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .schema import (
    ACTION_NAMES,
    COMBAT_PROFILE_ID,
    COMBAT_RULES_VERSION,
    OBSERVATION_SIZE,
    SCHEMA_FINGERPRINT,
    SCHEMA_VERSION,
)

try:
    import torch
    from torch import nn

    HAS_TORCH = True
except ImportError:  # pragma: no cover - exercised by dependency-free installs
    torch = None

    class _NNFallback:
        Module = object

    nn = _NNFallback()
    HAS_TORCH = False


class MaskedRecurrentActorCritic(nn.Module):
    """Small LSTM actor/critic with structural action masking."""

    def __init__(self, input_size: int, hidden_size: int, action_size: int):
        if not HAS_TORCH:
            raise ImportError("PyTorch is required for recurrent PPO training")
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.action_size = action_size
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers=1)
        self.actor = nn.Linear(hidden_size, action_size)
        self.critic = nn.Linear(hidden_size, 1)

    def forward(self, values, hidden=None, action_mask=None):
        output, hidden = self.lstm(values, hidden)
        logits = self.actor(output)
        if action_mask is not None:
            logits = logits.masked_fill(~action_mask.bool(), -1e9)
        return logits, self.critic(output).squeeze(-1), hidden


@dataclass(frozen=True)
class PPOConfig:
    hidden_size: int = 64
    learning_rate: float = 3e-4
    clip_epsilon: float = 0.2
    value_coefficient: float = 0.5
    entropy_coefficient: float = 0.01
    gamma: float = 0.99
    gae_lambda: float = 0.95
    rollout_length: int = 128
    update_epochs: int = 4


def recurrent_forward(model, values, action_masks, episode_starts=None, hidden=None):
    """Run a rollout while preserving LSTM state across steps.

    ``episode_starts`` marks rows whose hidden state must be cleared before
    inference. Keeping this reset explicit lets one PPO batch contain several
    episodes without leaking memory from one match into the next.
    """
    if episode_starts is None:
        return model(values, hidden, action_masks)
    if episode_starts.ndim != 2 or episode_starts.shape[:2] != values.shape[:2]:
        raise ValueError("episode_starts must have shape [time, batch]")

    logits_steps = []
    value_steps = []
    current_hidden = hidden
    for step in range(values.shape[0]):
        starts = (
            episode_starts[step]
            .to(dtype=torch.bool, device=values.device)
            .view(1, values.shape[1], 1)
        )
        if current_hidden is not None:
            keep = (~starts).to(dtype=current_hidden[0].dtype)
            current_hidden = (current_hidden[0] * keep, current_hidden[1] * keep)
        logits, critics, current_hidden = model(
            values[step : step + 1], current_hidden, action_masks[step : step + 1]
        )
        logits_steps.append(logits)
        value_steps.append(critics)
    return torch.cat(logits_steps, dim=0), torch.cat(value_steps, dim=0), current_hidden


def ppo_update(
    model: MaskedRecurrentActorCritic,
    optimizer,
    values,
    action_masks,
    actions,
    old_log_probs,
    advantages,
    returns,
    config: PPOConfig,
    episode_starts=None,
) -> Dict[str, float]:
    """Apply one clipped PPO update to a recurrent rollout."""
    logits, predicted_values, _ = recurrent_forward(
        model, values, action_masks, episode_starts=episode_starts
    )
    distribution = torch.distributions.Categorical(logits=logits)
    log_probs = distribution.log_prob(actions)
    ratio = torch.exp(log_probs - old_log_probs)
    unclipped = ratio * advantages
    clipped = (
        torch.clamp(ratio, 1 - config.clip_epsilon, 1 + config.clip_epsilon)
        * advantages
    )
    policy_loss = -torch.minimum(unclipped, clipped).mean()
    value_loss = (predicted_values - returns).pow(2).mean()
    entropy = distribution.entropy().mean()
    loss = (
        policy_loss
        + config.value_coefficient * value_loss
        - config.entropy_coefficient * entropy
    )
    optimizer.zero_grad()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
    optimizer.step()
    return {
        "loss": float(loss.detach()),
        "policyLoss": float(policy_loss.detach()),
        "valueLoss": float(value_loss.detach()),
        "entropy": float(entropy.detach()),
    }


def export_checkpoint(model: MaskedRecurrentActorCritic) -> Dict:
    if not HAS_TORCH:
        raise ImportError("PyTorch is required to export a recurrent checkpoint")
    with torch.no_grad():
        input_to_hidden = model.lstm.weight_ih_l0.detach().cpu().tolist()
        hidden_to_hidden = model.lstm.weight_hh_l0.detach().cpu().tolist()
        lstm_bias = (
            (model.lstm.bias_ih_l0 + model.lstm.bias_hh_l0).detach().cpu().tolist()
        )
        actor_weight = model.actor.weight.detach().cpu().tolist()
        actor_bias = model.actor.bias.detach().cpu().tolist()
    return {
        "kind": "recurrent-ppo-lstm-v1",
        "schemaVersion": SCHEMA_VERSION,
        "schemaFingerprint": SCHEMA_FINGERPRINT,
        "combatProfileId": COMBAT_PROFILE_ID,
        "combatRulesVersion": COMBAT_RULES_VERSION,
        "inputSize": model.input_size,
        "hiddenSize": model.hidden_size,
        "actionSize": model.action_size,
        "inputToHidden": input_to_hidden,
        "hiddenToHidden": hidden_to_hidden,
        "lstmBias": lstm_bias,
        "actorWeight": actor_weight,
        "actorBias": actor_bias,
    }


def _groups(records: Iterable[Dict]) -> List[List[Dict]]:
    grouped = defaultdict(list)
    for index, record in enumerate(records):
        key = (record.get("episodeId", f"episode-{index}"), record.get("botId", "bot"))
        grouped[key].append(record)
    return list(grouped.values())


def train_recurrent_behavior_cloning(
    records: Iterable[Dict],
    hidden_size: int = 64,
    epochs: int = 20,
    learning_rate: float = 1e-3,
) -> Tuple[MaskedRecurrentActorCritic, Dict]:
    """Warm-start the recurrent actor from utility-AI trajectories."""
    if not HAS_TORCH:
        raise ImportError("PyTorch is required for recurrent behavior cloning")
    groups = _groups(records)
    if not groups:
        raise ValueError("recurrent training dataset contains no samples")
    model = MaskedRecurrentActorCritic(OBSERVATION_SIZE, hidden_size, len(ACTION_NAMES))
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    model.train()
    for _ in range(epochs):
        for group in groups:
            values = torch.tensor(
                [row["observation"]["values"] for row in group], dtype=torch.float32
            ).unsqueeze(1)
            masks = torch.tensor(
                [row["observation"]["actionMask"] for row in group], dtype=torch.bool
            ).unsqueeze(1)
            actions = torch.tensor([row["action"] for row in group], dtype=torch.long)
            logits, _, _ = model(values, action_mask=masks)
            loss = nn.functional.cross_entropy(logits[:, 0, :], actions)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

    model.eval()
    correct = total = 0
    with torch.no_grad():
        for group in groups:
            values = torch.tensor(
                [row["observation"]["values"] for row in group], dtype=torch.float32
            ).unsqueeze(1)
            masks = torch.tensor(
                [row["observation"]["actionMask"] for row in group], dtype=torch.bool
            ).unsqueeze(1)
            actions = torch.tensor([row["action"] for row in group], dtype=torch.long)
            logits, _, _ = model(values, action_mask=masks)
            correct += int((logits[:, 0, :].argmax(dim=-1) == actions).sum())
            total += len(actions)
    checkpoint = export_checkpoint(model)
    checkpoint.update(
        {
            "training": "behavior-cloning",
            "epochs": epochs,
            "sampleCount": total,
            "trainAccuracy": correct / max(1, total),
        }
    )
    return model, checkpoint


def train_recurrent_ppo(
    env,
    config: PPOConfig = PPOConfig(),
    updates: int = 10,
    seed: int = 0,
    initial_model: Optional[MaskedRecurrentActorCritic] = None,
):
    """Train on a PettingZoo-style single-agent parallel environment.

    The environment is intentionally injected: production evaluation uses the
    Go simulator, while the dependency-free trajectory adapter supplies a
    deterministic smoke environment for this trainer.
    """
    if not HAS_TORCH:
        raise ImportError("PyTorch is required for recurrent PPO")
    if updates <= 0 or config.rollout_length <= 0:
        raise ValueError("updates and rollout_length must be positive")
    torch.manual_seed(seed)
    model = (
        initial_model
        if initial_model is not None
        else MaskedRecurrentActorCritic(
            OBSERVATION_SIZE, config.hidden_size, len(ACTION_NAMES)
        )
    )
    if (
        model.input_size != OBSERVATION_SIZE
        or model.hidden_size != config.hidden_size
        or model.action_size != len(ACTION_NAMES)
    ):
        raise ValueError("initial_model does not match the PPO schema/configuration")
    optimizer = torch.optim.Adam(model.parameters(), lr=config.learning_rate)
    history = []
    for update in range(updates):
        observations, _ = env.reset(seed + update)
        hidden = None
        episode_start = True
        features, masks, actions, old_log_probs, values, rewards, dones = (
            [],
            [],
            [],
            [],
            [],
            [],
            [],
        )
        episode_starts = []
        for _ in range(config.rollout_length):
            if not env.agents:
                observations, _ = env.reset(seed + update)
                hidden = None
                episode_start = True
            agent = env.agents[0]
            observation = observations[agent]
            value_tensor = torch.tensor(
                observation["values"], dtype=torch.float32
            ).view(1, 1, -1)
            mask_tensor = torch.tensor(
                observation["actionMask"], dtype=torch.bool
            ).view(1, 1, -1)
            episode_starts.append(torch.tensor([[episode_start]], dtype=torch.bool))
            with torch.no_grad():
                logits, value, hidden = model(value_tensor, hidden, mask_tensor)
                distribution = torch.distributions.Categorical(logits=logits)
                action = distribution.sample()
                old_log_prob = distribution.log_prob(action)
            result = env.step({agent: int(action.item())})
            next_observations, step_rewards, terminations, truncations, _ = result
            features.append(value_tensor)
            values.append(value.detach())
            masks.append(mask_tensor)
            actions.append(action)
            old_log_probs.append(old_log_prob)
            rewards.append(float(step_rewards[agent]))
            done = bool(terminations[agent] or truncations[agent])
            dones.append(done)
            if done:
                observations, _ = env.reset(seed + update + 1)
                hidden = None
                episode_start = True
            else:
                observations = next_observations
                episode_start = False

        returns = []
        running = 0.0
        for reward, done in reversed(list(zip(rewards, dones))):
            if done:
                running = 0.0
            running = reward + config.gamma * running
            returns.append(running)
        returns = torch.tensor(list(reversed(returns)), dtype=torch.float32).view(-1, 1)
        values_tensor = torch.cat(values, dim=0)
        advantages = returns - values_tensor.detach()
        advantages = (advantages - advantages.mean()) / (
            advantages.std(unbiased=False) + 1e-8
        )
        rollout_features = torch.cat(features, dim=0)
        rollout_masks = torch.cat(masks, dim=0)
        rollout_actions = torch.cat(actions, dim=0)
        rollout_log_probs = torch.cat(old_log_probs, dim=0)
        rollout_episode_starts = torch.cat(episode_starts, dim=0)
        metrics = {}
        for _ in range(config.update_epochs):
            metrics = ppo_update(
                model,
                optimizer,
                rollout_features,
                rollout_masks,
                rollout_actions,
                rollout_log_probs,
                advantages,
                returns,
                config,
                episode_starts=rollout_episode_starts,
            )
        history.append(metrics)
    checkpoint = export_checkpoint(model)
    checkpoint.update(
        {
            "training": "ppo",
            "updates": updates,
            "seed": seed,
            "sampleCount": updates * config.rollout_length,
        }
    )
    return model, checkpoint, history
