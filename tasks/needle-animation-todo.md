# Needle animation rework checklist

- [x] Author the twelve Needle focused scenes from the real 14-bone rig.
- [x] Generate and inspect the authoring report.
- [x] Run biomechanical/frame validation and fix failures.
- [x] Export the canonical Needle GLB with all twelve actions.
- [x] Update Needle-specific animation metadata and runtime mapping.
- [x] Run GLB validation, frontend tests, targeted lint, and build.
- [x] Review visual evidence in the exact localhost harness and repair visible
  arm skinning/pose readability.
- [x] Rework the shared v2 entry pose after screenshot review so the aggressive
  torso pitch is not mistaken for a global rig tilt.
- [x] Replace the v2 pose tables with the v3 rig-space adaptation and verify
  the corrected Run silhouette in the browser.
- [x] Record the complete session postmortem in the plan for reuse on the next
  hero.

## Verification notes

- Blender numeric validation: 12/12 clips passed at 30 fps, including the
  live rig's local-Y world-up correction.
- Master rig repair: the visible organic arms and wooden palms are separate
  rigid meshes, so they now follow their matching arm/hand bones through rigid
  bone parenting with their original world transforms preserved.
- Browser harness on `http://localhost/test/glb-hero-harness.html`: 12/12
  clips passed with zero console/page errors.
- Visual smoke screenshots were captured for idle, aim, attack, super,
  aim-gadget, and victory after finalizing the rebuilt GLB.
- Second visual pass moved the right hand out of the torso silhouette for
  Attack/Aim and spread both Victory arms upward in the actual Needle rig
  space; final Victory evidence is in `output/playwright/needle-victory-final2.png`.
- Removed the accidental global `Hips` X rotation (`26°`) from the shared
  baseline; this was the cause of the persistent lean visible in every clip.
- Replaced whole-object armature deformation with rigid bone parenting for the
  separate organic arm/palm meshes, preserving bind-pose placement and
  eliminating left-arm penetration into the torso.
- Full frontend suite: 182 passed, 3 skipped, 0 failed.
- Full repository lint still reports three pre-existing issues outside this
  change; the changed runtime files pass ESLint with zero warnings.

## v2 visual-review notes

- The first v2 pass used an expressive torso lean as the shared entry pose;
  this made every cross-fade look globally tilted. The entry pose is now near
  vertical, while the lean is reserved for intentional motion beats.
- A screenshot gate is mandatory after numeric validation: inspect the exact
  `hero=Shadow` harness, not only the Blender reports or the animation list.
- The real rig's measured axes and the visible mesh parenting must be recorded
  before writing the next hero's pose tables.

- Current global `npm run validate:heroes` still reports an unrelated Mandy
  `MandyStaff_Attachment` grip-marker assertion; Needle-scoped Blender,
  browser, and runtime-contract checks pass independently.

## v3 implementation notes

- The brief names three bones absent from the real 14-bone NeedleRig
  (`Neck`, `LeftForearm`, `RightForearm`); the authoring adapter folds those
  channels into `Head`, `LeftHand`, and `RightHand`.
- v3 Run visual QA: `Hips=5° + Spine=8°`, Root Up `0…-0.02 m`; the fresh browser
  screenshot shows an upright crouched run instead of a lying pose.
