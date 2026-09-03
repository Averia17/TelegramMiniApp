from typing import Dict, Iterable, Optional

from .recurrent_ppo import (
    HAS_TORCH,
    MaskedTacticalRecurrentActorCritic,
    export_tactical_checkpoint,
)
from .schema import TACTICAL_OBSERVATION_SIZE

if HAS_TORCH:
    import torch
    from torch import nn


def _head_masks(observations, name):
    return torch.tensor(
        [observations[agent][f"{name}Mask"] for agent in observations], dtype=torch.bool
    )


def _sample_action(heads, masks):
    actions = {}
    log_prob = None
    entropy = None
    for name in ("intent", "target", "movement", "ability"):
        distribution = torch.distributions.Categorical(logits=heads[name])
        action = distribution.sample()
        actions[name] = action
        term = distribution.log_prob(action)
        log_prob = term if log_prob is None else log_prob + term
        ent = distribution.entropy()
        entropy = ent if entropy is None else entropy + ent
    return actions, log_prob, entropy


def train_tactical_self_play(
    env,
    hidden_size: int = 64,
    updates: int = 20,
    rollout_steps: int = 32,
    learning_rate: float = 3e-4,
    seed: int = 123,
    initial_model: Optional[MaskedTacticalRecurrentActorCritic] = None,
):
    """Train one shared policy against itself in the authoritative 3v3 env.

    Each team has three independently recurrent agents, while one set of
    weights is shared across all six seats. The environment supplies the
    team-shaped reward; the simple PPO update intentionally treats each
    decision as a short local transition so the bridge remains useful on CPU.
    """
    if not HAS_TORCH:
        raise ImportError("PyTorch is required for tactical self-play")
    if updates <= 0 or rollout_steps <= 0:
        raise ValueError("updates and rollout_steps must be positive")
    torch.manual_seed(seed)
    model = initial_model or MaskedTacticalRecurrentActorCritic(
        TACTICAL_OBSERVATION_SIZE, hidden_size
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    history = []
    for update in range(updates):
        observations, _ = env.reset(seed + update)
        hidden: Dict[str, object] = {}
        samples = []
        for _ in range(rollout_steps):
            agents = list(env.agents)
            if not agents:
                observations, _ = env.reset(seed + update + 1)
                continue
            actions_for_env = {}
            for agent in agents:
                observation = observations[agent]
                values = torch.tensor(observation["values"], dtype=torch.float32).view(
                    1, 1, -1
                )
                masks = {
                    name: torch.tensor(
                        observation[f"{name}Mask"], dtype=torch.bool
                    ).view(1, 1, -1)
                    for name in ("intent", "target", "movement", "ability")
                }
                with torch.no_grad():
                    heads, _, next_hidden = model(values, hidden.get(agent), masks)
                    sampled, log_prob, _ = _sample_action(
                        {name: heads[name].squeeze(0) for name in heads},
                        {name: masks[name].squeeze(0) for name in masks},
                    )
                hidden[agent] = next_hidden
                actions_for_env[agent] = {
                    name: int(value.item()) for name, value in sampled.items()
                }
                samples.append(
                    (observation, actions_for_env[agent], float(log_prob.item()), agent)
                )
            next_observations, rewards, terminations, truncations, _ = env.step(
                actions_for_env
            )
            for index in range(len(samples) - len(agents), len(samples)):
                observation, action, old_log_prob, agent = samples[index]
                samples[index] = (
                    observation,
                    action,
                    old_log_prob,
                    rewards.get(agent, 0.0),
                )
            if not next_observations:
                observations, _ = env.reset(seed + update + 1)
                hidden = {}
            else:
                observations = next_observations

        if not samples:
            continue
        observations_batch = [sample[0] for sample in samples]
        values = torch.tensor(
            [sample[0]["values"] for sample in samples], dtype=torch.float32
        ).view(1, len(samples), -1)
        masks = {
            name: torch.tensor(
                [sample[0][f"{name}Mask"] for sample in samples], dtype=torch.bool
            ).view(1, len(samples), -1)
            for name in ("intent", "target", "movement", "ability")
        }
        heads, predicted_values, _ = model(values, masks=masks)
        new_log_probs = []
        for name in ("intent", "target", "movement", "ability"):
            actions = torch.tensor(
                [sample[1][name] for sample in samples], dtype=torch.long
            ).view(1, -1)
            new_log_probs.append(
                torch.distributions.Categorical(logits=heads[name]).log_prob(actions)
            )
        new_log_prob = sum(new_log_probs)
        old_log_prob = torch.tensor(
            [sample[2] for sample in samples], dtype=torch.float32
        ).view(1, -1)
        rewards = torch.tensor(
            [float(sample[3]) for sample in samples], dtype=torch.float32
        ).view(1, -1)
        advantages = rewards - predicted_values.detach()
        advantages = (advantages - advantages.mean()) / (
            advantages.std(unbiased=False) + 1e-8
        )
        ratio = torch.exp(new_log_prob - old_log_prob)
        policy_loss = -(ratio * advantages).mean()
        value_loss = (predicted_values - rewards).pow(2).mean()
        entropy = sum(
            torch.distributions.Categorical(logits=heads[name]).entropy().mean()
            for name in heads
        )
        loss = policy_loss + 0.5 * value_loss - 0.01 * entropy
        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 0.5)
        optimizer.step()
        history.append(
            {
                "update": update,
                "loss": float(loss.detach()),
                "meanReward": float(rewards.mean()),
                "behaviorSamples": len(samples),
            }
        )
    model.eval()
    checkpoint = export_tactical_checkpoint(model)
    checkpoint.update(
        {
            "training": "multi-agent-self-play",
            "updates": updates,
            "sampleCount": sum(item["behaviorSamples"] for item in history),
            "history": history,
        }
    )
    return model, checkpoint, history


