export const removeFinishedDeathViews = (players, actorRoot) => {
  players.forEach((view, id) => {
    if (!view.isDeathAnimationComplete?.()) return
    actorRoot.remove(view.group)
    view.dispose()
    players.delete(id)
  })
}
