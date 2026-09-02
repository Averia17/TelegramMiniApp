import argparse
import json

from .behavior_cloning import train_linear_policy
from .trajectory import iter_trajectory_records


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train the dependency-free bot behavior-cloning smoke policy."
    )
    parser.add_argument("input", help="expert trajectory JSONL")
    parser.add_argument("output", help="model JSON output")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--learning-rate", type=float, default=0.1)
    args = parser.parse_args()
    model = train_linear_policy(
        iter_trajectory_records(args.input), args.epochs, args.learning_rate
    )
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(model, stream, indent=2)
        stream.write("\n")
    print(
        f"trained {model['kind']} on {model['sampleCount']} samples; accuracy={model['trainAccuracy']:.3f}"
    )


if __name__ == "__main__":
    main()
