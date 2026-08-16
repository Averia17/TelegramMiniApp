---
name: tgminiapp-dev
description: |
  Telegram Mini App game development — full-stack context for the Brawl-Stars-like web game.
  Use when:
  (1) Working on the React + Three.js frontend,
  (2) Modifying Go backend services (battle, account, shop, leaderboard),
  (3) Understanding the hero catalog or game balance data,
  (4) Docker-compose local development,
  (5) Any task spanning multiple project modules or needing architecture context.
  Trigger on mentions of "telegram mini app", "frontend", "backend", "hero", "battle", "game", "docker", "vite", "three.js".
---

# Telegram Mini App Game — Development Context

## Architecture Overview

```
TelegramMiniApp/
├── frontend/           # React 18 + Vite + Three.js (web game client)
├── battle/             # Go — battle simulation engine
├── account/            # Go — user accounts, auth
├── shop/               # Go — in-game economy
├── leaderboard/        # Go — rankings
├── bot/                # Go — Telegram bot
├── nginx/              # Reverse proxy config
├── docs/               # hero-catalog.json, architecture docs
├── tools/              # Blender pipeline, QA runners, validators
├── tests/              # Integration tests
└── docker-compose.yml  # Local orchestration
```

## Frontend (`frontend/`)

- **Stack**: React 18, Vite, Three.js (r180), SCSS, axios
- **Entry**: `src/main.jsx` → `src/App.jsx`
- **Dev**: `npm run dev` (port 5173 by default)
- **Build**: `npm run build` → `dist/`
- **Tests**: Node built-in test runner (`node --test`), not jest/vitest
- **Validation**: `npm run validate:heroes` (GLB check), `npm run validate:hero-catalog` (Python)

### Key Directories

| Path | Contents |
|------|----------|
| `src/pages/` | Route-level page components |
| `src/components/` | Reusable React components |
| `src/scss/` | Stylesheets |
| `src/utils/` | Helper utilities |
| `public/assets/` | Static assets (GLB heroes, textures, audio) |
| `assets-source/` | Source files for asset pipeline |
| `test/` | Frontend contract/unit tests |

## Backend Services (Go)

| Service | Path | Responsibility |
|---------|------|----------------|
| battle | `battle/` | Game simulation, attack mechanics, hero stats |
| account | `account/` | Telegram auth, user profiles |
| shop | `shop/` | Items, currencies, transactions |
| leaderboard | `leaderboard/` | Trophy rankings |
| bot | `bot/` | Telegram Mini App integration |

## Data Contracts

- `docs/hero-catalog.json` — Single source of truth for hero identity, balance, abilities, animations, assets
- `tools/blender/hero_animation_scene_manifest.json` — Blender pipeline manifest
- `tools/blender/hero_skill_animation_semantics.json` — Animation semantic contracts
- `battle/model/game/heroes.go` — Go source of hero stats (must sync with catalog)
- `battle/model/game/attack_config.go` — Go attack configurations (must sync with catalog)

## Hero Asset Status Values

| Status | Meaning |
|--------|---------|
| `source_master` | Has source .blend, not yet exported |
| `procedural_runtime` | No custom animation, uses procedural |
| `runtime_ready_static` | Static mesh, no animation needed |
| `runtime_ready` | Fully exported GLB with all clips |

## Docker Development

```bash
# Start all services
docker-compose up

# Production-like build
docker-compose -f docker-compose.prod.yml up
```

## Common Commands

```bash
# Frontend dev
cd frontend && npm run dev

# Validate hero catalog (cross-reference Go + JSON)
python tools/validate_hero_catalog.py

# Export heroes from Blender
blender --background --python tools/blender/export_runtime_heroes_from_scenes.py

# Run a browser QA test
node tools/qa/hero-select-card-browser-qa.cjs

# Frontend unit tests
cd frontend && npm test
```

## Testing Strategy

1. **Unit tests**: `frontend/test/*.test.js` — component contracts, logic validation
2. **Browser QA**: `tools/qa/*-browser-qa.cjs` — Visual rendering, layout, animation
3. **Catalog validation**: `tools/validate_hero_catalog.py` — Data consistency across Go/JSON
4. **Blender validation**: `tools/blender/validate_*.py` — Animation scene correctness

## Tech Constraints

- **Telegram Mini App**: Must work within Telegram's WebView (mobile + desktop)
- **WebGL**: Three.js renderer, target 60fps on mid-range mobile
- **Asset size**: GLB heroes must be optimized for mobile download
- **Auth**: Telegram WebApp initData → JWT token flow
