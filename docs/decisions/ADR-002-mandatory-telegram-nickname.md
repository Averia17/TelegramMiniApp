# ADR-002: Mandatory Telegram-derived game nickname

Status: Accepted
Date: 2026-08-22

## Context

The game displayed generated identifiers such as `P771197` when an account did not
have a nickname. This made the player identity unclear and allowed empty nicknames
to reach the database.

## Decision

- A new account receives `str(telegram_user_id)` as its initial game nickname.
- Players may replace that nickname through the account API.
- PostgreSQL enforces `nickname IS NOT NULL` and
  `char_length(btrim(nickname)) > 3` for the `users` table.
- Application validation accepts only nicknames from 4 through 20 characters.
- The migration backfills missing or invalid legacy values from the Telegram ID.

## Consequences

Nickname display no longer falls back to a player ID. Existing accounts are made
valid during migration, while customized nicknames remain unchanged.
