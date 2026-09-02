import argparse
import json

from .evaluation import evaluate_benchmark


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate bot ML benchmark quality gates."
    )
    parser.add_argument("report", help="Go benchmark JSON report or suite")
    parser.add_argument("--output", help="optional JSON output path")
    args = parser.parse_args()
    with open(args.report, "r", encoding="utf-8") as stream:
        result = evaluate_benchmark(json.load(stream))
    rendered = json.dumps(result, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as stream:
            stream.write(rendered + "\n")
    print(rendered)
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
