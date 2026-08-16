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
tools/blender/                          # Python scripts (run inside Blender)
  export_runtime_heroes_from_scenes.py  # Main GLB exporter
  author_skill_animation_semantics.py   # Adds pose accents to skill scenes
  hero_animation_scene_manifest.json    # Hero → scene clip manifest
  hero_skill_animation_semantics.json   # Semantic contract per hero/clip
  inspect_skill_animation_scenes.py     # Scene inspector
  refine_*.py, validate_*.py            # Refinement and validation scripts

frontend/assets-source/heroes/<hero>/   # Source .blend files per hero
  scenes/
    idle.blend, attack.blend, super.blend, gadget.blend, ...

frontend/public/assets/heroes/output_heroes/  # Runtime GLB output
```

## Heroes (canonical list)

`brock-zeus`, `fairy-mina`, `kaze`, `mandy`, `needle`, `persephone-lumi`, `wukong-mico`

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

## Running Blender Scripts

All scripts in `tools/blender/` are designed to run **inside Blender's Python interpreter** (with `bpy` available). They are NOT standalone scripts.

### From CLI (background mode)

```bash
cd C:\Users\User\PycharmProjects\TelegramMiniApp
blender --background --python tools/blender/export_runtime_heroes_from_scenes.py
```

### Filter by hero (environment variable)

```bash
set HERO_FILTER=kaze && blender --background --python tools/blender/export_runtime_heroes_from_scenes.py
```

### Fast export (skip force sampling)

```bash
set BLENDER_EXPORT_FAST=1 && blender --background --python tools/blender/export_runtime_heroes_from_scenes.py
```

## Export Process (`export_runtime_heroes_from_scenes.py`)

1. Reads `hero_animation_scene_manifest.json` for ordering validation
2. For each hero:
   - Opens `idle.blend` as the base (contains armature + geometry)
   - Imports Actions from other scene .blend files via `bpy.data.libraries.load`
   - Exports `{hero}_base.glb` with `export_animation_mode="ACTIONS"`
3. Special case `brock-zeus`: also exports `brock-zeus_cloud.glb` (companion mesh with NLA tracks)
4. Uses atomic temp-file + rename pattern to avoid Windows file-lock issues

## Animation Semantics (`author_skill_animation_semantics.py`)

This script adds local-space pose accents (anticipation → release → follow-through) to skill scenes without introducing root motion.

- Reads `hero_skill_animation_semantics.json` for frame contracts
- Applies bone rotation offsets from the `ACCENTS` dictionary
- Adds timeline markers: `anticipation`, `release`, `follow_through`
- Sets scene metadata: `skill_semantic`, `semantic_revision`, `authoring_status`
- Saves the modified .blend in-place

## Validation Workflow

Before committing animation work:

1. Run `blender --background --python tools/blender/validate_all_skill_intents.py`
2. Run `blender --background --python tools/blender/validate_skill_animation_semantics.py`
3. Run `python tools/validate_hero_catalog.py` (standard Python, no Blender needed)
4. Run `npm run validate:heroes` (frontend GLB validation)

## Key Conventions

- **Never modify source .blend files directly** without a semantic revision bump
- **Never create animation keys in the exporter** — it is export-only
- **Focused scenes pattern**: each clip has its own .blend, idle is the master geometry source
- **Windows file locking**: exporter uses `.tmp.glb` → rename pattern
- **Export context override**: `export_gltf()` uses `bpy.context.temp_override()` for Blender 5.2 compatibility
