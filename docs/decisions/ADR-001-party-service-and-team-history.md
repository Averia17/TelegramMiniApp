# ADR-001: Dedicated party service and team match history

## Status

Accepted

## Context

Team matchmaking needs a durable party identity, invitations, recent teammate
ordering, and a party-level hero validation state. The battle service should
remain authoritative for combat and matchmaking, while the account service
should not own transient party membership.

## Decision

Add a dedicated `party` service. It owns party membership, invitation state,
recent teammate relations, and the party-facing API. It consumes the existing
`battle-results` Kafka topic and groups players by `partyId` to build recent
teammate statistics. Battle results now include both `partyId` and `team` for
each player.

Party invitations are events on the `party-invites` Kafka topic. The party
consumer places each event into a five-minute pending cache and pushes it to
the recipient through the party WebSocket. The client also requests pending
invitations when opening the party UI, so a temporarily disconnected client
can recover missed invitations. Toasts expire after 15 seconds while the
server-side invitation remains available until its five-minute TTL.

Hero uniqueness is checked in the client for immediate feedback and remains a
server-side matchmaking invariant in the existing battle queue. The battle
button is disabled whenever a party member has no hero or two party members
have the same canonical hero name.

Player search resolves the requested ID through the account service before an
invite can be sent. Party state is persisted at `PARTY_STORE_PATH` using an
atomic JSON snapshot; the Docker deployment mounts this at
`/data/party-store.json`.

## Consequences

- `party` can evolve independently from account and battle services.
- Kafka gives party history the same source of truth as leaderboard history.
- The current snapshot store is single-writer and suitable for the current
  deployment; horizontal scaling should move it behind Redis or a database.
- WebSocket delivery is realtime, while the pending endpoint remains the
  recovery path for reconnects and missed notifications.
