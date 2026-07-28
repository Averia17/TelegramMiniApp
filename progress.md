Original prompt: Refactor the renderer before migrating heroes and environment to GLB.

Decisions:
- Canvas2D renderer and its runtime switch are removed.
- Battle rendering uses Three.js with a fixed orthographic 2.5D camera.
- Environment assets are modular GLB props; server map geometry remains authoritative.
- HUD stays in React/HTML; aim guides and combat zones stay as ground-space Three.js visuals.

Progress:
- Added Node architecture tests for the renderer boundary, coordinates, manifest, asset caching, animations, and semantic map visuals.
- Removed the Canvas2D renderer, renderer query/localStorage switch, fallback, and all Canvas-only rendering modules.
- Split the Three.js renderer into scene, camera, map, ground, props, bushes, heroes, projectiles, effects, aim, assets, and shared utilities.
- Added a shared GLB AssetRegistry using GLTFLoader and SkeletonUtils cloning.
- Added semantic animation slots and HeroAnimationController.
- Connected the shared registry to battle heroes and HeroSelect previews.
- Connected environment GLBs to semantic map objects with procedural fallbacks, cached skinned clones, repeat/single placement, and stale-load protection.
- Environment manifest entries define `scale`, `rotationOffset`, `placement`, and their world-space `footprint`.
- Map rebuild signatures include the optional visual variant.
- `npm test` passes all 12 architecture tests.
- `npm run build` succeeds.
- Targeted ESLint passes for the new rendering modules.
- Browser gameplay validation passes: one WebGL canvas, map/hero/HUD/bots render, movement and attack input work, and no runtime errors were logged.

TODO:
- Visually approve Needle V9 animation strength in the deterministic browser harness.
- Remove HeroModelFactory only after all hero GLBs are available; it remains the fallback for other heroes.

GLB authoring contract:
- Use a clean root at the ground-contact center, with Y up and the hero facing +Z.
- Export in metres with transforms applied; tune only manifest `scale` and `rotationOffset` in runtime.
- Environment `footprint` is expressed in authoritative 2D world units. `repeat` fills the collider grid; `single` stays centered.
- Needle uses one shared rig and one GLB with `Idle`, `Run`, `Aim`, `Attack`, `Super`, and `Spawn`.
- `Hit` is shader flash plus damage text; `Death` is immediate hide plus a green thorn/plant particle burst, never skeletal clips.

Needle V10 animation pass:
- Diagnosed muted motion by measuring Blender action channel ranges; Aim was loaded but never played by runtime.
- Found mismatched declared/keyed ranges in V9 (Attack 12/14, Spawn 24/27, Super 18/24), which caused glTF endings to be clipped.
- Rebuilt all six actions around readable poses: Idle 1.6 s, Run 0.667 s, Aim 1 s, Attack 0.6 s, Super 0.933 s, Spawn 0.9 s.
- GLBHeroController synchronizes procedural Run bounce to the actual Run clip phase instead of a competing timer.
- Runtime export now includes renderable hero geometry only; excluded preview ground, helper cube, and an unparented duplicate finger exposed by stronger poses.
- Browser QA visually compared multiple phases of Idle/Run/Attack/Super/Spawn with a clean console.
- Historical V10 source was later superseded and removed by the single-source hero folder layout.
- Deterministic harness states are available with `?state=spawn|idle|run|aim|attack|super`.

Needle V11 articulation pass:
- Expanded the rig from 10 to 14 bones with `LeftHand`, `RightHand`, `LeftFoot`, and `RightFoot`.
- Reassigned 33 rigid hand/bracer details per side and 7 foot/toe details per side to the new articulations.
- Added overlapping wrist follow-through to every clip and toe-off/contact phases to Run and Spawn.
- Fixed upper-body masking to prefer actual Spine/Chest bones over similarly named meshes; Aim/Attack/Super now contain hand tracks but no hips/foot tracks.
- Browser QA shows independent foot contacts during Run and wrist whip during Attack while locomotion remains active.
- V11 is retained as the previous source version.

Needle V12 throw and cactus-spawn pass:
- Rebuilt Attack as a readable one-handed overarm throw: ready pose, deep anticipation, torso snap, arm extension, wrist release, follow-through, and recovery.
- Added a short stylized arm/hand stretch at release so the throw survives the distant isometric gameplay camera while Run continues on the lower body.
- Added a separate 75-piece ordinary cactus to the GLB: ribbed trunk, asymmetric branches, flower bud, radial needles, and root stones.
- Spawn first shows only the ordinary cactus, then squashes it into the ground while revealing the fully rigged hero with squash-and-stretch.
- Fixed cactus-only Spawn initialization and Death-to-Spawn restoration in `GLBHeroController`.
- Browser QA verified the cactus-to-hero reveal and Attack phases with no page errors; all 15 tests and the production build pass.
- V12 is retained as the previous source version.

