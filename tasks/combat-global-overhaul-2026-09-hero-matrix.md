# Combat 2.0 — all-hero visual matrix

Дата runtime-проверки: 2026-09-02.

Аудит запускался через `tools/qa/hero-effect-visual-audit.cjs` на локальном
Vite-сервере с frontend-only map fixture. Проверены 8 героев и 7 neutral-camp
effect states (58 capture всего), 0 console errors, 0 page errors и 0 phase
mismatches. Полный набор повторён на узком `360×740`, DPR 2 — снова 58
capture, 0 console/page errors, 0 phase mismatches и 0 effect states без VFX
roles. Это доказывает наличие и сборку визуальных композиций; это не
заменяет human gameplay sign-off, TTK и balance review.

Отдельно backend-сценарием проверено authoritative setup/payoff для gadget у
всех 8 героев; для Lumi fixture содержит цветок до detonation, чтобы проверять
реальный prerequisite, а не искусственный безусловный cast.

Дополнительно `TestScenarioPackEveryHeroReentersAfterStunRecovery` проверяет
единый failure/re-entry контракт для всех 8 героев: stun отклоняет Gadget без
списания заряда, после 500 мс recovery Gadget принимается, а следующий Basic
снова расходует ammo.

Runtime animation transition audit также прошёл для всех 8 GLB: attack overlay
смешивается с locomotion, locomotion не останавливается во время удара, а после
overlay возвращается к idle. Это не является доказательством совпадения
authored active frame с серверным impact — такой gate остаётся отдельным.

Дополнительно all-hero live skill audit через локальный WebSocket stack прошёл
8/8: каждый observedHero совпал с выбранным героем, authoritative snapshots
доставили skill effects до renderer, console/page errors отсутствуют. Это
подтверждает живой путь `client → battle service → snapshot → renderer`, но не
заменяет device FPS и human clarity review.

| Герой | Capture states | Проверяемая визуальная семантика | Статус runtime |
|---|---:|---|---|
| Needle | 11 | spores, root telegraph/zone, escape dash, cloud, pull/burst, anti-heal/stun | PASS |
| Mandy | 5 | staff swing, focus charge, дальняя wave, stance | PASS |
| Fairy Mina | 4 | directed mark hit/break, healing aura, air wave | PASS |
| Brock Zeus | 8 | beam lane, strike warning/target, lightning impact, fire trail/ground, thunderbrand | PASS |
| Kaze | 5 | cross slash, dash telegraph/impact, veil, hit-confirmed follow-up | PASS |
| Wukong Mico | 8 | staff swing, leap telegraph/impact, spin, bind, rage, armor burst, skyfall | PASS |
| Persephone Lumi | 4 | flower, roots, seed burst, root impact | PASS |
| Katty | 6 | spray direction, cloud, puddle, paint trail, impact, mark stacks | PASS |

| Neutral camps | 7 | Ash Hound charge/impact/recovery; Root Guardian telegraph/impact/zone/recovery | PASS |

## Acceptance boundary

- PASS означает: effect имеет отдельную runtime composition, phase-aware
  lifecycle и корректно создаётся в Three.js без ошибок; authoritative gadget
  coverage хранится в `TestScenarioPackGadgetAuthorityCoversEveryHero`.
- Финальный all-hero gate всё ещё требует для каждого героя: реального
  solo/team scenario, miss/interrupt/re-entry проверки, mobile FPS capture и
  минимум одного human playtest на читаемость угрозы и ответа.
- Blender master Actions в этом аудите не изменяются; проверяется только их
  подключение к существующему runtime.
