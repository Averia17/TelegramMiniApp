# Mandy v4: план переработки анимаций

## Цель

Заново авторить Mandy на реальном риге из
`frontend/assets-source/heroes/mandy/mandy.blend`, используя успешные правила
Needle v3 и исправляя причину старого провала: посох должен быть дочерним
объектом левой кисти во всех сценах и в runtime, а правая рука никогда не
касается посоха.

Результат — 12 focused-сцен Blender, один canonical
`frontend/public/assets/heroes/output_heroes/mandy_base.glb` с ригом и
анимациями, а также отдельный `mandy_weapon.glb` с посохом и маркером,
который runtime присоединяет к левому сокету.

## Что выяснено до реализации

- Реальная арматура называется `MandyRig`.
- `Root_2_01` — корневой анимируемый bone; `_rootJoint` — его родитель.
- `Root_2_01` направлен головой к хвосту вверх. В его bone-local осях local Y
  соответствует Blender Z/up; это нужно зафиксировать микротестом Stage 0,
  а не угадывать по названию канала.
- Реальные кости не называются `Hips`, `Spine`, `LeftArm` и т. п.; это только
  семантические имена нового authoring adapter.
- В master уже есть корректная цепочка посоха:
  `MandyStaff_SourcePivot` → `MandyRig/L_wrist_s_047`,
  `Grip.Primary.MandyStaff_Attachment` → `L_wrist_s_047`,
  `MandyStaff_Attachment` → `MandyStaff_SourcePivot`.
- Файла `frontend/assets-source/heroes/mandy/mandy_weapon.blend` сейчас нет.
  Поэтому Stage 0 должен сначала проверить, не появился ли он; если нет,
  detached weapon нужно получить из уже существующего staff-меша master и
  сохранить в отдельный source/export pipeline. Нельзя считать отсутствие
  этого файла причиной для привязки к правой руке.
- Старые focused-сцены, старый authoring script, `mandy_base.glb` и тесты,
  где написано `right-hand staff`, считаются результатом ошибочного прохода и
  должны быть перегенерированы/обновлены в рамках этого плана.

## Канонический rig mapping

| Семантика | Реальные bones |
| --- | --- |
| Root / Loc Up | `Root_2_01` (родитель `_rootJoint` не получает случайных offsets) |
| Hips | `hips_s_02` |
| Spine | `spine_lower_s_030`, `spine_mid_s_031`, `spine_upper_s_032`, `chest_s_033` |
| Neck / Head | `neck_s_034`, `head_s_035` |
| LeftArm | `L_clavicle_s_043`, `L_shoulder_s_044` |
| LeftForearm | `L_elbow_s_045`, `L_forearm_twist_s_046` |
| LeftHand | `L_wrist_s_047` |
| RightArm | `R_clavicle_s_060`, `R_shoulder_s_061` |
| RightForearm | `R_elbow_s_062`, `R_forearm_twist_s_063` |
| RightHand | `R_wrist_s_064` |
| LeftLeg / Foot | `L_upperLeg_s_03`, `L_lowerLeg_s_04`, `L_ankle_s_05`, `L_toes_s_06` |
| RightLeg / Foot | `R_upperLeg_s_07`, `R_lowerLeg_s_08`, `R_ankle_s_09`, `R_toes_s_010` |
| Weapon socket | `weapon_socket_r`, если он сохраняет родителя `L_wrist_s_047`; имя legacy не переименовывать без обновления export/runtime контрактов |

`LeftHand` в этом документе означает `L_wrist_s_047`. Это обязательная
проверка во всех authoring и validation скриптах:

```text
staff_hand = L_wrist_s_047
staff_socket_parent = L_wrist_s_047
right_hand_contact = forbidden
```

## Правила постановки

1. Посох всегда следует за `L_wrist_s_047`; prop не анимируется отдельно от
   кисти. Если для точной посадки нужен Empty, он делается bone-parented к
   `L_wrist_s_047`, после чего offset запекается.
2. Правая рука не касается посоха ни в одном клипе, включая `super` и
   `victory`. Её состояния: пояс, свободно вдоль тела или баланс назад/в
   сторону.
3. Все углы применяются как дельты в локальных осях реальных pose bones.
   Семантические углы из брифа не копируются буквально: adapter калибрует их
   по rest pose и распределяет torso pitch по spine chain.
4. Суммарный визуальный наклон корпуса (`hips + spine chain + chest`) не
   превышает 20°. Для приседа и прыжка высота меняется через подтверждённый
   `Loc Up`, а не через опасное складывание pitch костей.
5. In-place: локальные Root X/Z не меняются; только разрешённый `Loc Up`
   используется в явно указанных приседаниях, прыжке, Spawn и Death. Root
   motion проверяется в bone-local axes, не по предположительным мировым X/Y/Z.
6. В циклах закрывающий ключ дублирует первый: пользовательский кадр 90
   становится Blender frame 91, но playback duration остаётся 90 кадров.
7. Для Spawn разрешается runtime-событие `staff_visible`, но когда посох
   видим, его единственный родитель всё равно `L_wrist_s_047`.

