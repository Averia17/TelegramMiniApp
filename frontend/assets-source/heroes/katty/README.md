# Katty source asset

This folder stores the local source files used to build Katty's runtime model.

- Reference: [Tricky Janet by pyeerz on Sketchfab](https://sketchfab.com/3d-models/tricky-janet-86283dbe8ca54428a26b6b9033d624a1)
- Source archive: user-provided `tricky-janet.zip`
- Authored Blender source: `katty.blend`
- Reproducible build script: `build_katty_animations.py`
- Runtime export: `frontend/public/assets/heroes/output_heroes/katty_base.glb`
- Animation status: 11 authored 30 fps clips (`idle`, `run`, `Attack`, `super`,
  `Gadget`, `Aim`, `AimSuper`, `hit`, `death`, `Spawn`, `Victory`).
- The source spray-can bones are chest-parented in the donor rig. The build
  script bakes a right-wrist-relative grip into every clip and authors explicit
  release trajectories for `super` and `death`.
