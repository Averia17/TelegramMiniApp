---
name: hero-3d-animation
description: >
  Build, animate, attach props to, export, and validate stylized game heroes
  for the Telegram Mini App web runtime. Use when working on Blender scenes,
  hero rigs, hand-held props, animation clips, GLB export, or Three.js runtime
  validation. Prefer the project's scripted Blender pipeline over interactive
  Blender MCP operations for repeatable work.
metadata:
  short-description: Author web-ready heroes and animations
---

# Hero 3D animation pipeline

Use this skill for the complete path from a source hero asset to a reliable
Three.js GLB. The runtime asset is the result; one master `.blend` per hero and
the authoring scripts remain the source of truth.

## Project conventions

- Blender scripts live in `tools/blender/` and run inside Blender's Python
  interpreter (`bpy`), including background mode.
- The canonical source for a completed hero is
  `frontend/assets-source/heroes/<hero>/<hero>.blend`.
- Runtime GLB files live in
  `frontend/public/assets/heroes/output_heroes/`.
- The shared source/action contract is
  `tools/blender/hero_animation_contract.py` and
  `tools/blender/hero_animation_scene_manifest.json`.
- The canonical export script is
  `tools/blender/export_runtime_heroes_from_master_blends.py`.
- Katty's reproducible build helper is kept at
  `frontend/assets-source/heroes/katty/build_katty_animations.py`, but its
  output is saved into `katty.blend` and is not a second source scene.
- Three.js loads GLB assets with `GLTFLoader` and plays clips with one
  `AnimationMixer` per animated root.

## Hero appearance and source contract

A finished hero must be a readable, self-contained game asset rather than a
collection of disconnected animation files:

- full body mesh, materials/textures, armature, and any authored prop or
  companion object are present in the master file;
- the silhouette, primary color accents, face/head direction, and held prop
  remain readable at the game's normal camera distance;
- the character stands in a stable neutral/reference pose, with feet and the
  root aligned to the ground and the root at the origin;
- scale, forward/up axes, bone names, mesh names, and attachment sockets stay
  stable after runtime code starts depending on them;
- animation is character-specific: attacks show the hero's weapon, body
  language, and ability fantasy instead of a generic full-body gesture;
- no editor cameras, lights, temporary IK targets, debug meshes, or diagnostic
  objects are part of the exported runtime asset.

The master contains the geometry and all authored Blender Actions for the
hero. The manifest is the authority for the hero list and optional clips. The
canonical Action names are:

```text
idle -> idle       run -> run          attack -> Attack
super -> super     aim -> Aim          aim-super -> AimSuper
hit -> hit         death -> death      spawn -> Spawn
victory -> Victory gadget -> Gadget
```

`AimGadget` is optional and exists only for the heroes listed in
`hero_animation_scene_manifest.json`. Katty's current contract has the
standard 11 Actions and no `AimGadget`. Every Action must exist exactly once,
be self-contained, and carry the frame metadata required by the validator:
`hero_slug`, `clip_name`, `clip_kind`, `frame_start`, `frame_end`, and
`source_layout=master_actions`.

## Where files live

```text
frontend/assets-source/heroes/<hero>/
  <hero>.blend              # one canonical authored source
  textures/                 # source textures used by the master
  source/                   # imported FBX/archive files, when retained

tools/blender/
  hero_animation_contract.py
  hero_animation_scene_manifest.json
  hero_skill_animation_semantics.json
  export_runtime_heroes_from_master_blends.py
  validate_master_hero_sources.py

frontend/public/assets/heroes/output_heroes/
  <hero>_base.glb           # canonical runtime export
```

Do not create a new focused animation `.blend` for a completed hero. Open the
master, author or edit the relevant Action there, save the master, and export
the canonical GLB. Brock Zeus may temporarily retain legacy source material
while it is explicitly on hold; this exception must not spread to other heroes.

## Operating mode for the agent

Prefer this loop:

1. Inspect the repository, source scene, rig hierarchy, mesh names, vertex
   groups, modifiers, actions, and existing contracts.
2. Generate a machine-readable inspection report and multi-view diagnostic
   renders before changing animation logic. The report should include bone
   names/parents, object names, armature modifiers, relevant vertex groups,
   local/world transforms, bounds, frame ranges, and clip names.
3. Make deterministic changes in a Blender Python script. Do not rely on the
   current selection, active mode, viewport, or hidden interactive state.
4. Run the script in Blender background mode when the executable is available.
   If it is not available, do not claim that Blender validation or export ran;
   use MCP only for the smallest necessary visual inspection and report the
   limitation.
5. Export GLB, inspect the exported hierarchy and clips, and validate the
   asset in the browser/Three.js runtime.
6. Keep temporary diagnostics out of production asset folders unless they are
   explicitly part of the toolchain.

Do not ask the user to manually repeat the same Blender alignment for every
clip. Calibrate reusable asset semantics once per hero/prop and store them in
the source scene or a project-side profile.

## Hero authoring rules

- Keep one master scene with the complete rig, geometry, props, and all
  Actions. Use Actions—not focused `.blend` files—as the unit of animation
  authoring and export.
- Use metres, a clean root at the origin, consistent forward/up axes, and
  stable bone names. Do not rename bones or mesh nodes casually after runtime
  code depends on them.
- Separate authored animation from procedural runtime effects. Blender owns
  character pose, prop attachment, and baked clip motion; Three.js owns clip
  selection, cross-fades, timing, and game effects.
- Never put animation keys into an export-only script. Author keys in the
  scene-builder/refinement script, then let the exporter only package the
  result.
