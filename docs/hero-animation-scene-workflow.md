# Hero animation master files

Master `.blend` является единственным источником runtime-анимаций героя.

```text
frontend/assets-source/heroes/<hero>/
  <hero>.blend            # модель, rig, props и все authored Blender Actions
```

Каждый master содержит полный mesh/armature героя и canonical Actions с
metadata `hero_slug`, `clip_name`, `clip_kind`, `frame_start`, `frame_end` и
`source_layout`. Имена Actions в runtime-контракте:

```text
idle -> idle       run -> run          attack -> Attack
super -> super     aim -> Aim          aim-super -> AimSuper
hit -> hit         death -> death      spawn -> Spawn
victory -> Victory gadget -> Gadget
```

Авторинг выполняется непосредственно в Blender вручную: все ключи, кривые,
пропы и NLA-треки сохраняются в master-файле. Репозиторий не содержит скриптов,
которые создают, переписывают или «улучшают» Actions/геометрию. В Blender один
Action выбирается активным для текущего просмотра, но остальные Actions
остаются в том же `.blend` и экспортируются вместе с ним.

Runtime GLB собирается единственным exporter-ом:

```powershell
blender --background --python tools/blender/export_runtime_heroes_from_master_blends.py
```

После экспорта runtime-контракт проверяется из `frontend`:

```powershell
npm run validate:heroes
npm run validate:hero-catalog
```

Exporter открывает `<hero>/<hero>.blend`, проверяет canonical Actions и
экспортирует их через `export_animation_mode="ACTIONS"`. Он не создаёт ключи,
не меняет Actions/геометрию и не сохраняет source `.blend`. Для Brock Zeus Cloud остаётся отдельным runtime
companion GLB, но находится в том же source master.

Результат — один самодостаточный файл на героя:

```text
frontend/public/assets/heroes/output_heroes/<hero>_base.glb
```

Frontend загружает только этот canonical GLB; отдельные animation GLB не
публикуются и не используются.
