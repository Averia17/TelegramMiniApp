# Hero animation scenes

Анимация способности принадлежит конкретному герою. Поэтому она авторится в
отдельной Blender-сцене:

```text
frontend/assets-source/heroes/<hero>/
  <hero>.blend                 # master: модель, риг, сокеты, сборка
  animations/<event>.blend     # уже существующие event-клипы
  scenes/attack.blend          # авторский basic attack этого героя
  scenes/super.blend           # авторский super этого героя
  scenes/gadget.blend          # авторский gadget этого героя
```

Старые per-hero `build.py` и legacy-генераторы удалены. Сборщик не придумывает choreography и не
ставит keyframes: он собирает actions из `animations/` и `scenes/` в master и
экспортирует один runtime GLB героя. Для каждой ability-сцены action должен называться ровно
`Attack`, `Super` или `Gadget`, а в сцене должны быть custom properties
`hero_slug`, `clip_name`, `clip_kind`, `frame_start`, `frame_end`.

Заготовки создаются командой:

```powershell
blender --background --python tools/blender/scaffold_hero_animation_scenes.py
```

Скрипт создаёт только отсутствующие файлы и не генерирует универсальные ключи.
Для `attack` и `super` он переносит уже существующие authored event-сцены в
новый ability-контур; `gadget` остаётся TODO до ручного авторинга.
После авторинга экспортёр должен импортировать action из соответствующей
сцены, сохранить его в master и экспортировать один `<hero>.glb`.

Для этого используется `tools/blender/assemble_hero_from_scenes.py`:

```powershell
blender --background --python tools/blender/assemble_hero_from_scenes.py -- --hero mandy
```

Отдельные GLB способностей экспортируются так:

```powershell
blender --background --python tools/blender/export_hero_ability_glbs.py -- --hero mandy
```

Результат появляется в `frontend/public/assets/heroes/<hero>/abilities/`.
Экспортёр пропускает сцену без authored action, поэтому отсутствие `gadget.glb`
явно сигнализирует, что способность ещё не анимирована.

Runtime не открывает `.blend`, `.fbx` или Python-скрипты: он загружает только
готовые GLB из `frontend/public/assets`. Blender используется исключительно
для ручного authoring и явного экспорта.
