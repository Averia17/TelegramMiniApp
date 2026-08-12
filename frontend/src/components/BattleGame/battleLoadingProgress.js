export const getBattleLoadingProgress = ({assetsReady, connected, assetLoadError = false}) => {
  if (assetLoadError) return 100
  if (!assetsReady) return 42
  return connected ? 82 : 62
}
