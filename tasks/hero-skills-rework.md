# Implementation Plan: Hero Skill Rework

## Overview

Turn every current hero into a coherent three-part combat kit: basic attack,
signature Super, and a limited-use Gadget.  Keep gameplay authoritative on the
Go battle server and drive readable, transient Three.js effects from replicated
battle events.

## Architecture Decisions

- Keep the existing `CombatKit` server boundary and current Q/E input contract.
- Add one frontend skill catalogue as the source for localized names and short
  descriptions; mechanics remain server-authoritative.
- Give every Super and Gadget a named effect family with motion, anticipation,
  impact, and decay instead of relying on a static generic ring.
- Enforce Gadget charges and cooldowns consistently for every hero.
- Preserve the authored `super` animation pulse and layer procedural particles
  around it; effects never alter simulation transforms.

## Vertical Slices

1. Skill contract and tests: catalogue all eight heroes and verify that every
   kit has a Super, Gadget, effect identity, and concise gameplay description.
2. Server activation rules: make Gadget cooldown/charges consistent and emit a
   visible cast effect for every activation.
3. Visual language: render storm, aura, dash, summon, roots, stealth, detonation,
   and empowered-hit effects with eased motion and short-lived particles.
4. HUD integration: show actual names, charge count, cooldown, and descriptions.
5. Verification: Go tests, frontend tests, lint/build, and browser smoke test.

## Risks

- Existing uncommitted combat work overlaps these files: patches stay narrow
  and no existing changes are reverted.
- Effects can become noisy: routine Gadgets use medium feedback; charged Supers
  use large feedback with short peaks and a full return to rest.
- Client/server naming drift: tests require the complete eight-hero catalogue.

