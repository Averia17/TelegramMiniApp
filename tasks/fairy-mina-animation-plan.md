# Fairy Mina animation rework plan

## Goal

Re-author Fairy Mina's twelve runtime animations as deterministic, reviewable
Blender scenes from the measured `fairy-mina-rig`, then publish one canonical
`fairy-mina_base.glb` for the Three.js runtime.

## Stage-0 facts and decisions

- Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- The real armature is `fairy-mina-rig` with 77 bones. The prose names are not
  the live rig contract and must not be applied literally.
- The live armature has two unparented bones: `hips_s` and `waterball_s`.
  `hips_s` is the character root; its local Y maps to Blender world Z/up.
  `waterball_s` is a separate prop root and is locked in the character pack.
- Character geometry is seven meshes with Armature modifiers and weighted
  vertex groups. Preserve that deforming-skin path; do not use Needle's rigid
  parenting repair for Mina.
- The source master contains a legacy non-neutral current pose. Every new
  Action starts from an explicit zero pose and keys all live pose channels.
- The twelve clips are `idle`, `run`, `Attack`, `super`, `Aim`, `AimSuper`,
  `hit`, `death`, `Spawn`, `Victory`, `Gadget`, and Mina-specific `AimGadget`.
- Blender authoring is Z-up; GLB export keeps `export_yup=True`.

## Lessons carried from Needle

1. Diagnose the real rig and mesh binding before authoring any pose table.
2. Reconcile scene, manifest, runtime map, and browser buttons before export.
3. Approve a neutral/Idle silhouette in the exact frontend harness before
   generating the other eleven clips.
4. Treat the torso as a total-pitch budget. Mina's authored body pitch stays
   within 15 degrees across the main torso controls, with the largest motion
   coming from arms, wings, legs, and controlled vertical float.
5. Use semantic adapters for Mina's measured bone names and local axes; prose
   `Rot X/Y/Z` values are source intent, not executable values.
6. Require numeric scene/GLB validation plus screenshot checks at key frames.
7. Verify the final canonical path and animation list after Blender exits;
   Windows may leave a `.tmp.glb` when the server holds the old file.

## Authoring contract

- 30 fps; focused scenes use frame 0 as the shared entry pose.
- Cycles close exactly at their authored end frame: `idle` 90, `run` 24,
  `Aim` 60, `AimSuper` 60, `AimGadget` 60.
- `hips_s` local X/Z and `waterball_s` transforms remain locked. Only
  `hips_s` local Y is allowed for documented float/jump beats.
- All bones use Bezier curves with auto-clamped handles; no non-finite pose
  values; no unexplained source Action data is carried into a focused scene.
- Fingers remain open by default and receive small hand-level accents only
  where they improve readability; no unsupported generic bone names are
  invented.

## Execution slices

1. Run Stage-0 audit and save the measured rig report.
2. Add the Mina authoring adapter and author only neutral/Idle first.
3. Validate and screenshot Idle in the exact harness; correct silhouette and
   skinning before expanding the pack.
4. Author the remaining eleven scenes and run numeric frame sweeps.
5. Add Mina's `AimGadget` export/manifest/runtime contract.
6. Export a temporary GLB, finalize the canonical file, and verify its clips.
7. Run targeted browser QA, the Mina clip sweep, frontend tests, lint, build,
   and the repository hero validation; document unrelated pre-existing errors.

## Acceptance criteria

- Fairy Mina has exactly twelve focused scenes and twelve exported actions.
- All clips are 30 fps with the specified frame ranges and valid metadata.
- The five cycles close without pose mismatch.
- Root motion is zero on `hips_s` local X/Z; `hips_s` local Y is the only
  allowed character vertical channel and stays within the authored ±0.15 m
  brief budget.
- `fairy-mina_base.glb` contains the mesh, weighted skinning, and all twelve
  actions, including `AimGadget`.
- The other heroes' global ten-event contract remains unchanged.
- Targeted Mina Blender/browser tests pass; frontend tests and build pass.

## Risks

| Risk | Mitigation |
| --- | --- |
| Generic names/angles do not match 77-bone rig | Keep all poses behind a measured semantic adapter and validate actual bone set. |
| Legacy pose leaks into every Action | Reset every pose channel and key a real neutral frame 0. |
| Weighted skinning tears or penetrates | Keep the existing Armature modifiers; inspect body, wings, hair, and cap at key frames. |
| A plausible Action is visually unreadable | Gate release on exact harness screenshots, not only GLB animation names. |
| Canonical export stays stale on Windows | Check file size/timestamp and finalize `.tmp.glb` only after exporter exits. |