Needle V13 extended Spawn pass:
- Increased the full cactus-to-hero sequence from 0.9 s to 1.45 s and retimed the skeletal Spawn clip to match instead of ending early.
- Holds the clean cactus silhouette longer, starts the hero reveal at 30%, and uses a longer 42%-wide squash transition.
- Increased the ordinary cactus scale from 0.72 to 0.86.
- Expanded the cactus from 75 to 227 detail nodes with staggered areoles, paired micro-needles, arm clusters, and layered crown growth; repeated geometry is linked to limit GLB growth.
- Fixed the lobby/loading preview flash by disabling Spawn when an asynchronously loaded GLB replaces its procedural placeholder.
- Added a regression test for preview loading without Spawn. Browser QA verified four Spawn phases, final Idle restoration, six animation clips, and no application console errors.
- All 16 architecture tests and the production build pass.
- Superseded by the single-source hero folder layout below.

Needle held-projectile attack pass:
- Reused the exact layered round cactus/spore visual for both the hand prop and the flying projectile.
- `GLBHeroController` attaches `HeldNeedleSpore` to the rig's `RightHand` bone, in front of the wooden fingers.
- The cactus follows the hand through anticipation and wind-up, stretches during acceleration, and disappears at the release phase so the network projectile visually continues the throw.
- The held version omits the flight aura and point light; those remain exclusive to the launched projectile.
- Added regression coverage for hand parenting, visibility during the grip, and hiding after release.
- Browser QA inspected grip/release frames with a clean application console; all 17 tests and the production build pass.

Hero asset folder cleanup:
- Hero assets now use one folder per hero in both authoring and runtime trees.
- Needle lives in `assets-source/heroes/needle/` and `public/assets/heroes/needle/`; runtime `Shadow` maps explicitly to the `needle` asset ID.
- Mandy lives in `assets-source/heroes/mandy/` and `public/assets/heroes/mandy/`.
- Each hero keeps one current `.blend`; old Needle V10/V12 files and all `.blend1` backups were removed.

Seven-hero GLB equipment and attack pass:
- Rebuilt Fairy Mina, Brock Zeus, Kaze, Wukong Mico, Damian, and Persephone Lumi from their source FBX files with explicit `HeroAttachment_*` nodes and exported glTF extras.
- Added authoring-unit-independent runtime height normalization; companion clouds and detached/menu-only props no longer distort hero scale. This fixes Damian rendering too small.
- Lobby/card previews now start only while visible and force-release their WebGL context on cleanup, preventing the hero-selection page from exhausting contexts and turning white while switching heroes.
- Fairy Mina hides the baked waterball and uses a distinct held/flying fairy orb with a readable release.
- Brock Zeus keeps a normalized cloud floating beside him; Attack charges it and shows a short local lightning strike before the network lightning projectile continues the attack.
- Kaze keeps the in-hand fan mesh and hides the two detached slash-preview meshes; her Attack uses a crossed two-arm melee swing.
- Wukong Mico exports the staff as a named held attachment and uses a two-handed body/arm slam.
- Damian exports microphone and speaker independently, hides the lobby speaker variant, releases the carried speaker only during the throw window, and uses a speaker-shaped projectile.
- Persephone Lumi keeps only the gameplay weapon variant and uses a full two-arm melee swing.
- Browser QA visually inspected release frames and attachment visibility for all six rebuilt heroes; no browser console errors remained after the fixes.
- Final verification: all 22 frontend tests pass, the production Vite build succeeds, and targeted ESLint for every touched runtime module is clean. The repository-wide lint still reports older indentation/unused-variable issues in BattleGame.jsx, GameClient.js, Input.js, StoreTab.jsx, and landing-page.jsx.

Sequential strong-animation pass — Mandy:
- Rebuilt the staff as a separate `MandyStaff_Attachment`, bone-parented directly to the right wrist instead of floating beside the character.
- Corrected the attachment dimensions and excluded equipment from hero-height normalization so neither the staff nor Mandy distorts the other's scale.
- Expanded Attack to 24 frames with a held anticipation, a two-frame contact snap, upper-body counter-rotation, wrist whip, overshoot, and recovery.
- Browser QA inspected Idle plus anticipation/contact/follow-through frames: the staff remains in the hand and traces a broad, readable melee arc. Browser console has 0 errors and 0 warnings.
- All 22 frontend tests pass and the production Vite build succeeds.

