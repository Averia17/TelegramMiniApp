# Референсный аудит мобильных hero-brawler игр — 2026-08

Этот документ не копирует чужие механики. Он фиксирует проверяемые принципы,
которые помогают оценивать глобальную переработку боя Telegram Mini App.

## Источники и наблюдения

### Brawl Stars

- Supercell описывает Super/Hypercharge как отдельный ресурс, который
  накапливается через попадания и затем тратится на ограниченное по времени
  усиление. Это поддерживает решение считать skill/resource loop частью
  основного боя, а не декоративным бонусом: [Hypercharges — Supercell Support]
  (https://support.supercell.com/brawl-stars/en/articles/hypercharge-4.html).
- Gadget имеет отдельное применение и cooldown; официально диапазон зависит от
  силы способности и составляет 7–30 секунд. Для нашего проекта это аргумент в
  пользу разных cooldown-профилей при обязательном понятном таймере, а не одной
  универсальной задержки: [Gadgets — Supercell Support]
  (https://support.supercell.com/brawl-stars/en/articles/gadgets-4.html).
- В официальных balance notes Supercell прямо связывает цель изменений с
  приближением Brawler-ов к 45–55% win rate и с тем, чтобы Gadgets/Star Powers
  оставались релевантными, а не превращали матч в «только Hypercharge». Это
  подтверждает, что power-budget нужно проверять outcome-метриками и
  skill-conversion, а не только raw DPS: [Release Notes October 2025]
  (https://supercell.com/en/games/brawlstars/blog/game-updates/release-notes-october-2025/).
- Game modes разделяют solo/team и objective-режимы. Следовательно, один и тот
  же герой должен иметь проверяемую ценность как в прямой дуэли, так и в
  contested objective play: [Game Modes — Supercell Support]
  (https://support.supercell.com/brawl-stars/en/articles/game-modes-12.html).

### Pokémon UNITE

- Официальное описание разделяет roster на Attacker, Speedster, All-Rounder,
  Defender и Supporter с разной комбинацией offense/endurance/mobility/support.
  Это подтверждает текущую модель hero contract cards и power-budget vectors:
  сильная сторона обязана быть выражена через роль и контр-условие, а не через
  одинаковый универсальный урон: [Pokémon UNITE roster]
  (https://unite.pokemon.com/en-us/pokemon/).
- В бою есть выбор moves/items, нейтральные существа и ресурс, который команда
  забирает у wild/objective targets и превращает в победное преимущество. Для
  нашего проекта это подтверждает смысл bats только как contested resource
  loop: camp должен создавать решение «атаковать, прикрывать, отступить или
  обменять время на HP-cube», а не быть случайным декоративным NPC:
  [Pokémon UNITE overview]
  (https://unite.pokemon.com/en-us/overview/).

## Выводы для Telegram Mini App

1. **Skill-first, но не skill-only.** Basic attack должен оставаться надёжным
   способом контакта и зарядки ресурса, однако матч должен измеримо меняться
   после правильного Super/Gadget: kill conversion, survival, control,
   support и objective metrics должны быть различимы.
2. **У каждого эффекта есть окно решения.** Cast, telegraph, impact и recovery
   должны быть видимы; у каждой сильной способности есть miss-path,
   interrupt/punish или позиционный counterplay.
3. **Cooldown — часть читаемости, а не наказание.** Атака не должна оставлять
   игрока в долгом dead-time; reload и ability cooldown проверяются отдельно.
   Изменение cooldown нельзя принимать без before/after outcome evidence.
4. **Роль важнее одинакового DPS.** Controller, Fighter, Support,
   Sharpshooter, Assassin и Tank должны выигрывать разные ситуации. Поэтому
   power-budget matrix, benchmark matchups и solo/team fairness обязательны
   одновременно.
5. **Нейтральный объект должен менять план боя.** Bats обязаны создавать
   contest/deny/retreat/reward decisions; зелёный health_boost — ограниченный
   MaxHP-only reward с ownership, cap и TTL, а не разбросанное лечение.
6. **Баланс замыкается живыми данными.** Automated scenario reports доказывают
   техническую стабильность, но не заменяют signed human clarity, исторический
   before/after и реальный staged rollout. Поэтому T13/T10 нельзя закрывать
   синтетическими ответами или придуманным win-rate.

## Сопоставление с текущим audit plan

| Референсный принцип | Реализованный контракт | Оставшаяся проверка |
| --- | --- | --- |
| Skill/resource loop | Super charge, Gadget policy, skill conversion, miss-path | Human clarity и production telemetry |
| Readable counterplay | Cast/telegraph/impact/recovery, cancel, ability events | Human status/intent acceptance |
| Distinct roles | Power-budget vector, contract cards, solo/team matrix | Historical/live role evidence |
| Contested objectives | Bat lifecycle, contest telemetry, ownership rewards | Live staged rollout |
| Balance by outcomes | TTK/cadence/skill/bot/resource metrics | Approved historical baseline и win-rate |

Эти выводы не требуют нового слоя механик поверх текущего runtime. Они
подтверждают выбранную архитектуру и уточняют, какие claims нельзя считать
закрытыми до внешних evidence gates.
