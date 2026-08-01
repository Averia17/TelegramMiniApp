# Hero animation scenes

Анимации способностей принадлежат конкретному герою и хранятся в отдельной
папке:

```text
frontend/assets-source/heroes/<hero>/
  <hero>.blend                 # master: модель, rig, сокеты и сборка
  animations/<event>.blend     # legacy clips, используемые как исходная поза
  scenes/<event>.blend         # focused-сцена с авторингом по кадрам
  scenes/gadget.blend          # focused-сцена Gadget
```

Каждая focused-сцена сохраняет custom properties `hero_slug`, `clip_name`,
`clip_kind`, `frame_start`, `frame_end`, `fps` и `authoring_status`.
Авторинг записывает ключи на каждом кадре, затем оставляет их связанными
плавными Bezier-кривыми с `AUTO_CLAMPED` handles. Поэтому движение остаётся
покадровым и одновременно не дёргается между соседними кадрами.

Канонические имена Actions:

```text
attack -> Attack
super  -> super
gadget -> Gadget
```

Команды авторинга:

```powershell
blender --background --python tools/blender/author_attack_super_animation_scenes.py
blender --background --python tools/blender/author_gadget_animation_scenes.py
```

Gameplay загружает единственный canonical GLB с полным набором runtime-анимаций:

```powershell
blender --background --python tools/blender/export_runtime_heroes_from_scenes.py
```

Результат находится в `frontend/public/assets/heroes/output_heroes/<slug>_base.glb`.
`assetManifest.js` связывает героя с этим файлом и именами Actions. Для Gadget
сервер увеличивает `gadgetPulse`, snapshot передаёт его в `HeroView`, а
`GLBHeroController` запускает Action `Gadget`.

Отдельные ability GLB не публикуются: Attack, super и Gadget живут внутри canonical base GLB.
