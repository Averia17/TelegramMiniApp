# Implementation Plan: Canonical Weapon Grip Rework

## Goal

Rebuild the armed-character pipeline so a weapon is authored as part of the
character rig, the palm and fingers form a believable grip, and the result
survives every animation and the GLB round-trip. Runtime proximity corrections
are not accepted as a source of truth.

## Definition of “holds a weapon”

- The weapon grip axis passes through the palm at the authored contact point.
- The wrist orientation follows the handle, without a visible gap or broken bend.
- Available finger bones wrap around the handle; mitten-style hands use a
  character-specific closed-hand pose or mesh corrective.
- The weapon is rigidly driven by a dedicated socket under the correct hand.
- Grip drift remains within 1 cm and 5 degrees across every sampled animation.
- A two-handed weapon has a primary parent hand and a baked secondary-hand grip.
- The Blender source, exported GLB, selection preview, and battle render agree.

## Architecture decisions

- Source of truth: `frontend/assets-source/heroes/<hero>/<hero>.blend`.
- Keep the skeleton bind/rest pose neutral. Build non-destructive grip overlays
  and bake them into delivery Actions.
- Add canonical bones:
  - `weapon_socket_r` under the right hand when used;
  - `weapon_socket_l` under the left hand when used;
  - optional `weapon_grip_secondary` marker for two-handed equipment.
- The socket matrix is authored from the handle coordinate frame: origin at the
  contact center, local forward along the handle, consistent up axis.
- The held weapon is parented to the socket in Blender with identity local
  transform. The engine must not guess offsets from bounding boxes.
- Finger curl, wrist correction, and optional arm IK are built as reusable
  overlays, then baked into each exported Action.
- Throwable equipment has separate held and projectile contracts. Its held copy
  follows the hand socket; the projectile copy begins from the sampled release
  transform.

## Phase 0: Freeze and inventory

### Task 0.1 — Preserve current evidence

Save screenshots, current GLBs, validation JSON, and hashes without overwriting
the original `.blend` sources.

**Acceptance criteria**

- Every source and current delivery GLB has a SHA-256 entry.
- The five armed heroes have front, side, and hand-close-up failure renders.
- Runtime snap/offset code is listed and marked temporary.

**Verification**

- Audit report can reproduce the current Wukong/Mandy failures.

### Task 0.2 — Rig capability matrix

For all eight heroes record hand bones, finger bones, handedness, weapon parts,
socket/grip markers, Actions, NLA tracks, constraints, units, and axes.

**Acceptance criteria**

- Each hero is classified as full fingers, partial fingers, or mitten hand.
- Every weapon has a primary hand and an explicit grip point.
- Multi-part/throwable equipment is listed separately.

## Phase 1: Canonical contract and validator

### Task 1.1 — Define the grip manifest

Create one machine-readable manifest per hero containing weapon object, primary
hand, optional secondary hand, handle axis, grip radius, release frame, and
allowed tolerances.

**Acceptance criteria**

- No attachment is inferred from a name at runtime.
- Mandy and Wukong explicitly use their authored left-hand grips.

### Task 1.2 — Build Blender grip validation

Sample bind pose and every Action at fixed frame intervals. Measure socket/grip
translation, rotation, geometry contact, and secondary-hand drift.

**Acceptance criteria**

- Validation fails for the current visibly floating examples.
- It produces close-up renders from front, side, and palm cameras.
- Numeric success cannot be produced by a bounding-box intersection alone.

### Task 1.3 — Build GLB round-trip validation

Export, re-import into a clean Blender scene, and repeat the same measurements.
Load the result through Three.js and compare matrices and screenshots.

**Acceptance criteria**

- Blender and Three.js agree on handedness, axes, scale, and socket matrices.
- Missing Actions, constraints not baked, or renamed grip nodes fail the gate.

## Phase 2: One vertical-slice hero

Use Wukong Mico first: the staff and visible gap make errors easy to detect.

### Task 2.1 — Author the staff coordinate frame

Place the staff origin inside the physical handle, align its local axes, apply
object transforms, and parent it to `weapon_socket_l` with identity local matrix.

### Task 2.2 — Author a believable hand pose

Align wrist and palm to the staff. Curl available fingers around the handle; if
the source lacks usable fingers, create a closed-hand corrective pose/shape.

### Task 2.3 — Integrate all nine Actions

Create a reusable grip overlay, combine it with Idle, Run, Aim, AimSuper,
Attack, Super, Spawn, Victory, and Defeat, then bake delivery Actions.

**Acceptance criteria for Tasks 2.1–2.3**

- Front, side, and palm close-ups show no gap.
- The staff follows the hand through all nine Actions.
- Grip drift stays within tolerance for every sampled frame.
- The GLB passes Blender and browser round-trip checks.
- Selection screen and battle use the same validated asset.

### Checkpoint A — Human approval

Do not batch the remaining heroes until Wukong’s close-up and animated contact
sheet are explicitly approved.

## Phase 3: Armed heroes

Process one hero at a time using the approved Wukong pipeline:

1. Mandy — left-hand staff and closed-hand pose.
2. Kaze — fan grip and correct wrist/fan plane.
3. Persephone Lumi — right-hand weapon.

Each hero must independently pass all nine Actions and round-trip validation
before the next hero begins.

### Checkpoint B — Armed roster

- Five armed heroes pass static, animation, GLB, preview, and battle gates.
- No engine-side proximity snap remains enabled for validated heroes.

## Phase 4: Unarmed/projectile heroes

Audit Brock Zeus, Fairy Mina, and Needle separately. Their held
projectiles, clouds, spores, or generated combat visuals need explicit spawn
markers and release transforms even when they do not use a persistent weapon.

## Phase 5: Pipeline hardening

- Make the Blender build deterministic and idempotent.
- Store source `.blend`, grip manifest, validation report, contact sheet, base
  GLB, and weapon/projectile GLB together.
- Fail CI when grip tolerances, Actions, names, or round-trip checks regress.
- Remove temporary runtime attachment compensation after every migrated hero is
  validated.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---:|---|
| Existing Actions contain bad wrist keys | High | Layer grip correction, inspect curves, bake per Action |
| Missing finger bones | High | Closed-hand corrective or controlled mesh/rig augmentation |
| Rest-pose edits break all animations | High | Keep neutral rest pose; use overlays and constraints |
| Two hands fight over one weapon | High | Weapon follows primary hand; secondary IK is baked |
| Throwables lose release alignment | High | Sample authored release marker and test the first projectile frame |
| GLB drops Blender-only data | High | Bake constraints and verify after clean re-import |
| Numeric checks hide visual errors | High | Mandatory palm close-ups and animated contact sheets |

## Deliverables per hero

- Corrected source `.blend`.
- Grip manifest.
- Nine baked delivery Actions.
- Validated base and weapon/projectile GLBs.
- Blender validation JSON.
- Three.js validation JSON.
- Front/side/palm contact sheet and short animated preview.