Sequential strong-animation pass — Fairy Mina:
- Rebuilt Fairy Mina with a dedicated 26-frame throw: deep torso/wing anticipation, a held charge pose, a sharp shoulder/wrist release, overshoot, and recovery.
- Fixed rig discovery for imported `R_wrist_*` bones; the separated fairy orb is now attached to the actual wrist rather than silently missing.
- Normalized the held orb's size and offset in scene units so GLB authoring scale cannot make it invisible. It remains visible through the charge/stretch phase and disappears at release, where the gameplay projectile continues the shot.
- Added a single-hero rebuild filter (`ONLY_HERO`) to avoid rewriting every GLB during later sequential animation passes.
- Browser QA inspected charge and release frames; the charge orb is visible in front of the arm/body, the silhouette changes clearly, and the browser console has 0 errors and 0 warnings.
- All 22 frontend tests and targeted ESLint pass; the production Vite build succeeds.

Sequential strong-animation pass — Brock Zeus:
- Rebuilt Brock with a dedicated 26-frame command gesture: charge lean, held raised-hand anticipation, sharp downward cast, impact pose, and recoil.
- Confirmed that the source `armor_GEO` is one rigid unskinned mesh, so bone animation alone cannot deform it; added a Brock-specific visual motion layer that tilts/lifts the rigid armor while leaving the detached cloud independent.
- Replaced the long-lived white bar effect with a short contact-timed zigzag bolt: blue outer body, white core, side fork, impact flash, point light, and slight electrical jitter.
- Browser QA inspected charge, strike, and recoil frames. Brock now changes silhouette across the attack, the cloud stays beside him, and the strike visibly originates under it. Browser console has 0 errors and 0 warnings.
- Added regression coverage for rigid-body caster motion and contact-only cloud lightning. All 22 frontend tests and targeted ESLint pass; the production Vite build succeeds.

Bush concealment visual pass:
- Replaced the old 42% opacity applied to both the complete hero and its HUD with a smooth concealment state.
- Heroes remain readable at 80% opacity, while a low foreground foliage layer covers the feet/lower silhouette and sways subtly.
- Name and HP stay fully readable; the contact shadow softens while concealed.
- Added deterministic `?bush=1` support to the GLB browser harness and regression coverage for the concealment transition and foliage bounds.

Weighted melee animation pass:
- Diagnosed that runtime upper-body masking removed hips and lower-spine tracks from attacks, leaving only arms/chest moving and making strikes look weightless.
- Melee attacks now preserve pelvis/lower-spine tracks while locomotion keeps ownership of the legs; this applies to Mandy, Kaze, Wukong Mico, and Persephone Lumi.
- Re-authored Mandy Attack with anticipation, pelvis counter-rotation, a fast contact transition, follow-through, and recovery; reduced the near-90-degree chest turn that hid the staff behind her body at contact.
- Blender 5.2 slotted Actions are handled through layer/strip channel bags when clamping Bezier handles, avoiding Euler overshoot between extreme poses.
- Rebuilt Mandy's GLB and added regression coverage that melee attack overlays retain hips but still exclude feet.

Visible bat monster pass:
- Found that the server continued simulating and broadcasting `state.monsters`, including lethal bat melee damage, but the Three.js migration never added a monster renderer.
- Added a synchronized Three.js bat with tier coloring, emissive eyes, animated wings/hover, contact shadow, rotation, size, and health bar.
- Bat views are created/updated/removed directly from authoritative monster snapshots and disposed with the battle renderer.
- Added `?bat=1` to the deterministic GLB harness and regression coverage for snapshot creation, animation, coordinates, tier, and removal.

Mandy combat staff visibility pass:
- Confirmed the exported attachment was visible and wrist-parented, but measured only about 0.8 scene units against Mandy's 2.45-unit body, so it became a thin line and disappeared behind her silhouette during Attack.
- Rebuilt the staff at a readable ~1.7-unit silhouette with a thicker shaft/grip/caps and explicit Principled BSDF colors.
- Runtime now recognizes the `melee-weapon` attachment and guarantees it remains visible for every alive combat state.
- Browser QA verified a bright pink/gold staff beside the gripping hand in Idle and crossing clearly in front of Mandy during Attack, with no console errors.

Battle WebGL precision crash pass:
- Traced Three.js `reading 'precision'` to browser WebGL-context exhaustion: hero previews disposed renderer resources but kept their GPU contexts allocated.
- Preview cleanup now explicitly loses its context, and battle initialization releases every still-registered preview context before constructing `ThreeBattleRenderer`.
- `SceneRoot` explicitly requests WebGL2 then WebGL and rejects a missing/lost context before passing it into Three.js, preventing the opaque internal `precision` null dereference.
- Added registry/context-exhaustion regression tests and browser-tested 16 consecutive context create/release cycles followed by a healthy battle SceneRoot.
## 2026-07-28 — Smooth network movement

