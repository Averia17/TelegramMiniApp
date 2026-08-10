export const getTauntPurchaseState = (economy = {}, buying = false) => {
  const cost = Number(economy.taunt_pack_cost ?? 10)
  const charges = Number(economy.taunt_pack_charges ?? 10)
  const crystals = Number(economy.crystals || 0)
  const canBuy = crystals >= cost

  return {
    cost,
    charges,
    canBuy,
    disabled: buying || !canBuy,
    buttonLabel: buying
      ? "ПОКУПАЕМ..."
      : canBuy
        ? `КУПИТЬ ${charges}`
        : `НУЖНО ЕЩЁ ${cost - crystals}`,
    title: canBuy ? "Купить пакет насмешек" : `Нужно ${cost} кристаллов`,
  }
}
