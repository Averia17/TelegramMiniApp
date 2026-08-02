# Hero animation scenes

Сцены являются единственным источником runtime-анимаций героя.

```text
frontend/assets-source/heroes/<hero>/
  scenes/<event>.blend    # focused-сцена: модель, rig и один authored Action
```

Каждая сцена должна содержать полный mesh/armature героя и custom properties
`hero_slug`, `clip_name`, `clip_kind`, `frame_start`, `frame_end`, `fps` и
`authoring_status`. Имена Actions в runtime-контракте:

```text
idle -> idle       run -> run          attack -> Attack
super -> super     aim -> Aim          aim-super -> AimSuper
hit -> hit         death -> death      spawn -> Spawn
victory -> Victory gadget -> Gadget
```

Авторинг и проверки работают непосредственно с focused-сценами:

```powershell
blender --background --python tools/blender/author_full_animation_scenes.py
blender --background --python tools/blender/audit_authored_animation_scenes.py
```

Runtime GLB собирается единственным exporter-ом:

```powershell
blender --background --python tools/blender/export_runtime_heroes_from_scenes.py
```

Exporter открывает `scenes/idle.blend` как источник полной модели и rig, затем
берёт ровно один Action из каждой focused-сцены. Он не читает legacy master,
старые clip-файлы, не создаёт ключи, не сохраняет `.blend` и не делает
последующее слияние отдельных GLB.

Результат — один самодостаточный файл на героя:

```text
frontend/public/assets/heroes/output_heroes/<hero>_base.glb
```

Frontend загружает только этот canonical GLB; отдельные animation GLB не
публикуются и не используются.
