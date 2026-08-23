const TIMED_EFFECTS = [
  {id: "shield", property: "shield", label: "ЩИТ", icon: "🛡️", tone: "defense"},
  {id: "haste", property: "haste", label: "УСКОРЕНИЕ", icon: "⚡", tone: "positive"},
  {id: "lunarSpeed", property: "lunarSpeed", label: "ЛУННАЯ СКОРОСТЬ", icon: "☾", tone: "positive"},
  {id: "lunarDamage", property: "lunarDamage", label: "ЛУННЫЙ УРОН", icon: "✦", tone: "positive"},
  {id: "stealth", property: "stealth", label: "НЕВИДИМОСТЬ", icon: "◌", tone: "concealed"},
  {id: "invulnerable", property: "invulnerable", label: "ЗАЩИТА РЕСПАВНА", icon: "🛡️", tone: "defense"},
  {id: "blind", property: "blind", label: "ОСЛЕПЛЕНИЕ", icon: "☀", tone: "negative"},
  {id: "stun", property: "stun", label: "СТАН", icon: "✹", tone: "negative"},
  {id: "channel", property: "channel", label: "КАНАЛИЗАЦИЯ", icon: "◉", tone: "negative"},
  {id: "vine", property: "vine", label: "СВЯЗАН", icon: "⌁", tone: "negative"},
  {id: "vortex", property: "vortex", label: "ВОРОНКА", icon: "↻", tone: "negative"},
  {id: "flying", property: "flying", label: "В ПОЛЁТЕ", icon: "↑", tone: "positive"},
  {id: "slow", property: "slow", label: "ЗАМЕДЛЕНИЕ", icon: "❄", tone: "negative"},
  {id: "antiHeal", property: "antiHeal", label: "АНТИХИЛ", icon: "✦", tone: "negative"},
]
const MIN_VISIBLE_TIMED_EFFECT_SECONDS = 0.05

const addEffect = (effects, definition, remaining = null) => {
  effects.push({...definition, remaining})
}

export const getActiveStatusEffects = (player = {}, {inBush = false} = {}) => {
  const effects = []

  if (inBush) {
    addEffect(effects, {id: "bush", label: "СПРЯТАН В КУСТАХ", icon: "🌿", tone: "concealed"})
  }

  for (const definition of TIMED_EFFECTS) {
    const remaining = Number(player[definition.property] || 0)
    if (remaining >= MIN_VISIBLE_TIMED_EFFECT_SECONDS) addEffect(effects, definition, remaining)
  }

  if (player.lunarShield) {
    addEffect(effects, {id: "lunarShield", label: "ЛУННЫЙ ЩИТ", icon: "🌙", tone: "defense"})
  }

  if (player.poisoned) {
    addEffect(effects, {id: "poisoned", label: "ОТРАВЛЕНИЕ", icon: "☠", tone: "negative"})
  }

  const micoRage = Math.max(0, Math.min(5, Number(player.micoRage) || 0))
  if (micoRage > 0) {
    addEffect(effects, {id: "micoRage", label: `ЯРОСТЬ ${micoRage}/5`, icon: "🔥", tone: "positive"})
  }

  const lumiFlowers = Math.max(0, Math.min(5, Number(player.lumiFlowers) || 0))
  if (lumiFlowers > 0) {
    addEffect(effects, {id: "lumiFlowers", label: `ЦВЕТЫ ${lumiFlowers}/5`, icon: "✿", tone: "positive"})
  }

  const kazeCombo = Math.max(0, Math.min(2, Number(player.kazeCombo) || 0))
  if (kazeCombo > 0) {
    addEffect(effects, {id: "kazeCombo", label: `КОМБО ${kazeCombo}/2`, icon: "✕", tone: "positive"})
  }

  const minaMarks = Math.max(0, Math.min(1, Number(player.marks) || 0))
  if (minaMarks > 0) {
    addEffect(effects, {id: "minaMark", label: "МЕТКА MINA", icon: "✦", tone: "negative"})
  }

  const sporeStacks = Math.max(0, Math.min(2, Number(player.sporeStacks) || 0))
  if (sporeStacks > 0) {
    addEffect(effects, {id: "sporeStacks", label: `СПОРЫ ${sporeStacks}/3`, icon: "✺", tone: "negative"})
  }

  const paintStacks = Math.max(0, Math.min(2, Number(player.paintStacks) || 0))
  if (paintStacks > 0) {
    addEffect(effects, {id: "paintStacks", label: `КРАСКА ${paintStacks}/3`, icon: "🎨", tone: "negative"})
  }

  return effects
}
