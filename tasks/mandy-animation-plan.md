# План переработки анимаций Mandy

## Цель

Переписать Mandy как набор из двенадцати детерминированных focused-сцен
Blender, используя новый покадровый бриф: активный боец с посохом, все
движения in-place, root не получает смещения по X/Y. После numeric и visual QA
опубликовать один canonical `mandy_base.glb` со всеми двенадцатью Actions для
Three.js runtime.

## Результаты аудита и решения

- Blender 5.2 установлен в `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.
- Реальный armature называется `MandyRig`. Основная цепочка тела:
  `_rootJoint -> Root_2_01 -> hips_s_02`, позвоночник
  `spine_lower_s_030 -> spine_mid_s_031 -> spine_upper_s_032 -> chest_s_033`,
  голова `head_s_035`.
- Левая рука: `L_shoulder_s_044`, `L_elbow_s_045`,
  `L_forearm_twist_s_046`, `L_wrist_s_047`; правая рука имеет симметричную
  цепочку `R_shoulder_s_061`, `R_elbow_s_062`, `R_forearm_twist_s_063`,
  `R_wrist_s_064`.
- Ноги: `L_upperLeg_s_03 -> L_lowerLeg_s_04 -> L_ankle_s_05 -> L_toes_s_06`
  и `R_upperLeg_s_07 -> R_lowerLeg_s_08 -> R_ankle_s_09 -> R_toes_s_010`.
- Staff attachment в текущем master `.blend` привязан к левой руке:
  `L_wrist_s_047` через `MandyStaff_SourcePivot` и
  `Grip.Primary.MandyStaff_Attachment`. Это является каноническим решением для
  новой постановки; staff не переносить на правую руку.
- Blender-авторинг должен использовать Z-up, 30 fps, явные pose keys и
  `BEZIER` + `AUTO_CLAMPED`. Пользовательские кадры считаются 0-based, поэтому
  при переносе в Blender к каждому номеру прибавляется `+1`: кадр 0 становится
  frame 1, кадр 30 — frame 31. Длительность сцены не меняется: idle остаётся
  90-кадровым клипом, а закрывающий ключ цикла ставится на frame 91 и совпадает
  с frame 1; этот дублирующий ключ не должен добавлять длительность playback.
- `mandy.blend` и legacy `animations/*.blend` не являются результатом новой
  постановки. Источником runtime должны остаться focused-сцены в
  `frontend/assets-source/heroes/mandy/scenes/`; master-файл не изменять
  authoring-скриптом.
- Глобальный runtime contract сейчас содержит десять event-клипов и один
  `Gadget`. Новый `AimGadget` должен быть Mandy-specific extra, как отдельная
  запись в manifest/catalog/runtime mapping, чтобы не требовать этот clip от
  остальных героев.

## Канонический набор клипов

| Scene clip | Action | Кадры | Длительность | Тип |
| --- | --- | ---: | ---: | --- |
| `idle` | `idle` | 90 | 3.0 s | loop |
| `run` | `run` | 24 | 0.8 s | loop |
| `attack` | `Attack` | 20 | 0.67 s | event |
| `super` | `super` | 60 | 2.0 s | ability |
| `aim` | `Aim` | 60 | 2.0 s | loop |
| `aim-super` | `AimSuper` | 60 | 2.0 s | loop |
| `hit` | `hit` | 12 | 0.4 s | event |
| `death` | `death` | 45 | 1.5 s | event |
| `spawn` | `Spawn` | 45 | 1.5 s | event |
| `victory` | `Victory` | 60 | 2.0 s | event |
| `gadget` | `Gadget` | 24 | 0.8 s | ability |
| `aim-gadget` | `AimGadget` | 60 | 2.0 s | loop |

Каждая сцена должна содержать полный mesh/armature Mandy, ровно один
канонический authored Action и metadata `hero_slug`, `clip_name`, `clip_kind`,
`frame_start`, `frame_end`, `fps`, `authoring_status`. Для loop-клипов конец
цикла должен совпадать с начальной позой и не создавать скачок при повторении.

## Покадровый контракт постановки

Новый бриф является источником choreographic intent. Авторинг должен сохранить
его ключевые позы, а промежуточные кадры генерировать плавно. В mapping нужно
использовать реальные Mandy-бones, а не буквальные имена `Spine`, `UpperArm.R`
и `Thigh.R/L` из брифа:

- `Root` — `_rootJoint`/`Root_2_01` согласно проверенному root-motion
  контракту; X/Y всегда неподвижны, Z меняется только там, где это указано.
- `Spine` — spine lower/mid/upper и chest; `Head` — `head_s_035`.
- `UpperArm.R/L` — shoulder chain; `Forearm.R/L` — elbow/forearm chain;
  `Hand.R/L` — wrist; пальцы сохраняют закрытый grip на staff, кроме
  специально указанных моментов.
- `Thigh`, `Shin`, `Foot` — upper leg, lower leg и ankle/toes chains.
- Для staff нужно валидировать одновременно положение кистей, staff pivot,
  ground contact и отсутствие прохождения посоха сквозь torso. Нельзя решать
  такие ошибки только вращением пропа отдельно от руки.

Покадровые опорные точки для authoring:

1. `idle`: кадры 0/30/60/90; вертикальный staff, правая/подтверждённая
   weapon-hand держит его, вторая рука на поясе, дыхание и мягкие повороты
   головы; root Z не меняется.
2. `run`: кадры 0/6/12/18/24; staff горизонтально перед корпусом, руки и ноги
   работают в противофазе, стопы поднимаются на 4–6 см, root XY не двигается.
3. `attack`: кадры 0/4/8/12/20; замах, мощный горизонтальный удар справа
   налево, impact на 8, возврат к idle. Локти не переразгибать; staff работает
   через левую руку, правая рука стабилизирует движение.
4. `super`: кадры 0/15/30/35/45/60; присед, резкий подъём, удар staff о землю,
   удержание impact-позы и возврат. На impact ноги слегка согнуты, staff
   касается земли, root Z допускает только описанный вертикальный impulse.
5. `aim`: кадры 0/30/60; низкая боевая стойка, staff горизонтально перед
   грудью, лёгкое покачивание без выхода из loop.
6. `aim-super`: кадры 0/30/60; глубокий присед, staff нижним концом касается
   земли перед Mandy, корпус и руки дают мелкую подготовительную вибрацию.
7. `hit`: кадры 0/3/7/10/12; резкий recoil назад, staff взмывает вверх,
   стопы остаются на месте, root Z не меняется.
8. `death`: кадры 0/8/15/25/45; оседание на колени, staff остаётся в руке и
   упирается в землю, левая/свободная рука безвольно падает, финальная поза
   удерживается.
9. `spawn`: кадры 0/10/20/45; скрюченная поза без staff, раскрытие корпуса,
   материализация staff в левой weapon-hand и переход в idle.
10. `victory`: кадры 0/10/20/30/35/40/60; вращение staff только wrist/forearm,
    подхват второй рукой, удар о землю, короткий подскок и гордая стойка.
11. `gadget`: кадры 0/5/12/24; быстрый переход в широкую устойчивую
    оборонительную стойку, staff горизонтально перед грудью, затем hold.
12. `aim-gadget`: кадры 0/30/60; низкая боевая стойка и подготовка к gadget,
    staff на уровне груди, небольшое покачивание и напряжение кистей.

## Execution slices

1. Зафиксировать contract перед авторингом: staff остаётся в левой руке,
   0-based кадры переводятся в Blender через `+1`, а 15-сантиметровый выпад
   attack реализуется FK-анимацией бедра/голени с разрешённым foot slide.
2. Добавить Mandy-specific authoring layer, который использует реальный
   `MandyRig`, legacy action только как baseline, а новый choreography profile
   — как source of truth. Не копировать слепо текущие 28/55/58 frame skill
   profiles: для Mandy применить новые 20/60/24 timings из этого брифа.
3. Генерировать двенадцать focused-сцен и JSON authoring report; сохранить
   frame markers для `attack` impact, `super` contact/hold и `gadget` stance,
   чтобы animation и VFX/gameplay оставались синхронны.
4. Добавить Mandy validation: exact action names, frame ranges, 30 fps, finite
   transforms, root X/Y drift, допустимые root Z impulse, joint limits,
   contact/foot sliding, staff grip/ground collision, cycle closure и отсутствие
   лишних Actions в каждой focused-сцене.
5. Расширить exporter и manifest/catalog так, чтобы при `HERO_FILTER=mandy`
   импортировался `AimGadget`, а остальные герои продолжали экспортироваться
   по прежнему контракту. Экспортировать
   `frontend/public/assets/heroes/output_heroes/mandy_base.glb` атомарно из
   focused-сцен.
6. Обновить Mandy-specific animation metadata и runtime clip map; сохранить
   `Attack`, `super`, `Gadget` как ability mapping и не менять глобальный
   десятиклиповый fallback для остальных героев.
7. Прогнать Blender audit, GLB structural audit, browser transition/frame
   sweep, frontend tests, catalog validation, lint и build; отдельно сохранить
   визуальные preview-кадры Mandy для idle/run/attack/super/aim-super/death.

## Acceptance criteria

- Mandy имеет ровно двенадцать focused-сцен и двенадцать exported Actions:
  `idle`, `run`, `Attack`, `super`, `Aim`, `AimSuper`, `hit`, `death`, `Spawn`,
  `Victory`, `Gadget`, `AimGadget`.
- Все сцены работают при 30 fps и соответствуют длительностям из таблицы;
  loop-клипы замыкаются без скачка.
- Root не имеет motion по X/Y ни в одном клипе. Любые изменения Z ограничены
  явно описанными приседаниями, подскоками, ударом и оседанием.
- Staff следует за левой hand/socket цепочкой, не проходит сквозь
  Mandy, касается земли в `super`, `aim-super`, `death` и `victory` там, где
  это требует бриф, а fingers сохраняют grip.
- Выпады в `attack`, `super` и `hit` используют FK-движение бедра/голени и
  допускают умеренный foot slide до 10–15 см. Дополнительные IK-цели не
  добавляются; в `idle`, `run` и `aim` стопы не скользят, допускается только
  переступание и отрыв носка.
- `mandy_base.glb` содержит mesh, rig, staff attachment и все двенадцать
  клипов; frontend загружает только этот canonical GLB.
- `docs/hero-catalog.json`, animation manifest и runtime mapping согласованы;
  `AimGadget` не становится обязательным клипом для других героев.
- Существующие seven/eight-hero assets, общий десяти-event contract и
  gameplay ability mappings остаются рабочими.
- Проходят Blender/runtime audits, `python tools/validate_hero_catalog.py`,
  frontend tests, lint и build; визуальные ограничения QA явно записаны в
  отчёте.

## Риски и меры

| Риск | Влияние | Мера |
| --- | --- | --- |
| Семантические углы брифа не совпадают с локальными осями FBX-рига | Высокое | Снять rest-pose calibration, применять pose mapping по реальным bone chains и проверять preview/limits. |
| Новые 20/60/24 кадра расходятся с текущими skill profiles 28/55/58 | Высокое | Зафиксировать event markers отдельно от длительности клипа и синхронизировать их с gameplay/VFX до экспорта. |
| `AimGadget` отсутствует в глобальном exporter contract | Среднее | Ввести per-hero extra clip в manifest/catalog/exporter и покрыть его отдельным тестом. |
| Foot slide заметен при медленном просмотре | Среднее | Ограничить slide 10–15 см короткими быстрыми фазами attack/super/hit и запретить его в idle/run/aim. |
| Headless Blender не доказывает силуэт и контакт посоха на каждом кадре | Среднее | Numeric sweep плюс набор preview renders и ручная проверка ключевых impact-кадров. |

## Открытые вопросы

Блокирующих вопросов нет: staff остаётся в левой руке, кадры переводятся в
Blender через `+1`, а выпады используют FK foot slide без IK.
