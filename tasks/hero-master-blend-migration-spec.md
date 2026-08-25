# Spec: Единый master `.blend` для всех героев

## Objective

Перевести source-пайплайн всех runtime-героев на один master-файл `.blend` на героя. В master-файле должны находиться геометрия, риг, props/companion-объекты и все Actions героя. Раздельные focused-сцены больше не должны быть обязательным source-контрактом.

Цель — сохранить текущий runtime-контракт Three.js: те же URL GLB, имена клипов, attachment semantics и поведение анимаций, но сделать авторинг и повторный экспорт проще.

## Source contract

```text
frontend/assets-source/heroes/<hero>/<hero>.blend
```

Ожидаемые Actions определяются `tools/blender/hero_animation_scene_manifest.json` и runtime clip map. Для обычного героя master-файл содержит body rig/geometry и Actions `idle`, `run`, `Attack`, `super`, `Aim`, `AimSuper`, `hit`, `death`, `Spawn`, `Victory`, `Gadget`; опционально — `AimGadget`.

Для Brock Zeus тот же master-файл содержит Cloud и cloud Actions. Экспорт может по-прежнему публиковать отдельный companion GLB, потому что это runtime optimization, а не дополнительный source-файл.

## Commands

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python tools/blender/export_runtime_heroes_from_master_blends.py
cd frontend; npm test -- --test-name-pattern='master blend|animation scene'
cd frontend; npm run validate:heroes
cd frontend; npm run build
```

## Project structure

- `frontend/assets-source/heroes/<hero>/<hero>.blend` — canonical authored source.
- `tools/blender/hero_animation_contract.py` — shared master/source contract constants.
- `tools/blender/export_runtime_heroes_from_master_blends.py` — canonical master-based exporter.
- `tools/blender/validate_master_hero_sources.py` — source contract validator.
- `tools/blender/hero_animation_scene_manifest.json` — clip order and optional clip contract.
- `frontend/public/assets/heroes/output_heroes/` — runtime GLB outputs.

## Code style

The master exporter should make the source boundary explicit and fail loudly when a required Action is absent:

```python
master = hero_dir / f"{hero}.blend"
if not master.exists():
    raise RuntimeError(f"{hero}: missing master source {master}")

bpy.ops.wm.open_mainfile(filepath=os.fspath(master))
validate_actions(hero, bpy.data.actions)
```

Use stable canonical action names, deterministic ordering, atomic GLB replacement, and no animation key creation in the exporter.

## Testing strategy

- Node contract tests verify the exporter, manifest, and source-layout contract without requiring Blender.
- Blender background validation inspects every master file, rig, required Action, frame range, and Brock Cloud contract.
- Runtime GLB validation checks clip names, hierarchy, scale, and materials.
- Existing frontend unit tests remain the regression suite.
- Browser QA checks hero selection and animation harnesses after GLB regeneration.

## Boundaries

- Always: preserve runtime clip names and URLs; use atomic GLB writes; validate before declaring completion.
- Ask first: changing runtime clip names, changing the Brock companion runtime contract, or adding dependencies.
- Never: modify unrelated dirty-worktree changes; create animation keys in the exporter; silently fall back when a required Action is missing.

## Success criteria

- Every runtime hero has exactly one canonical master `.blend` at the source path above.
- Every canonical master contains the required Actions exactly once and the expected frame contracts.
- The exporter reads only master files and produces the same runtime GLB filenames and clip names as before.
- Brock exports both base and companion GLBs from one source master.
- Focused legacy scenes and one-time migration scripts are removed after validation for the completed heroes; Zeus remains on hold with its legacy sources intact.
- Source, Blender, GLB, frontend tests, build, and browser QA pass, or any environment limitation is reported explicitly.

## Open questions

None. The migration uses the decisions confirmed in the task discussion.
