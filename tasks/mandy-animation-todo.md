# Mandy v4 — чеклист переработки

## Stage 0 — диагностика и оружие

- [x] Открыть `mandy.blend` и создать отдельный `mandy_weapon.blend` из canonical staff source.
- [ ] Записать bone hierarchy, rest pose, scale, local axes и Loc Up в `artifacts/mandy-rig-axis-diagnostic.json`.
- [x] Подтвердить mapping `MandyRig` и `L_wrist_s_047` как единственную weapon hand.
- [ ] Проверить `MandyStaff_SourcePivot`, `Grip.Primary.MandyStaff_Attachment` и `MandyStaff_Attachment`.
- [ ] Если source `.blend` отсутствует, извлечь detached staff source из master без изменения визуального transform.
- [ ] Зафиксировать `right_hand_contact=forbidden` и пройти Stage-0 gate.

## Stage 1 — baseline и пилот

- [x] Удалить из нового pass логику `R_wrist_s_064` как weapon hand и старый `root_z` assumption.
- [ ] Создать чистую нейтральную pose baseline с torso pitch около 0°.
- [ ] Переписать semantic mapping на реальные Mandy bones.
- [ ] Сгенерировать только `idle.blend`.
- [ ] Проверить Idle визуально: посох в левой руке, вертикаль, земля, пояс правой руки, нет torso penetration.
- [ ] После Idle numeric + screenshot gate продолжить остальные клипы.

## Stage 2 — 12 focused-сцен

- [ ] Сгенерировать `idle` — 90 кадров.
- [ ] Сгенерировать `run` — 20 кадров.
- [ ] Сгенерировать `attack` / `Attack` — 16 кадров.
- [ ] Сгенерировать `super` — 50 кадров.
- [ ] Сгенерировать `aim` / `Aim` — 60 кадров.
- [ ] Сгенерировать `aim-super` / `AimSuper` — 60 кадров.
- [ ] Сгенерировать `hit` — 12 кадров.
- [ ] Сгенерировать `death` — 40 кадров.
- [ ] Сгенерировать `spawn` / `Spawn` — 45 кадров.
- [ ] Сгенерировать `victory` / `Victory` — 60 кадров.
- [ ] Сгенерировать `gadget` / `Gadget` — 16 кадров.
- [ ] Сгенерировать `aim-gadget` / `AimGadget` — 60 кадров.
- [ ] Во всех сценах сохранить metadata, 30 fps, Bezier/Auto Clamped и cycle contract.

## Stage 3 — Blender QA

- [ ] Проверить ровно 12 сцен и ровно один Action в каждой.
- [x] Проверить `L_wrist_s_047` ancestry для staff/pivot/marker/grip bone.
- [ ] Проверить отсутствие контакта правой кисти с staff во всех sampled frames.
- [ ] Проверить Root local horizontal drift и подтверждённый Loc Up channel.
- [ ] Проверить torso pitch ≤ 20°, finite transforms и joint limits.
- [ ] Проверить стопы, FK slide policy и staff ground contacts.
- [ ] Проверить cycle closure у пяти loop-клипов.
- [ ] Сохранить `artifacts/mandy-animation-authoring.json` и `artifacts/mandy-animation-validation.json`.

## Stage 4 — export/runtime

- [ ] Обновить authoring/export scripts под левую weapon hand.
- [ ] Экспортировать `mandy_base.glb` без дублирования staff geometry.
- [x] Экспортировать/проверить `mandy_weapon.glb` с marker и `grip_bone=L_wrist_s_047`.
- [x] Обновить catalog/manifest/exporter/runtime mapping и убрать старый right-hand contract.
- [ ] Сохранить `AimGadget` как Mandy-specific extra.
- [ ] Проверить canonical GLB path, animation list и возможный `.tmp.glb`.

## Stage 5 — visual/release QA

- [ ] Проверить exact frontend harness на ключевых кадрах всех 12 клипов.
- [ ] Проверить переходы `idle → attack → idle`, `idle → super`, `spawn → idle`, `death`.
- [ ] Запустить GLB audit, Mandy runtime tests, catalog validation, frontend tests, lint и build.
- [ ] Зафиксировать screenshots и отдельно отметить unrelated pre-existing failures.

## Definition of done

- [x] Нет ни одной ссылки нового Mandy pass на `R_wrist_s_064` как weapon hand.
- [ ] Посох виден и движется вместе с левой кистью в Blender и frontend.
- [ ] Правая рука ни в одном клипе не берёт посох.
- [ ] Все acceptance criteria из `tasks/mandy-animation-plan.md` выполнены.
