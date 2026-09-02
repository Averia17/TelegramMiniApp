# Bot ML dataset tools

Generate expert state/action pairs from the authoritative Go simulator:

```powershell
Set-Location battle
go run ./cmd/bot-ml-trajectory -episodes 32 -duration-ms 5000 -output ..\tasks\bot-ml-expert.jsonl
Set-Location ..
python -c "from tools.bot_ml.trajectory import validate_trajectory_file; print(validate_trajectory_file('tasks/bot-ml-expert.jsonl'))"
python -m tools.bot_ml.train_behavior_cloning tasks/bot-ml-expert.jsonl tasks/bot-ml-warmstart.json
python -m tools.bot_ml.train_recurrent_ppo tasks/bot-ml-expert.jsonl tasks/bot-ml-recurrent.json --mode behavior-cloning
python -m tools.bot_ml.train_recurrent_ppo tasks/bot-ml-expert.jsonl tasks/bot-ml-ppo-go.json --mode ppo --environment go --duration-ms 1000 --rollout-length 4 --epochs 1
cd battle
go run ./cmd/bot-ml-benchmark -episodes 8 -checkpoint ..\tasks\bot-ml-recurrent.json > ..\tasks\bot-ml-holdout.json
cd ..
python -m tools.bot_ml.analyze_benchmark tasks/bot-ml-holdout.json
```

For the rollout holdout, use the tactical scenario matrix and persist the
report directly:

```powershell
Set-Location battle
go run ./cmd/bot-ml-trajectory -episodes 32 -duration-ms 5000 -matrix -output ..\artifacts\bot_ml\expert-matrix-v1.jsonl
Set-Location ..
python -m tools.bot_ml.train_recurrent_ppo artifacts/bot_ml/expert-matrix-v1.jsonl artifacts/bot_ml/recurrent-ppo-lstm-matrix-v1.json --mode behavior-cloning --epochs 30 --hidden-size 64 --seed 456
Set-Location battle
go run ./cmd/bot-ml-benchmark -episodes 8 -duration-ms 5000 -matrix -checkpoint ..\artifacts\bot_ml\recurrent-ppo-lstm-matrix-v1.json -output ..\artifacts\bot_ml\holdout-matrix-v1.json
Set-Location ..
python -m tools.bot_ml.analyze_benchmark artifacts/bot_ml/holdout-matrix-v1.json
```

For distribution-shift correction, collect utility labels on states visited by
the candidate and train with both datasets:

```powershell
Set-Location battle
go run ./cmd/bot-ml-trajectory -episodes 32 -duration-ms 5000 -matrix -checkpoint ..\artifacts\bot_ml\recurrent-ppo-lstm-matrix-v1.json -output ..\artifacts\bot_ml\dagger-matrix-v2.jsonl
go run ./cmd/bot-ml-replay -checkpoint ..\artifacts\bot_ml\recurrent-ppo-lstm-dagger-v2.json -trajectory ..\artifacts\bot_ml\expert-matrix-v1.jsonl
Set-Location ..
python -m tools.bot_ml.train_recurrent_ppo artifacts/bot_ml/expert-matrix-v1.jsonl artifacts/bot_ml/recurrent-ppo-lstm-dagger-v1.json --extra artifacts/bot_ml/dagger-matrix-v2.jsonl --mode behavior-cloning --epochs 30 --hidden-size 64 --seed 789
Set-Location battle
go run ./cmd/bot-ml-trajectory -episodes 64 -duration-ms 5000 -matrix -checkpoint ..\artifacts\bot_ml\recurrent-ppo-lstm-dagger-v1.json -output ..\artifacts\bot_ml\dagger-matrix-v3.jsonl
Set-Location ..
python -m tools.bot_ml.train_recurrent_ppo artifacts/bot_ml/expert-matrix-v1.jsonl artifacts/bot_ml/recurrent-ppo-lstm-dagger-v2.json --extra artifacts/bot_ml/dagger-matrix-v2.jsonl --extra artifacts/bot_ml/dagger-matrix-v3.jsonl --mode behavior-cloning --epochs 50 --hidden-size 64 --learning-rate 0.0005 --seed 1357
Set-Location battle
go run ./cmd/bot-ml-benchmark -episodes 8 -duration-ms 5000 -matrix -checkpoint ..\artifacts\bot_ml\recurrent-ppo-lstm-dagger-v2.json -output ..\artifacts\bot_ml\holdout-dagger-v2.json
Set-Location ..
python -m tools.bot_ml.analyze_benchmark artifacts/bot_ml/holdout-dagger-v2.json --output artifacts/bot_ml/holdout-dagger-v2-evaluation.json
```

Online PPO can be exercised against the same authoritative scenario matrix
with `--mode ppo --environment go --scenario-matrix`; its checkpoint must still
pass the paired holdout and safety gates before rollout.

PPO now warm-starts from behavior cloning on the supplied expert dataset by
default, then updates that recurrent policy on simulator rollouts. Use
`--no-warm-start` only for a deliberate random-policy baseline experiment.

The matrix currently covers open engagement, low-health retreat, empty-ammo
retreat, safe pickup and contested pickup. The report is paired by seed and
scenario, so a non-positive or regressing result keeps active rollout closed.

For real simulator PPO rollouts, use `--mode ppo --environment go`; the Go
process speaks the observation/action protocol in
`battle/cmd/bot-ml-episode`. Live rooms remain `BOT_ML_MODE=disabled` unless
the holdout and human approval gates are explicitly satisfied.

The first JSONL record is an immutable schema header. Every following sample
contains the clipped observation, structural action mask, utility expert
action, episode seed and bot metadata. The validator is dependency-free so it
can run before installing a training stack.

The generated `linear-softmax-v1` model is a smoke/warm-start artifact only;
it is not the planned recurrent PPO checkpoint.
