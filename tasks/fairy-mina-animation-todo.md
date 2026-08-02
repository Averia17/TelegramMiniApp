# Fairy Mina animation rework checklist

- [x] Run the Stage-0 rig/axis/current-pose/skinning diagnostic.
- [x] Record measured facts and Needle postmortem rules in the Mina plan.
- [ ] Author and visually approve neutral/Idle in the exact frontend harness.
- [ ] Author the remaining eleven deterministic focused scenes.
- [ ] Run numeric frame validation and cycle/root-motion checks.
- [ ] Add Mina-specific `AimGadget` to manifest, exporter, and runtime map.
- [ ] Export and finalize the canonical Fairy Mina GLB.
- [ ] Run exact-harness screenshot QA and all twelve clip transitions.
- [ ] Run frontend tests, hero validation, lint, and build.
- [ ] Record any unrelated repository failures or visual limitations.

## Diagnostic notes

- Armature: `fairy-mina-rig`, 77 bones.
- Character roots: `hips_s` and separate `waterball_s`; use `hips_s` for root motion.
- `hips_s` local Y maps to Blender world Z/up; local X/Z are locked.
- Seven visible meshes use weighted Armature modifiers; no Needle-style rigid
  parenting repair is appropriate for this hero.
- Master current pose contains non-zero legacy rotations; authoring must reset
  all pose channels before keying frame 0.
