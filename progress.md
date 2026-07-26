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
- When the first GLB is supplied, mark it available in assetManifest.js and validate its scale, pivot, and clips.
- Remove HeroModelFactory after the first real hero GLB is validated; until then it is the visible placeholder.

GLB authoring contract:
- Use a clean root at the ground-contact center, with Y up and the hero facing +Z.
- Export in metres with transforms applied; tune only manifest `scale` and `rotationOffset` in runtime.
- Environment `footprint` is expressed in authoritative 2D world units. `repeat` fills the collider grid; `single` stays centered.
- Hero clips use the semantic manifest slots (`Idle`, `Run`, `Attack`, `Super`, `Hit`, `Death`); optional missing clips fall back without breaking rendering.
