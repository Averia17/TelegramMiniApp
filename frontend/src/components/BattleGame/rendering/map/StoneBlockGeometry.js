import * as THREE from "three"

const CHAMFERED_RING = [
  [-.42, -.5],
  [.24, -.5],
  [.5, -.28],
  [.5, .28],
  [.3, .5],
  [-.36, .5],
  [-.5, .22],
  [-.5, -.28],
]

const addRing = (positions, colors, scale, height, color, shade = 0) => {
  const start = positions.length / 3
  CHAMFERED_RING.forEach(([x, z]) => {
    positions.push(x * scale, height, z * scale)
    const faceShade = Math.max(-.08, Math.min(.08, shade))
    colors.push(
      Math.max(0, Math.min(1, color.r + faceShade)),
      Math.max(0, Math.min(1, color.g + faceShade)),
      Math.max(0, Math.min(1, color.b + faceShade)),
    )
  })
  return start
}

export const createStoneBlockGeometry = (variant = 0) => {
  const positions = []
  const colors = []
  const indices = []
  const lowerColor = new THREE.Color(.62, .68, .68)
  const lowerShade = variant % 2 === 0 ? -.025 : .018
  const shoulderColor = new THREE.Color(.78, .82, .79)
  const topColors = [
    new THREE.Color(.95, .94, .84),
    new THREE.Color(.84, .88, .84),
    new THREE.Color(.98, .96, .88),
  ]
  const lower = addRing(positions, colors, 1, -.5, lowerColor, lowerShade)
  const shoulder = addRing(positions, colors, .97, .24, shoulderColor, variant % 3 === 0 ? -.015 : .02)
  const top = addRing(positions, colors, .82, .5, topColors[1], variant % 2 === 0 ? .015 : -.02)
  const ridge = [
    {x: -.19 + (variant % 2) * .04, y: .6, z: -.08, color: topColors[0]},
    {x: .18, y: .56 + (variant % 3) * .015, z: .08, color: topColors[2]},
  ]
  const ridgeIndices = ridge.map(point => {
    const index = positions.length / 3
    positions.push(point.x, point.y, point.z)
    colors.push(point.color.r, point.color.g, point.color.b)
    return index
  })

  for (let index = 0; index < CHAMFERED_RING.length; index++) {
    const next = (index + 1) % CHAMFERED_RING.length
    indices.push(
      lower + index, lower + next, shoulder + next,
      lower + index, shoulder + next, shoulder + index,
      shoulder + index, shoulder + next, top + next,
      shoulder + index, top + next, top + index,
    )
  }
  const firstRidge = ridgeIndices[0]
  const secondRidge = ridgeIndices[1]
  const topRingSize = CHAMFERED_RING.length
  for (let index = 0; index < topRingSize; index++) {
    const next = (index + 1) % topRingSize
    const ridgeIndex = index < topRingSize / 2 ? firstRidge : secondRidge
    indices.push(top + index, top + next, ridgeIndex)
  }
  indices.push(top + 0, top + 4, secondRidge, top + 4, top + 0, firstRidge)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.stylizedStoneBlock = true
  geometry.userData.stoneFacets = true
  return geometry
}
