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
