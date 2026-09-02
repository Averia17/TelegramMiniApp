# Bot ML rollout runbook — 2026-09

## Safe modes

Runtime selection is controlled by two environment variables:

```text
BOT_ML_MODE=disabled|shadow|active
BOT_ML_CHECKPOINT=/absolute/path/to/recurrent-ppo-lstm-v1.json
BOT_ML_ACTIVE_APPROVED=true
```

The default is `disabled`. `shadow` evaluates the checkpoint on the 320 ms
tactical cadence but leaves utility AI authoritative. `active` lets the model
choose only the four masked tactical intents; movement, aim, collision,
damage and cooldowns remain authoritative Go logic. A missing, incompatible,
malformed or non-finite checkpoint leaves the room on utility AI. Active mode
also requires the explicit approval flag, which must only be set after the
holdout and human gates below pass.

## Required gates before active

1. Generate expert trajectories and validate their schema fingerprint.
2. Train/export a recurrent checkpoint with the current combat profile and
   rules version.
3. Run paired holdout seeds against utility AI.
4. Pass `tools.bot_ml.evaluate_benchmark`: at least one positive outcome signal,
   no fallback/safety regression, and no deterministic scenario regressions.
5. Run a human playtest on the canary build and review shadow disagreement,
   latency and action distribution metrics.

The approved candidate for the next canary is
`artifacts/bot_ml/recurrent-ppo-lstm-dagger-v2.json`. It reaches 100% agreement
with the expert labels on the combined DAgger dataset and passes the paired
40-episode matrix holdout: accuracy +0.03125, attack hits +0.125, damage
+7.5, action switches -1.0, with no fallback, death or stuck regression.
The earlier matrix, first DAgger and online-PPO checkpoints remain rejected and
must not be promoted.

Automated enablement is therefore approved only for a canary/shadow review;
full active rollout still requires the human playtest gate below.

The Go replay audit is available through `cmd/bot-ml-replay`; it verifies that
the exported Go matrices reproduce the Python-labelled JSONL sequence before
any gameplay result is trusted.

## Rollback

Set `BOT_ML_MODE=disabled`, restart/recycle battle rooms, and verify:

- `battle_bot_ml_shadow_decisions_total` stops increasing;
- `battle_bot_ml_shadow_fallbacks_total` remains zero for the disabled path;
- standard utility action and combat metrics continue to be emitted.

Do not delete the checkpoint or overwrite the previous artifact during a
rollback. Restore the previous model only after its schema/profile guard
passes and rerun the paired holdout report.
