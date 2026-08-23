export const shouldSpendBattleEnergy = (messageType, {alreadySpent = false, startNewBattle = false} = {}) =>
  messageType === "start" && startNewBattle && !alreadySpent
