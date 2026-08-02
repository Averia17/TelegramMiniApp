# Needle animation rework plan

## Goal

Re-author Needle's animation source as twelve deterministic, reviewable Blender
scenes and publish one canonical `needle_base.glb` for the Three.js runtime.

## Decisions from the audit

- Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- The live rig is `NeedleRig` with 14 bones: `Root`, `Hips`, `LeftLeg`,
  `LeftFoot`, `RightLeg`, `RightFoot`, `Spine`, `Chest`, `Head`, `Flower`,
  `LeftArm`, `LeftHand`, `RightArm`, `RightHand`.
- Blender uses Z-up for authoring; GLB export keeps `export_yup=True`.
- The user-facing twelve-clip set is the current ten event clips plus
  `gadget` and Needle-specific `aim-gadget`. The global contract remains
  backward compatible for the other seven heroes.
- The source of truth remains focused scenes under
  `frontend/assets-source/heroes/needle/scenes/`; `needle.blend` is not
  modified by the authoring script.

## Execution slices

1. Add a Needle-specific authoring script with explicit key poses, 30 fps,
   Bezier/auto-clamped curves, cycle closure, and scene metadata.
2. Generate the twelve focused `.blend` scenes and a JSON authoring report.
3. Add a Blender validation script for clip names, frame ranges, finite poses,
   root X/Y drift, approximate joint limits, and cycle closure.
4. Extend the exporter for `AimGadget` only when `HERO_FILTER=needle`, then
   export `frontend/public/assets/heroes/output_heroes/needle_base.glb`.
5. Update the catalog/manifest validation and runtime clip map so the extra
   Needle clip is discoverable without changing other heroes.
6. Run Blender audits, GLB structural validation, frontend tests, lint, and
   build; record any visual QA limitations explicitly.

## Acceptance criteria

- Needle has exactly twelve named focused scenes and twelve exported actions:
  `idle`, `run`, `Attack`, `super`, `Aim`, `AimSuper`, `hit`, `death`,
  `Spawn`, `Victory`, `Gadget`, `AimGadget`.
- Cycles close at the authored end frame and all clips use 30 fps.
- Root motion is zero on the rig's local X/Z (world horizontal/depth) axes;
  the live Needle rig maps local Y to Blender world-up, so only documented
  local-Y motion is allowed on `super`, `death`, `spawn`, and `aim-gadget`.
- `needle_base.glb` contains the model, rig, skinning, and all twelve clips.
- Existing seven-hero assets and the global ten-event contract remain intact.
- Existing frontend tests, `npm run validate:heroes`, lint, and build pass.

## Risks

| Risk | Mitigation |
| --- | --- |
| The real rig has fewer bones than the prose spec | Use only discovered bones and map elbow/hand intent onto the two-bone arm chain. |
| Blender 5.2 layered Action API differs from Blender 4.x | Use pose `keyframe_insert` and a compatibility F-curve iterator. |
| Adding a clip globally breaks other heroes | Model `aim-gadget` as a manifest/catalog extra for `needle` only. |
| Headless rendering cannot prove every silhouette detail | Run numeric frame sweep and produce pose preview renders where Blender permits; mark visual QA separately. |
