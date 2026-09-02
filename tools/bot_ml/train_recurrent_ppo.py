import argparse
import json
import random

from .parallel_env import TrajectoryParallelEnv
from .recurrent_ppo import (
    HAS_TORCH,
    PPOConfig,
    train_recurrent_behavior_cloning,
    train_recurrent_ppo,
)
from .trajectory import iter_trajectory_records


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train/export the recurrent bot ML checkpoint."
    )
    parser.add_argument("input", help="expert trajectory JSONL")
    parser.add_argument("output", help="recurrent checkpoint JSON")
    parser.add_argument(
        "--extra",
        action="append",
        default=[],
        help="additional validated trajectory JSONL for DAgger/continual training",
    )
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument(
        "--mode", choices=("behavior-cloning", "ppo"), default="behavior-cloning"
    )
    parser.add_argument("--environment", choices=("replay", "go"), default="replay")
    parser.add_argument("--duration-ms", type=int, default=5000)
    parser.add_argument("--rollout-length", type=int, default=128)
    parser.add_argument(
        "--scenario-matrix",
        action="store_true",
        help="cycle the authoritative Go IPC environment through tactical scenarios",
    )
    parser.add_argument(
        "--no-warm-start",
        action="store_true",
        help="start PPO from random weights instead of behavior cloning",
    )
    args = parser.parse_args()
    if not HAS_TORCH:
        raise SystemExit(
            "PyTorch is required; install tools/bot_ml/requirements-training.txt"
        )

    import torch

    random.seed(args.seed)
    torch.manual_seed(args.seed)
    records = list(iter_trajectory_records(args.input))
    for extra_path in args.extra:
        records.extend(iter_trajectory_records(extra_path))
    if args.mode == "ppo":
        initial_model = None
        if not args.no_warm_start:
            warm_start_epochs = max(10, min(30, args.epochs))
            initial_model, _ = train_recurrent_behavior_cloning(
                records,
                hidden_size=args.hidden_size,
                epochs=warm_start_epochs,
                learning_rate=args.learning_rate,
            )
        if args.environment == "go":
            from .go_ipc_env import GoSimulatorParallelEnv

            scenarios = ["open_engage"]
            if args.scenario_matrix:
                scenarios = [
                    "open_engage",
                    "low_health_retreat",
                    "empty_ammo_retreat",
                    "safe_pickup",
                    "contested_pickup",
                ]
            env = GoSimulatorParallelEnv(
                ["go", "run", "./cmd/bot-ml-episode"],
                workdir="battle",
                duration_ms=args.duration_ms,
                scenarios=scenarios,
            )
        else:
            env = TrajectoryParallelEnv(records)
        try:
            _, checkpoint, history = train_recurrent_ppo(
                env,
                PPOConfig(
                    hidden_size=args.hidden_size,
                    learning_rate=args.learning_rate,
                    rollout_length=args.rollout_length,
                    update_epochs=4,
                ),
                updates=args.epochs,
                seed=args.seed,
                initial_model=initial_model,
            )
        finally:
            env.close()
        checkpoint["lastUpdate"] = history[-1] if history else {}
    else:
        _, checkpoint = train_recurrent_behavior_cloning(
            records, args.hidden_size, args.epochs, args.learning_rate
        )
    checkpoint["seed"] = args.seed
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(checkpoint, stream, indent=2)
        stream.write("\n")
    if args.mode == "behavior-cloning":
        print(
            f"trained {checkpoint['kind']} on {checkpoint['sampleCount']} samples; accuracy={checkpoint['trainAccuracy']:.3f}"
        )
    else:
        print(
            f"trained {checkpoint['kind']} with PPO for {checkpoint['updates']} updates; samples={checkpoint['sampleCount']}"
        )


if __name__ == "__main__":
    main()