## 12 клипов

Пользовательские номера кадров 0-based; в Blender к ним прибавляется 1.

| Clip | Action | Длина | Постановка и обязательные проверки |
| --- | --- | ---: | --- |
| `idle` | `idle` | 90 | Посох вертикален и упирается в землю в левой руке; правая на поясе; дыхание, перенос веса и мягкие повороты головы; кадры 0/30/60/90, root без подъёма. |
| `run` | `run` | 20 | Посох прижат к левому плечу/корпусу левой рукой; правая работает в противофазе с ногами; torso остаётся upright, root in-place; кадры 0/6/12/18/20. |
| `attack` | `Attack` | 16 | Замах и мощный горизонтальный удар левой рукой; правая отведена для баланса и возвращается к поясу; impact в районе 6–8; без правого хвата. |
| `super` | `super` | 50 | Присед, подъём и удар посохом в землю левой рукой; правая только помогает оттолкнуться/балансирует; impact на 30, затем hold и возврат. |
| `aim` | `Aim` | 60 | Низкая стойка, посох направлен вперёд одной левой рукой, правая на поясе; мягкое покачивание 0/30/60. |
| `aim-super` | `AimSuper` | 60 | Глубокая низкая стойка, посох нижним концом в земле; правая свободно висит или балансирует, не касается посоха; цикл 0/30/60. |
| `hit` | `hit` | 12 | Recoil назад; левая кисть уводит посох назад-вверх, правая делает короткий балансирующий взмах; быстрый возврат. |
| `death` | `death` | 40 | Падение на колени; левая рука до конца держит посох и укладывает/упирает его в землю; правая безвольно падает; финал удерживается. |
| `spawn` | `Spawn` | 45 | Материализация из низкой позы; левая рука вытягивается, посох становится видимым примерно на 18–20 кадре; правая плавно приходит на пояс; затем idle. |
| `victory` | `Victory` | 60 | Вращение посоха 0→720° одной левой рукой, затем прыжок и удар о землю; правая остаётся на поясе/балансирует и не перехватывает посох; гордая финальная поза. |
| `gadget` | `Gadget` | 16 | Резкий присед и фиксация Нерушимой стойки; посох вертикально/в земле в левой руке; правая упирается в колено или уходит назад, но не к посоху. |
| `aim-gadget` | `AimGadget` | 60 | Низкая подготовительная стойка, посох горизонтально на уровне груди в левой руке; правая свободна; небольшое циклическое напряжение. |

## Этапы выполнения

### Stage 0 — диагностика рига и оружия, блокирующий gate

1. Открыть master и, если он существует, `mandy_weapon.blend`. Записать
   `artifacts/mandy-rig-axis-diagnostic.json`.
2. Проверить armature object, parent hierarchy, rest pose, scale, bone-local
   axes и реальный канал Loc Up через controlled displacement одного кадра.
   Ожидаемый результат для текущего master: `Root_2_01` local Y — up, но
   authoring script обязан пользоваться результатом отчёта.
3. Найти все staff objects, сокеты, маркеры и их parent chains. Зафиксировать,
   что и pivot, и marker, и `grip_bone` указывают на `L_wrist_s_047`.
4. Если отдельного `.blend` нет, извлечь staff mesh из master в отдельный
   detached-weapon source с сохранёнными transform, marker и
   `attachment_role=held-weapon`; не создавать второй staff geometry в base
   GLB.
5. Gate: Stage 0 считается пройденным только если Blender-скрипт печатает
   `weapon_hand=L_wrist_s_047`, `right_hand_contact=forbidden` и проверяет
   `loc_up_channel` численным микротестом.

### Stage 1 — чистая база и один проверочный Idle

1. Не брать текущую позу master или legacy Action как готовую анимацию.
   Сбросить pose offsets, зафиксировать нейтральный frame 0 и убедиться, что
   сумма torso pitch близка к нулю.
2. Переписать `author_mandy_animation_scenes.py` на semantic adapter реального
   mapping; заменить ошибочный `hand_r` на `hand_l`, `root_z` на найденный
   `Loc Up`, и добавить явную проверку правой кисти.
3. Сгенерировать только `idle.blend`, открыть его в Blender и проверить
   силуэт Mandy, левый хват, вертикальный staff, контакт с землёй и отсутствие
   прохождения prop через тело.
4. Не переходить к остальным клипам, пока Idle не проходит numeric gate и
   screenshot gate в точном frontend harness.

### Stage 2 — авторинг остальных 11 сцен

1. Сгенерировать сцены из независимого master copy; в каждой сцене должен быть
   один Action, полный Mandy mesh/rig и authoring staff representation.
2. Использовать 30 fps, `BEZIER` и `AUTO_CLAMPED`, явные key poses,
   anticipation, impact, follow-through и cycle closure.
3. Для каждого клипа записать metadata: `hero_slug`, `clip_name`,
   `clip_kind`, `frame_start`, `frame_end`, `fps`, `staff_hand`,
   `loc_up_channel`, `right_hand_contact`, event frames и cycle contract.
