export const getTauntPurchaseState = (economy = {}, buying = false) => {
  const cost = Number(economy.taunt_pack_cost ?? 10)
  const crystals = Number(economy.crystals || 0)
  const canBuy = crystals >= cost

  return {
    cost,
    canBuy,
    disabled: buying || !canBuy,
    buttonLabel: buying
      ? "ПОКУПАЕМ..."
      : canBuy
        ? "КУПИТЬ НА ДЕНЬ"
        : `НУЖНО ЕЩЁ ${cost - crystals}`,
    title: canBuy ? "Купить насмешку на 24 часа" : `Нужно ${cost} кристаллов`,
  }
}
