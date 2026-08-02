# Needle animation rework plan

## Goal

Re-author Needle's animation source as twelve deterministic, reviewable Blender
scenes and publish one canonical `needle_base.glb` for the Three.js runtime.

## Decisions from the audit

- Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- Stage 0 axis diagnostic is recorded in
  `artifacts/needle-rig-axis-diagnostic.json`. `NeedleRig` maps Root local X
  to world X, Root local Y to Blender world Z/up, and Root local Z to world
  depth; therefore root-up motion is authored on `Root.location.y`, while
  horizontal/depth channels remain locked.
- The live rig is `NeedleRig` with 14 bones: `Root`, `Hips`, `LeftLeg`,
  `LeftFoot`, `RightLeg`, `RightFoot`, `Spine`, `Chest`, `Head`, `Flower`,
  `LeftArm`, `LeftHand`, `RightArm`, `RightHand`.
- Blender uses Z-up for authoring; GLB export keeps `export_yup=True`.
- The user-facing twelve-clip set is the current ten event clips plus
  `gadget` and Needle-specific `aim-gadget`. The global contract remains
  backward compatible for the other seven heroes.
- The source of truth is `needle.blend` plus focused scenes under
  `frontend/assets-source/heroes/needle/scenes/`. The authoring script may
  repair and persist rig skinning in `needle.blend`; scenes are regenerated
  from that repaired master.

## Execution slices

1. Run the Stage-0 axis diagnostic and store the rig contract before any
   animation authoring.
2. Add a Needle-specific authoring script with explicit v3 key poses, 30 fps,
   Bezier/auto-clamped curves, cycle closure, and scene metadata.
3. Generate the twelve focused `.blend` scenes and a JSON authoring report.
4. Add a Blender validation script for clip names, frame ranges, finite poses,
   root X/Y drift, approximate joint limits, and cycle closure.
5. Extend the exporter for `AimGadget` only when `HERO_FILTER=needle`, then
   export `frontend/public/assets/heroes/output_heroes/needle_base.glb`.
6. Update the catalog/manifest validation and runtime clip map so the extra
   Needle clip is discoverable without changing other heroes.
7. Run Blender audits, GLB structural validation, frontend tests, lint, and
   build; record any visual QA limitations explicitly.

## Lessons to carry into the next hero

1. Audit the real rig before authoring: record the actual bones, parent
   hierarchy, local axes, bind pose, rest rotations, and Blender-to-GLB axis
   mapping. Do not assume a standard humanoid rig from the prose spec.
2. Establish and validate a neutral baseline before generating any Action.
   Shared offsets such as a non-zero `Hips` rotation are copied into every
   clip and create a permanent lean.
3. Audit visible geometry and skinning separately from bone animation. A bone
   can move while the visible mesh stays frozen or deforms through the torso.
   For separate hard-surface/organic pieces, prefer rigid bone parenting with
   the original world transform preserved; use vertex weighting only for
   continuous deforming skin.
4. Convert the prose poses into rig-space using measured world-space targets.
   Do not copy Euler angles literally when the rig has mirrored or non-human
   local axes; calibrate arm and hand poses against actual bone positions.
5. Validate one Idle clip visually before authoring the remaining clips. The
   neutral pose, camera orientation, and skinning must be correct first.
6. Require two QA layers for every hero: numeric Blender/GLB validation and
   screenshot checks in the exact frontend harness at key frames. Numeric
   Action presence alone does not prove readable animation or absence of
   torso penetration.
7. After export, verify the actual runtime file path, size/timestamp or hash,
   and animation list. On Windows, a locked canonical GLB can leave the new
   export in a temporary file, so the finalize/copy step must be explicit.

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

## Needle v2 postmortem — rules to copy into the next hero plan

1. Make the shared entry pose a real neutral pose, not the most expressive
   pose from the brief. Needle v2 initially put `Hips + Spine + Chest` forward
   pitch into the first frame of every clip; cross-fades then made the hero
   look permanently tilted even though the individual Actions were valid.
2. Budget the *sum* of torso rotations, not just each bone independently.
   On this rig, seemingly reasonable local X values accumulated into a
   visually excessive lean. Keep the entry/idle torso near vertical and place
   the aggressive pitch in deliberate attack, run, super, or death beats.
3. Treat the real harness screenshot as a release gate. A 12/12 Action and
   root-motion report can still hide a bad silhouette; inspect idle plus at
   least one attack, super, and aim pose at the exact frontend URL
   (`hero=Shadow`).
4. Check the source blend's current pose as well as the Action curves. Needle's
   master contained an old non-zero Hips pose, so the authoring script must
   reset/key the neutral pose before saving every generated scene.
5. Record whether each visible mesh is truly skinned. Needle's large arm and
   palm pieces were separate rigid meshes, so rigid bone parenting with the
   original world matrix was safer than applying one whole-object Armature
   modifier and prevented torso penetration.
