---
name: blender-pipeline
description: |
  Blender asset pipeline for the Telegram Mini App game. Use when working with:
  (1) Exporting hero animations from .blend files to runtime GLB,
  (2) Authoring or modifying skill animation semantics (pose accents),
  (3) Validating animation scenes against contracts,
  (4) Inspecting or refining hero animation intent/readability,
  (5) Any task involving Blender Python scripts in tools/blender/.
  Trigger on mentions of "blend", "glb", "hero animation", "export heroes", "animation scene", "semantic revision", "bpy".
---

# Blender Pipeline — Telegram Mini App Game

## Project Layout

```
tools/blender/                                # bpy scripts, run inside Blender
  hero_animation_contract.py                  # Shared master/action contract
  hero_animation_scene_manifest.json          # Hero and clip manifest
  hero_skill_animation_semantics.json         # Skill semantic contract
  export_runtime_heroes_from_master_blends.py # Canonical GLB exporter
  validate_master_hero_sources.py             # Master source validator
  author_skill_animation_semantics.py         # Action pose accents
  inspect_*.py, refine_*.py, validate_*.py    # Inspection/refinement/QA

frontend/assets-source/heroes/<hero>/
  <hero>.blend                                # One canonical authored source
  textures/                                    # Source textures, when needed
  source/                                      # Imported FBX/archive files

frontend/public/assets/heroes/output_heroes/
  <hero>_base.glb                              # Canonical runtime output
```

The master `.blend` is the only source of authored runtime animation for a
completed hero. It contains the complete mesh/material setup, armature, props
or companion objects, and all Blender Actions. Do not add a new
`scenes/<clip>.blend` file for a completed hero. Zeus may temporarily retain
legacy source files while explicitly on hold.

## Heroes (canonical list)

`brock-zeus`, `fairy-mina`, `kaze`, `mandy`, `needle`, `persephone-lumi`, `wukong-mico`, `katty`

## Standard Clips

| Clip | Action Name | Notes |
|------|-------------|-------|
| idle | idle | Base scene, contains full rig + geometry |
| run | run | |
| attack | Attack | |
| super | super | |
| aim | Aim | |
| aim-super | AimSuper | |
| hit | hit | |
| death | death | |
| spawn | Spawn | |
| victory | Victory | |
| gadget | Gadget | |
| aim-gadget | AimGadget | Optional (needle, mandy, brock-zeus, kaze, fairy-mina) |

The Action names are a runtime API. Keep them stable and unique: `idle`, `run`,
`Attack`, `super`, `Aim`, `AimSuper`, `hit`, `death`, `Spawn`, `Victory`,
`Gadget`, and the optional `AimGadget`. The source manifest also requires clip
metadata (`hero_slug`, `clip_name`, `clip_kind`, `frame_start`, `frame_end`,
`source_layout=master_actions`).

## Visual and animation standard

A hero is ready for the game when the following are true:

- the full-body silhouette, face direction, colors, and primary prop are
  readable at the gameplay camera distance;
- the neutral pose is stable, grounded, centered at the origin, and uses the
  project's consistent scale and axes;
- the rig and mesh names remain stable, while props use explicit named sockets
  and calibrated grip frames;
- attack, Super, and Gadget clips communicate the hero's own ability fantasy
  with a clear anticipation → release → follow-through rhythm;
- idle/run do not drift or slide, and held props do not penetrate, float, or
  snap at attach/release frames;
- the master has no duplicate Actions such as `Attack.001` and no hidden
  dependency on a different source scene.

## Running Blender Scripts

All scripts in `tools/blender/` are designed to run **inside Blender's Python interpreter** (with `bpy` available). They are NOT standalone scripts.

### From CLI (background mode)

```powershell
cd C:\Users\User\PycharmProjects\TelegramMiniApp
blender --background --python tools/blender/export_runtime_heroes_from_master_blends.py
```

### Filter by hero (environment variable)

```bash
$env:HERO_FILTER='kaze'; blender --background --python tools/blender/export_runtime_heroes_from_master_blends.py
```

### Fast export (skip force sampling)

```bash
$env:BLENDER_EXPORT_FAST='1'; blender --background --python tools/blender/export_runtime_heroes_from_master_blends.py
```

## Export Process (`export_runtime_heroes_from_master_blends.py`)

1. Reads `hero_animation_scene_manifest.json` and the shared contract.
2. For each hero, opens only `frontend/assets-source/heroes/<hero>/<hero>.blend`.
3. Validates the armature, canonical Actions, frame ranges, metadata, and
   duplicate-action condition.
4. Exports `<hero>_base.glb` with `export_animation_mode="ACTIONS"`.
5. Special case `brock-zeus`: also exports `brock-zeus_cloud.glb` from the same
   master because the companion is a runtime optimization, not another source.
6. Uses atomic `.tmp.glb` → final replacement to avoid Windows file-lock
   issues.

The exporter is export-only. It must not author keys, import clip scenes, fix
rigs, or silently omit a missing Action. Author changes in the master and save
the master before exporting.

## Animation Semantics (`author_skill_animation_semantics.py`)

This script adds local-space pose accents (anticipation → release → follow-through) to canonical skill Actions without introducing root motion.

- Reads `hero_skill_animation_semantics.json` for frame contracts
- Activates the relevant Action in the hero master and applies bone rotation
  offsets from the `ACCENTS` dictionary
- Adds timeline markers: `anticipation`, `release`, `follow_through`
- Sets scene metadata: `skill_semantic`, `semantic_revision`, `authoring_status`
- Saves the modified master `.blend` in-place

## Validation Workflow

Before committing animation work:

1. Run `blender --background --python tools/blender/validate_master_hero_sources.py`
2. Run `blender --background --python tools/blender/validate_all_skill_intents.py`
3. Run `blender --background --python tools/blender/validate_skill_animation_semantics.py`
4. Run `python tools/validate_hero_catalog.py` (standard Python, no Blender needed)
5. Run `npm run validate:heroes` (frontend GLB validation)
6. Run the browser animation harness for the affected heroes when GLBs change.

## Key Conventions

- **Modify the canonical master** `<hero>/<hero>.blend`; bump semantic revision
  metadata for authored skill changes
- **Never create animation keys in the exporter** — it is export-only
- **Master Actions pattern**: every clip is an Action inside the one master;
  there is no focused scene source for completed heroes
- **Windows file locking**: exporter uses `.tmp.glb` → rename pattern
- **Export context override**: `export_gltf()` uses `bpy.context.temp_override()` for Blender 5.2 compatibility
