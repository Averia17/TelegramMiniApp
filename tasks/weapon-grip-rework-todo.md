# Canonical Weapon Grip Rework

## Phase 0 — Inventory

- [ ] Hash and archive current source/delivery assets.
- [ ] Capture failure renders for every armed hero.
- [ ] Build the rig capability matrix for all eight heroes.

## Phase 1 — Contract and gates

- [ ] Define per-hero grip manifests.
- [ ] Implement vertex/contact-based Blender validation.
- [ ] Implement Action sampling across all nine states.
- [ ] Implement clean GLB re-import validation.
- [ ] Implement Three.js matrix and close-up render validation.

## Phase 2 — Wukong vertical slice

- [x] Fix staff origin and local axes.
- [x] Add and position non-deforming `weapon_socket_r` at the left palm grip.
- [x] Preserve the authored closed-finger grip and align the staff through it.
- [x] Verify the inherited grip remains locked in all nine Actions.
- [x] Export and validate Blender/GLB/browser results.
- [ ] Obtain human approval of close-ups and animated contact sheet.

## Phase 3 — Armed roster

- [ ] Rework Mandy.
- [ ] Rework Kaze.
- [ ] Rework Persephone Lumi.
- [ ] Rework Damian microphone.
- [ ] Rework Damian throwable speaker and release transform.

## Phase 4 — Other held combat visuals

- [ ] Audit Brock Zeus cloud/spawn markers.
- [ ] Audit Fairy Mina held/released projectile.
- [ ] Audit Shadow/Needle held/released projectile.

## Phase 5 — Production

- [ ] Remove temporary runtime snapping for migrated heroes.
- [ ] Add deterministic batch build.
- [ ] Add CI grip/action/round-trip gates.
- [ ] Rebuild production assets.
- [ ] Verify selection screen and battle for all heroes.
