# План полного аудита hero-анимаций

## Цель

Проверить всех 8 runtime-героев и их attack/super/gadget-клипы в live harness,
найти визуально сломанные суставы и добавить только консервативные вторичные
движения без root/hip drift.

## Срезы

1. Аудит scene/action-контрактов и pose samples для всех heroes/clips.
2. Визуальная проверка увеличенных harness-кадров по anticipation/release/recovery.
3. Правки группами по одному hero или близкому типу проблемы.
4. После каждой группы: Blender validators, export, targeted browser QA.
5. Финальный полный GLB validation и 24 skill-case browser QA.

## Acceptance criteria

- Основные руки и ноги остаются собранными и не проходят через корпус на ключевых фазах.
- Нет NaN/экстремальных rotations, root motion или разрыва loop на idle/run.
- У каждого attack/super/gadget сохраняются semantic markers и читаемые фазы.
- Все canonical runtime GLB проходят validation, полный roster QA не имеет console/page errors.

## Риски

- Визуальные secondary offsets могут усилить уже неверную authored pose — поэтому
  сначала проверяются sample-позы, а изменения вносятся малыми амплитудами.
- Blender 5.2 layered Action API требует совместимой работы с channelbags.
- Каталог содержит Katty отдельным legacy blend; его проверяем отдельно от 7
  focused-scene героев.
