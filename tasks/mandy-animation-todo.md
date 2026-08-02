# Mandy animation rework checklist

- [x] Зафиксировать staff в правой руке через `R_wrist_s_064` и `Grip.Primary.MandyStaff_Attachment`.
- [x] Перевести 0-based brief-кадры в Blender через `+1`; закрывающие ключи циклов дублируют первый ключ.
- [x] Использовать FK foot slide до 10–15 см только в attack/super/hit; не добавлять IK-цели.
- [x] Составить mapping Mandy bones для Root, spine, head, arms, legs и staff attachment.
- [x] Добавить Mandy choreography profile с длительностями `90/20/16/50/60/60/12/40/45/60/16/60`; Victory получил 3 оборота посоха, прыжок и удар.
- [x] Сгенерировать 12 focused Blender-сцен и authoring report.
- [x] Проверить metadata, canonical Action names, 30 fps и отсутствие лишних Actions.
- [x] Выполнить numeric audit: root X/Y, Z limits, joint limits, cycle closure, foot contacts и staff grip.
- [x] Сохранить impact/contact/hold markers для attack, super и gadget.
- [x] Добавить Mandy-specific `AimGadget` в manifest/catalog/exporter/runtime mapping.
- [x] Исправить GLTFLoader-нормализацию имени grip-marker и локальные rotation/position detached staff.
- [x] Экспортировать canonical `frontend/public/assets/heroes/output_heroes/mandy_base.glb`.
- [x] Прогнать GLB audit, frontend tests, catalog validation, build и targeted lint.
- [x] Выполнить browser harness sweep для Mandy Spawn, attack, super, gadget и AimGadget.
- [x] Зафиксировать QA evidence и ограничения в этом checklist.

## Evidence

- v3 visual calibration: right-wrist staff socket, lowered idle arms, and
  horizontal runtime staff attachment are checked in the direct harness.

- `artifacts/mandy-animation-authoring.json` — authoring report.
- `artifacts/mandy-animation-validation.json` — `PASS`, 12/12 clips, 30 fps, ranges `1..duration+1`.
- `npm test` — 182 passed, 3 skipped.
- `npm run validate:heroes` — 8 canonical runtime GLBs validated.
- `npm run validate:hero-catalog` — catalog synchronized.
- `npm run build` — passed.
- Targeted ESLint for Mandy controller/tests — passed.
- Browser screenshot `frontend/output/playwright/mandy-idle-hand-aligned.png` — staff visible vertically, grounded, attached to the left-wrist chain.
- Общий lint всё ещё содержит pre-existing ошибки в `BattleGameUI.jsx` и `StoreTab.jsx`, а также warning в `landing-page.jsx`; они не относятся к Mandy slice.
