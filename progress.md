Original prompt: Сделать текущую карту более похожей на прежнюю: добавить траву, воду и стены, убрать дроп бустеров и сделать карту естественнее.

- RED: текущая арена содержала 24 клетки bush, а lobby автоматически создавало 12 lunar_crate.
- Готово: шумовая генерация береговой линии, внутренних водоёмов, травяных пятен и групп стен; высадки соединены с центром.
- Готово: автоспавн booster crates отключён в lobby и match; ручная механика crate/reward оставлена для совместимости.
- Проверено: `go test ./model/gamemap`, целевые `model/game`, `npm test`, `npm run build`; Playwright harness отрендерился без console errors.
- TODO: полный `go test ./...` всё ещё содержит ранее существовавшие падения combat-тестов вне этого изменения.

## Final phase HP drain

- Added a separate 60-second beacon/final phase to the match clock (total match duration is now 3:30).
- Sudden-death damage now starts with 2+ alive players, including the reported 3-player endgame.
- A lethal island tick protects the strongest current fighter from being killed by that tick, preventing an all-dead draw and leaving one survivor.
- Focused `go test ./model/game` coverage passes for duration, 3-player damage, and one-survivor resolution.
