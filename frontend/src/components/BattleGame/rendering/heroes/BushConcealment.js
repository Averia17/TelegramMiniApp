import * as THREE from "three"

export const BUSH_HERO_OPACITY = 0.8

export const getBushConcealmentMix = (current, concealed, delta) => {
  const target = concealed ? 1 : 0
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-10 * Math.max(0, delta)))
}

export const createBushOcclusion = () => {
  const group = new THREE.Group()
  group.name = "BushForegroundOcclusion"
  group.visible = false
  group.renderOrder = 8
  group.userData.role = "bush-foreground-occlusion"

  const geometry = new THREE.IcosahedronGeometry(0.31, 0)
  const placements = [
    [-0.64, 0.24, 0.25, 1.08],
    [-0.33, 0.37, 0.34, 1.2],
    [0, 0.3, 0.43, 1.3],
    [0.33, 0.38, 0.34, 1.2],
    [0.64, 0.24, 0.25, 1.08],
    [-0.5, 0.18, -0.23, 0.94],
    [0.5, 0.18, -0.23, 0.94],
    [0, 0.2, -0.34, 1.08],
  ]

  placements.forEach(([x, y, z, scale], index) => {
    const material = new THREE.MeshStandardMaterial({
      color: index % 3 === 0 ? 0x65c85f : index % 3 === 1 ? 0x3ca84e : 0x79d768,
      roughness: 0.92,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
    const leaf = new THREE.Mesh(geometry, material)
    leaf.position.set(x, y, z)
    leaf.scale.set(scale * 1.08, scale * 0.72, scale)
    leaf.rotation.set(0, index * 1.7, index % 2 ? 0.2 : -0.2)
    leaf.renderOrder = 8
    leaf.userData.baseRotationZ = leaf.rotation.z
    group.add(leaf)
  })

  return group
}

export const updateBushOcclusion = (group, mix, time) => {
  group.visible = mix > 0.01
  group.children.forEach((leaf, index) => {
    leaf.material.opacity = mix * (index < 5 ? 0.84 : 0.58)
    leaf.rotation.z = leaf.userData.baseRotationZ + Math.sin(time * 2.1 + index * 1.3) * 0.055 * mix
  })
}