6. Test the final published file after the exporter exits. If Windows leaves
   `.needle_base.tmp.glb`, restart the local file holder only as needed, copy
   the verified temp file to the canonical path, and rerun the browser check.

## Needle v3 implementation note

- The v3 brief was authored against a 16-bone humanoid naming scheme, but the
  measured NeedleRig has 14 bones and no `Neck`, `LeftForearm`, or
  `RightForearm`. The authoring adapter folds Neck pitch into `Head`, combines
  each forearm value with its available `LeftHand`/`RightHand` X rotation, and
  keeps finger motion as a hand-level accent.
- Run v3 now uses `Hips=5° + Spine=8°` (13° total torso pitch); the legs create
  the crouched stride and Root Up stays at `0…-0.02 m`. This is the corrected
  interpretation of the previous lying/forward-fall Run.
- The v3 adapter is implemented in `v3_pose` and the twelve `v3_*_poses`
  builders in `tools/blender/author_needle_animation_scenes.py`; the exported
  GLB was checked in the exact localhost harness after publication.

## Full session postmortem — problem → cause → solution → rule

| Problem observed | Root cause | Solution applied | Rule for the next hero |
| --- | --- | --- | --- |
| The first request described 11 clips, while the runtime needed 12 | `aim-gadget` was missing from the initial count | Made `aim-gadget` a Needle-only extra and kept the global contract unchanged for other heroes | Reconcile the clip manifest, backend states, and frontend buttons before authoring keys |
| The hero leaned in every animation | A legacy `Hips` rotation of 26° and other shared baseline rotations were copied into every Action | Audited the master pose, set the neutral baseline to zero, and keyed a neutral entry pose | Never copy a source file's current pose blindly; reset and inspect frame 0 before generating Actions |
| The hero was still visually leaning after the first v2 correction | `Hips + Spine + Chest` were treated as independent angles; their hierarchical pitch accumulated to an excessive torso fold | Separated neutral entry from expressive beats and reduced the Idle v2 torso amplitude | Set a total torso-pitch budget, not only per-bone limits |
| Run looked like the hero was lying or falling | Run used `Hips=35° + Spine=40°`, plus one-bone leg rotations copied from a humanoid prompt | Rewrote Run in v3 as `Hips=5° + Spine=8°`, with the crouch coming from legs and Root Up limited to `0…-0.02 m` | For locomotion, keep the torso near vertical and use calibrated leg/foot poses for the low stance |
| Prompt angles did not match the implementation | The prose assumed a 16-bone humanoid rig and used anatomical names, while NeedleRig has 14 bones and different local axes | Added a rig-space adapter: `Neck` → `Head`, forearm channels → `LeftHand/RightHand`, finger motion → hand accents | Validate bone names and axes before accepting any pose table as “rig-space” |
| Arms did not follow correctly or penetrated the torso | Large organic arm/palm meshes were separate objects; a whole-object Armature modifier deformed them through the body | Removed that deformation path and rigid-parented each piece to its matching arm/hand bone while preserving world transforms | Audit geometry binding separately from armature animation; choose rigid parenting for separate hard-surface pieces |
| Actions existed numerically but were not visibly convincing | Action names and frame ranges do not prove readable silhouettes, contact, or absence of penetration | Added screenshot review in the exact localhost harness for Idle, Run, Attack, Super, Aim, and AimGadget | Numeric validation and screenshot validation are both release gates |
| Export appeared successful but the frontend still showed the old GLB | Windows/nginx held the canonical file open; Blender left the new file as `.needle_base.tmp.glb` | Restarted the local file holder when necessary, copied the verified temp file to `needle_base.glb`, and reran browser QA | Verify canonical path, file size/timestamp, clip list, and browser response after every export |
| A global frontend validation failed during the Needle pass | The failure was an unrelated existing Mandy attachment-marker assertion | Kept it separate from Needle-scoped validation; Needle browser/runtime checks still passed | Report unrelated repository failures explicitly; do not hide them or attribute them to the active hero |
| The written spec asked for fingers and visual spores | The real rig has no finger bones and VFX are not skeletal channels | Used hand-level pose accents and kept spores/clouds outside the skeleton | Mark unavailable channels as approximations instead of inventing unsupported bones |

### Reproducible order for the next hero

1. Diagnose the actual rig and write a bone/axis/mapping report.
2. Reconcile the clip manifest with runtime names and event states.
3. Create one neutral frame-0 pose and visually approve it in the exact harness.
4. Translate the prose into rig-space with a total torso/Root-motion budget.
5. Author scenes, run numeric validation, export to a temporary GLB, finalize
   the canonical file, and then run the full browser clip sweep.
6. Record any unavailable bones, approximate mappings, locked-file workarounds,
   and unrelated repository failures in the plan before handing off.
