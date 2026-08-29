export const disposeObjectTree = object => object?.traverse(child => {
  if (!child.geometry?.userData?.assetRegistryShared) child.geometry?.dispose?.()
  const materials = Array.isArray(child.material) ? child.material : [child.material]
  for (const material of materials) material?.dispose?.()
})
