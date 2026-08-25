# Implementation Plan: Hero Master Blend Migration

## Overview

Replace the focused-scene source contract with one master `.blend` per hero containing all Blender Actions, while preserving the existing runtime GLB contract and Brock's companion Cloud output.

## Architecture decisions

- One source master per hero at `frontend/assets-source/heroes/<hero>/<hero>.blend`.
- Migration imports Actions from the current focused scenes into the current complete idle/master scene, then saves the result.
- Old focused scenes are removed after validation for completed heroes; Zeus remains on hold with its legacy sources intact.
- Current execution scope excludes `brock-zeus` at the user's request; Zeus-specific source files and runtime exports remain on hold.
- Export is master-only and remains export-only: no key authoring or source mutation.
- Runtime keeps its current clip names, URLs, and Three.js mixer behavior.
- Brock's Cloud stays in the same source master but may be exported as a separate companion GLB.

## Task list

### Phase 1: Contract and foundation

- [x] Add source-layout, migration, export, and validation specifications.
- [x] Add contract tests for master source discovery and exporter behavior.
- [x] Inspect current scene inventories, Action names, frame ranges, object ownership, and Brock Cloud structure.

### Checkpoint: Foundation

- [x] The old focused-scene exporter is removed and the new master-only contract passes.
- [ ] No unrelated dirty-worktree changes are modified.

### Phase 2: Migration and exporter

- [x] Implement deterministic Blender migration with collision checks, Action import, metadata preservation, backup/archive handling, and idempotent reruns.
- [x] Implement master-only exporter for ordinary heroes and Brock base/Cloud outputs.
- [x] Implement Blender master-source validator.

### Checkpoint: Pipeline

- [x] Master files exist for the seven heroes in the current scope; Zeus remains explicitly on hold.
- [x] Each in-scope master validates before export.
- [x] Exported in-scope GLBs contain the expected clips exactly once.

### Phase 3: Repository integration

- [x] Update manifest, validators, audits, tests, docs, and scripts that assume focused scenes.
- [x] Regenerate in-scope runtime GLBs from masters.
- [x] Remove in-scope focused scenes only after the masters and exports validate.

### Checkpoint: Runtime

- [x] Focused frontend contracts, `npm run validate:heroes`, and in-scope Blender validators pass.
- [x] Hero animation transition and skill browser QA pass for the seven in-scope heroes.
- [ ] Full `npm test`, build, and Zeus validation remain for the follow-up Zeus phase.

### Phase 4: Review and handoff

- [ ] Review changed files for correctness, simplicity, architecture, and dead paths.
- [ ] Report exact files, validation commands, and any remaining manual Blender visual checks.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Action names collide during import | High | Case-insensitive collision validation and deterministic rename rejection |
| Focused scene contains unique rig/prop data | High | Compare object/bone inventories and migrate only Actions into a complete master |
| Brock Cloud is not part of the body source | High | Validate Cloud object and cloud Actions explicitly; export companion from same master |
| Blender GLB output changes | High | Compare clip names, hierarchy, and runtime QA before archiving source scenes |
| Dirty worktree contains user changes | High | Preserve all unrelated modifications and inspect diffs by touched path |
| Legacy source removal makes recovery hard | Medium | Validate masters/GLBs first; keep Zeus legacy sources untouched while on hold |
