# Todo: battle map audit and improvement

- [x] Record the canonical map API, seed, dimensions, object types, and topology baseline.
- [x] Audit the full browser screenshot and identify visual integration issues.
- [x] Remove the lowQuality branch and keep one renderer path.
- [x] Replace flat crate/bridge placeholders with volumetric natural props.
- [x] Add deterministic meadow patches and grass variation to the shared ground texture.
- [x] Add safe deterministic stone color variation without changing the fixed tile footprint.
- [x] Verify tree height, prop readability, contact grounding, and full-frame composition.
- [x] Recheck topology, spawners, water ring, intended corridors, and blocking flags.
- [x] Run rendering/network tests, backend map tests, build, ESLint, diff check, and browser smoke.
- [x] Save the final browser screenshot/state and update progress.md.

## Follow-up candidates

- [ ] Revisit composition only if a combat playtest shows a real corridor or sightline problem.
- [ ] Replace any remaining placeholder decorative types if they are added to the canonical generator later.