def train_tactical_behavior_cloning(
    records: Iterable[Dict],
    hidden_size: int = 64,
    epochs: int = 12,
    learning_rate: float = 1e-3,
):
    """Warm-start all four heads from the authoritative deterministic teacher."""
    if not HAS_TORCH:
        raise ImportError("PyTorch is required for tactical behavior cloning")
    rows = list(records)
    if not rows:
        raise ValueError("tactical behavior-cloning dataset is empty")
    model = MaskedTacticalRecurrentActorCritic(TACTICAL_OBSERVATION_SIZE, hidden_size)
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
    groups = {}
    for row in rows:
        groups.setdefault(
            (row.get("episodeId", "episode"), row.get("botId", "bot")), []
        ).append(row)
    for _ in range(epochs):
        for group in groups.values():
            values = torch.tensor(
                [row["observation"]["values"] for row in group], dtype=torch.float32
            ).view(len(group), 1, -1)
            masks = {
                name: torch.tensor(
                    [row["observation"][f"{name}Mask"] for row in group],
                    dtype=torch.bool,
                ).view(len(group), 1, -1)
                for name in ("intent", "target", "movement", "ability")
            }
            heads, _, _ = model(values, masks=masks)
            losses = [
                nn.functional.cross_entropy(
                    heads[name][:, 0, :],
                    torch.tensor([row[name] for row in group], dtype=torch.long),
                )
                for name in ("intent", "target", "movement", "ability")
            ]
            loss = sum(losses)
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
    model.eval()
    correct = {name: 0 for name in ("intent", "target", "movement", "ability")}
    with torch.no_grad():
        for group in groups.values():
            values = torch.tensor(
                [row["observation"]["values"] for row in group], dtype=torch.float32
            ).view(len(group), 1, -1)
            masks = {
                name: torch.tensor(
                    [row["observation"][f"{name}Mask"] for row in group],
                    dtype=torch.bool,
                ).view(len(group), 1, -1)
                for name in ("intent", "target", "movement", "ability")
            }
            heads, _, _ = model(values, masks=masks)
            for name in correct:
                correct[name] += int(
                    (
                        heads[name][:, 0, :].argmax(dim=-1)
                        == torch.tensor([row[name] for row in group])
                    ).sum()
                )
    checkpoint = export_tactical_checkpoint(model)
    checkpoint.update(
        {
            "training": "behavior-cloning",
            "epochs": epochs,
            "sampleCount": len(rows),
            "headAccuracy": {
                name: count / len(rows) for name, count in correct.items()
            },
        }
    )
    return model, checkpoint