- Fixed the client/server clock-domain mismatch in battle interpolation and reconciliation.
- Players, monsters, bullets, and totems now interpolate between 30 Hz server snapshots instead of snapping.
- Local-player reconciliation now compares a server snapshot with the matching client-local history frame.
- Verified in Chrome with a simulated 5-second clock skew: 30 Hz snapshots render at 60 Hz with uniform movement increments and no console errors.

## 2026-07-28 — Monster death handling

- Centralized authoritative monster damage/death handling for bullets, melee sectors, radial attacks, chain damage, and Mandy's staff/super.
- Killed monsters are now removed from the server state consistently and always leave one power drop.
- Added regression coverage for projectile, melee, radial, and Mandy-specific monster kills.

## 2026-07-28 — Mobile battle-map camera

- The battle camera now snaps to the local player on its first rendered frame instead of easing in from the map origin.
- Camera bounds use the real ground footprint of the tilted orthographic view.
- Landscape phone framing is capped to the authoritative map dimensions, preventing the renderer from exposing space outside the arena.
- Verified at a 390×844 mobile viewport in Chrome and added portrait/rotation regression coverage.

## 2026-07-28 — Mobile hero roster cards

- Hero-card GLB previews now scale from their top center instead of their feet, preventing the model from sliding under the footer.
- Added responsive preview scales for phone, tablet, and desktop card grids.
- Verified at 390×844: the preview occupies 107 px of the 112 px artwork area and stays centered above the footer.

## 2026-07-28 — Hero-specific attack animation pass

- Added distinct anticipation, impact/release, and recovery poses for all eight playable heroes.
- Procedural torso and arm motion now layers over each GLB's authored Attack clip, so held weapons follow the attacking hands.
- Mandy keeps a reduced additive layer over her existing broad staff swing; Kaze uses a two-arm cross slash and Wukong a heavy two-handed arc.
- Ranged heroes now visibly draw back and release; Brock Zeus uses a mesh-level fallback because his GLB exposes no arm bones, while retaining the nearby cloud/lightning strike.
- Verified every production GLB in Chrome; seven expose torso plus both arm bones and Brock uses the validated caster-mesh fallback.

## 2026-07-28 — GLB-only hero-selection previews

- Removed the procedural `createHeroModel` placeholder from both the selected-hero stage and roster cards.
- Hero selection now shows a neutral spinner until the matching GLB or its GLB-derived cached snapshot is ready.
- Verified in mobile Chrome that all eight GLB URLs are requested and the selected preview transitions to a live WebGL model.

## 2026-07-28 — Reliable mobile map delivery

- The server now repeats full map geometry in the first three successfully queued state snapshots.
- A slow phone can no longer lose the only wall payload when its one-frame WebSocket state queue is replaced.
- Compact snapshots with null or empty wall arrays preserve the last authoritative map on the client.
- Added regression coverage for compact snapshots arriving after the full map.

## 2026-07-28 — Authored hero attack animation cleanup

- Removed the procedural Euler attack layer that was fighting the authored GLB skeletal clips and twisting shoulders, hands, and held weapons.
- Attack overlays now exclude hips and lower-body tracks, so melee attacks no longer become distance-closing jumps.
- Attack and super one-shots release their final frame back to locomotion instead of permanently clamping heroes into a crooked pose.
- Brock Zeus keeps his dedicated non-skeletal cloud/caster motion because his GLB does not expose a standard arm rig.
- Verified attack and recovery for all eight playable GLBs in Chrome with no console errors; every hero can complete and immediately repeat an attack.

## 2026-07-28 — Monster balance, health drops, and visible HP

- Reduced normal/elite monster HP from 6200/8200 to 3600/5000 and contact damage from 650 to 400.
- Monster deaths now always drop a red health potion instead of a power core.
- Reduced the global hero movement scale from 0.85 to 0.70.
- Added exact `current / maximum` HP text to every hero label and every monster health bar.
- Added regression coverage for monster balance, health drops, movement pace, and health-number formatting.
- Frontend: all 55 tests pass and the production build succeeds.
- Focused Go balance/drop tests pass in Go 1.24; the broader dirty-worktree suite still has pre-existing failures in hero-kit tests unrelated to this change.
- Browser QA verified the monster HP number is readable in the deterministic bat harness with no console errors or warnings.
