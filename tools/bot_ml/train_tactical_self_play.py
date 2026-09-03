import argparse
import json

from .go_ipc_env import GoSimulatorTacticalTeamEnv
from .tactical_self_play import (
    train_tactical_behavior_cloning,
    train_tactical_self_play,
)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train the tactical-v2 bot policy in authoritative 3v3 self-play."
    )
    parser.add_argument("output", help="tactical checkpoint JSON")
    parser.add_argument("--updates", type=int, default=20)
    parser.add_argument("--rollout-steps", type=int, default=32)
    parser.add_argument("--hidden-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--duration-ms", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument(
        "--expert",
        help="tactical JSONL teacher dataset for behavior-cloning warm start",
    )
    parser.add_argument("--bc-epochs", type=int, default=12)
    args = parser.parse_args()
    initial_model = None
    checkpoint = None
    if args.expert:
        with open(args.expert, "r", encoding="utf-8") as stream:
            records = [json.loads(line) for line in stream if line.strip()]
        records = [record for record in records if record.get("recordType") == "sample"]
        initial_model, checkpoint = train_tactical_behavior_cloning(
            records,
            hidden_size=args.hidden_size,
            epochs=args.bc_epochs,
            learning_rate=args.learning_rate,
        )
    env = GoSimulatorTacticalTeamEnv(
        ["go", "run", "./cmd/bot-ml-episode"],
        workdir="battle",
        duration_ms=args.duration_ms,
    )
    try:
        _, checkpoint, _ = train_tactical_self_play(
            env,
            hidden_size=args.hidden_size,
            updates=args.updates,
            rollout_steps=args.rollout_steps,
            learning_rate=args.learning_rate,
            seed=args.seed,
            initial_model=initial_model,
        )
    finally:
        env.close()
    checkpoint["seed"] = args.seed
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(checkpoint, stream, indent=2)
        stream.write("\n")
    print(
        f"trained {checkpoint['kind']} with multi-agent self-play; samples={checkpoint['sampleCount']}"
    )


if __name__ == "__main__":
    main()
