# Combat prediction/reconciliation plan

## Why the first version was unsafe

The client was guessing projectile hits from interpolated snapshots. It had no command
identifier, no server acknowledgement, and no authoritative hit event. A health delta could
therefore be applied twice, attributed to the wrong shot, or missed between snapshots.

## Contract

- Every basic attack gets a client command ID.
- The server emits an accepted/rejected attack event with that ID.
- Immediate attacks emit authoritative hit events with target, actual damage, and projectile
  context when applicable.
- Events are repeated briefly in state snapshots and deduplicated by event ID on the client.
- The client predicts only immediate melee hits. Projectile health is changed by the server hit
  event/state, while projectile visuals continue to interpolate normally.

## Reconciliation rules

1. Prediction is presentation-only; server state remains the source of truth.
2. A rejected command removes its speculative entries immediately and eases the rollback.
3. A confirmed hit removes only the matching command/target prediction.
4. An authoritative HP decrease never blindly consumes every pending local prediction.
5. A target is never predicted dead; death is accepted only from server state.
6. Missing or delayed confirmation expires conservatively and rolls back.

## Verification

- Unit tests cover rejection, confirmation, multiple pending attacks, duplicate events, and
  authoritative HP arriving before/after the event.
- Backend tests cover command IDs and emitted accepted/hit events.
- Frontend tests and build must pass; unrelated dirty-worktree failures are documented.