- Give every meaningful clip a stable name and a frame contract. For skills,
  preserve readable anticipation, release, and follow-through phases.
- Use semantic revision metadata when changing a source rig or skill intent.

## Hand-held props and grip semantics

Do not infer a grip from the prop bounding-box center or a guessed offset. A
mesh does not encode which surface is meant to be held. Use an explicit
attachment contract:

```text
R_hand_socket       calibrated attachment frame on/in the palm
bottle_grip         calibrated grip point/frame on the prop
prop root/bone      driven by the hand socket while held
hand IK target      aligned to the prop grip while the prop is held
finger profile      reusable curl/pose for this prop type
release frame       event at which the prop becomes world-driven
```

For a new hero/prop pair, the calibration process should:

1. Identify the wrist, finger chains, prop object/bone, armature modifier, and
   vertex groups from the actual file.
2. Build a palm coordinate frame from the wrist and finger-base bones.
3. Determine or author a prop grip frame using geometry inspection and a
   multi-view render. Save the calibrated local transform; do not replace it
   with world-space coordinates in each animation.
4. Align the prop to `R_hand_socket`, solve the arm toward `bottle_grip` with
   IK, and pose the fingers using the named finger profile.
5. While attached, drive the prop through the socket. At release, bake the
   current world transform, detach it from the hand, and author its free
   trajectory.
6. Sample the result across the clip and report fingertip-to-prop distances,
   penetration, drift, and discontinuity at attach/release.

If a skinned prop is moved, determine whether its mesh object transform and
its prop bone both affect the final position. Moving both can double-transform
the prop. Preserve the mesh/object transform when possible and move the
correct driver (bone, socket, or constraint) exactly once.

For Katty specifically, treat `botte_GEO`, `bottle_s`, `bottle_valve_01_s`,
and `R_wrist_s` as implementation details to inspect, not as proof that the
grip is correct. The previous chest-parented donor rig requires an explicit
right-hand socket and grip profile. Hard-coded values such as
`wrist.head_local + offset` or world-space release positions are allowed only
as temporary calibration inputs, never as the general attachment model.

## Animation authoring

- Inspect the actual master first: armature hierarchy, mesh/prop objects,
  attachment bones, existing Actions, frame ranges, and semantic metadata.
- Author in the master with Blender or a deterministic `bpy` script. Never put
  animation keys into the exporter.
- Before each clip, reset the pose deterministically. Apply the reusable
  hand/finger profile, authored body pose, IK targets, and prop drivers in that
  order; then key all required driver bones.
- Key enough state to make the Action self-contained. A clip must not depend on
  the previous Action or on whatever pose happened to be active when Blender
  opened the file.
- Give skill clips readable anticipation, release, and follow-through phases.
  Store markers and semantic metadata in the Action (and scene when the
  authoring helper requires it), using
  `tools/blender/hero_skill_animation_semantics.json` as the semantic contract.
- Preserve gameplay movement as runtime-controlled root motion unless the
  existing runtime contract explicitly requires baked root motion.
- For release animations, explicitly key the held state before release and the
  detached state after release. Avoid a discontinuous teleport unless it is an
  intentional game effect.
- Use baked constraints/IK for export if the runtime contract expects bone
  animation and the exporter cannot safely preserve the live constraint.
- Prefer local-space offsets relative to named bones/sockets over global
  coordinates.

## Export and Three.js contract

The GLB should contain a clean root, the expected skinned meshes, stable node
names, PBR materials/textures, and the complete list of animation clips. Do not
export editor cameras, lights, temporary IK targets, or diagnostic objects.

At runtime:

- load with `GLTFLoader`;
- create one `AnimationMixer` per animated root;
- create actions from the exported clip names;
- call `mixer.update(deltaSeconds)` every frame;
- cross-fade actions rather than abruptly replacing them when appropriate;
- use named nodes only after inspecting the exported hierarchy;
- use a separate mixer/root for a companion prop only when the asset contract
  requires it.

The exporter is packaging-only: it reads the master, validates the required
Actions, exports with `export_animation_mode="ACTIONS"`, and atomically writes
`<hero>_base.tmp.glb` before replacing `<hero>_base.glb`. It must not create
keys, repair poses, import another hero scene, or silently fall back to a
missing Action.

The standard export command is:

```powershell
blender --background --python tools/blender/export_runtime_heroes_from_master_blends.py
```

Use `HERO_FILTER=<hero>` for a focused export and remove/check any temporary
`.tmp.glb` before handing off the asset. Zeus's cloud companion is a deliberate
runtime exception exported from the same source master.

## Validation checklist

Before considering a hero complete:

1. Run the relevant Blender validators and the hero catalog validator.
2. Run `npm run validate:heroes` from `frontend`.
3. Confirm the master exists at the canonical path, every expected Action
   exists exactly once, and every clip has the intended frame range and
   metadata.
4. Inspect the GLB hierarchy, armature, skinning, materials, scale, origin,
   and animation names.
5. Check idle and locomotion for drift and foot/prop sliding.
6. Check every held-prop clip at contact, anticipation, release, and
   follow-through frames.
7. Load and play the GLB in the Three.js/browser runtime and check for console
   errors, invisible materials, bad scale, broken cross-fades, or animation
   mixer mistakes.

For a source-only change, also run the master validator directly:

```powershell
blender --background --python tools/blender/validate_master_hero_sources.py
```

When a visual result is wrong, stop adding animation polish. Reproduce the
problem, localize it to rig/attachment/authoring/export/runtime, fix the root
cause, and add a regression check for that failure mode.