4. В конце Stage 2 получить ровно Actions
   `idle`, `run`, `Attack`, `super`, `Aim`, `AimSuper`, `hit`, `death`,
   `Spawn`, `Victory`, `Gadget`, `AimGadget`.

### Stage 3 — numeric QA

Обновить `validate_mandy_animation_scenes.py` так, чтобы он проверял:

- 12 файлов, точные Action names, ranges и 30 fps;
- finite transforms и отсутствие случайных Actions;
- Root local X/Z drift = 0 и допустимый только отчётный Loc Up;
- torso-pitch budget ≤ 20° в каждом sampled frame;
- joint limits, no foot location offsets и допустимый FK foot slide только
  там, где это действительно нужно;
- staff pivot/marker/grip bone ancestry через `L_wrist_s_047`;
- минимальную дистанцию правой кисти до staff geometry/marker — правый контакт
  должен быть невозможен;
- staff ground contact в `idle`, `super`, `aim-super`, `death`, `gadget` и
  impact-фазах, где он указан;
- отсутствие пересечения staff с torso по sampled bounds и preview frames;
- cycle closure для `idle`, `run`, `aim`, `aim-super`, `aim-gadget`.

### Stage 4 — export и runtime contract

1. Экспортировать base GLB без staff geometry, но с левым weapon socket и
   marker, чтобы detached weapon не дублировался.
2. Экспортировать/проверить отдельный `mandy_weapon.glb` из Stage 0 с
   `MandyStaff_Attachment`, `Grip.Primary.MandyStaff_Attachment`,
   `attachment_role=held-weapon` и `grip_bone=L_wrist_s_047`.
3. Обновить exporter, `docs/hero-catalog.json`, manifest, `HERO_ASSETS.Mandy`,
   GLTFLoader attachment config и runtime tests: убрать старый
   `right-hand staff`, указать левый socket/grip и оставить `AimGadget`
   Mandy-specific extra.
4. Проверить canonical path, размер/время файла и animation list после
   завершения Blender. Если Windows оставил `.tmp.glb`, явно финализировать
   его в canonical path и повторить audit.

### Stage 5 — visual QA и release gate

В exact frontend harness проверить минимум `idle`, `run`, `attack`, `super`,
`aim`, `aim-super`, `death`, `spawn`, `victory`, `gadget`, `aim-gadget` на
ключевых кадрах. Отдельно проверить переходы `idle → attack → idle`,
`idle → super`, `spawn → idle` и `death`.

Release разрешён только при одновременном выполнении numeric Blender audit,
GLB structural audit, runtime contract tests и visual screenshot review.

## Acceptance criteria

- В `scenes/` ровно 12 focused-сцен и в каждой ровно один канонический Action.
- Во всех сценах staff socket/pivot/marker и detached weapon указывают на
  `L_wrist_s_047`; ни один клип не использует `R_wrist_s_064` как weapon hand.
- Правая рука не касается staff ни на одном sampled/key frame.
- Корпус не заваливается: суммарный torso pitch ≤ 20°, Root horizontal motion
  отсутствует, Loc Up использует подтверждённый локальный канал.
- `mandy_base.glb` содержит Mandy mesh/rig и все 12 Actions, но не дублирует
  detached staff geometry.
- `mandy_weapon.glb` содержит staff, marker и canonical held-weapon metadata;
  runtime прикрепляет его к левому сокету.
- Spawn visibility и event markers согласованы с runtime, а `AimGadget` не
  становится обязательным клипом для других героев.
- Blender audit, GLB audit, Mandy runtime tests, catalog validation, frontend
  tests, lint и build проходят; unrelated pre-existing failures записаны
  отдельно.

## Риски и меры

| Риск | Мера |
| --- | --- |
| В runtime останется старый right-hand contract | Сначала обновить mapping/validator/tests, затем экспортировать; добавить assert на `L_wrist_s_047`. |
| Нет `mandy_weapon.blend` | Использовать embedded master staff как источник extraction и явно проверить конечный `.glb`; не блокировать весь pass догадкой о несуществующем файле. |
| Локальные оси FBX дают неожиданный наклон | Stage 0 micro-test + calibrated semantic adapter; буквальные Euler из брифа не использовать. |
| Старый baseline снова создаст постоянный lean | Нейтральный baseline авторить отдельно и визуально принять на Idle до генерации остальных клипов. |
| Numeric pass скрывает плохой силуэт | Обязательный screenshot gate в exact harness на Idle/Attack/Super/Aim/Victory и переходах. |
| Windows отдаёт старый GLB из-за блокировки | Проверять canonical file после export и финализировать `.tmp.glb` явно. |

## Результат планирования

До начала Blender-авторинга нужно сначала выполнить Stage 0 и принять его
отчёт. После этого единственным источником правды для нового Mandy pass будут
обновлённый mapping, v4 authoring script и regenerated focused scenes; старые
сцены/отчёты с `R_wrist_s_064` не переиспользуются.
