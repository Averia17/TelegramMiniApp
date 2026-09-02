# Bot ML integration — todo

## Slice 1 — contract + benchmark

- [x] Add versioned ML observation/action schema and fingerprint.
- [x] Add deterministic feature extraction from `GameState` using local bot
      perception only.
- [x] Add policy adapter seam with current utility policy as baseline.
- [x] Add paired-seed simulation runner and JSON report metrics.
- [x] Add deterministic tactical scenario matrix for open combat, retreat,
      empty ammo and pickup decisions.
- [x] Add focused tests for stable entity ordering, clipping and replay.

## Slice 2 — training environment

- [x] Add Python schema/dataset adapter and trajectory JSONL format.
- [x] Export expert trajectories from the current utility bot.
- [x] Add behavior-cloning smoke training with a tiny fixture.
- [x] Add DAgger state-distribution collection and combined-dataset training.

## Slice 3 — recurrent PPO

- [x] Add masked RecurrentPPO training configuration.
- [x] Add self-play opponent pool and holdout seed evaluation.
- [x] Produce the first versioned checkpoint and benchmark report.
- [x] Exercise online PPO through the authoritative Go IPC scenario matrix.

## Slice 4 — runtime shadow

- [x] Add recurrent inference adapter with validation/error fallback.
- [x] Record shadow-vs-utility disagreement, latency and predicted action.
- [x] Run internal matches with ML disabled by default.

## Slice 5 — rollout

- [x] Add model/profile compatibility guard and feature flag.
- [x] Run automated canary/holdout evaluation.
- [x] Reject the first matrix checkpoint after detecting its small
      accuracy/damage regression; keep active rollout closed.
- [x] Run DAgger iteration and pass the 40-episode paired matrix holdout with
      positive damage/accuracy/hit signals and no safety regression.
- [ ] Complete human playtest and final enablement review.
- [x] Document rollback and final enablement decision.

## Next phase — OpenAI-style policy control

- [x] Preserve LSTM state across PPO rollout sequences and reset it at episode boundaries.
- [x] Warm-start PPO from behavior cloning instead of discarding the expert policy.
- [ ] Expand the action space with target slot and ability intent so `engage`/`roam` are not merely delegated back to deterministic behavior selection.
- [ ] Add multi-agent team self-play with an opponent pool and curriculum over cover, resources and objectives.
- [ ] Add an effective-ML-control metric: decisions made, utility overrides, hard-interrupt overrides and deterministic fallbacks.
- [ ] Train a new checkpoint with the improved recurrent PPO and require a fresh paired holdout before replacing the active canary.

### Slice 6 acceptance gates

- [ ] v2 observation exposes stable visible enemy/ally target slots and cover candidates.
- [ ] v2 recurrent checkpoint exports intent, target, movement and ability heads with a compatibility fingerprint.
- [ ] Go runtime executes the selected target/movement/ability intent with legality masks and safe fallback.
- [ ] 3v3 authoritative self-play reports team reward components and opponent-pool identity.
- [ ] Paired 3v3 holdout shows a positive team outcome without death, idle, stuck or combat-safety regression.
