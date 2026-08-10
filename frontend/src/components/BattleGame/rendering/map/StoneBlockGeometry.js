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

const addRing = (positions, colors, scale, height, color) => {
  const start = positions.length / 3
  CHAMFERED_RING.forEach(([x, z]) => {
    positions.push(x * scale, height, z * scale)
    colors.push(color.r, color.g, color.b)
  })
  return start
}

export const createStoneBlockGeometry = () => {
  const positions = []
  const colors = []
  const indices = []
  const lowerColor = new THREE.Color(.62, .68, .68)
  const shoulderColor = new THREE.Color(.78, .82, .79)
  const topColors = [
    new THREE.Color(.95, .94, .84),
    new THREE.Color(.84, .88, .84),
    new THREE.Color(.98, .96, .88),
  ]
  const lower = addRing(positions, colors, 1, -.5, lowerColor)
  const shoulder = addRing(positions, colors, .97, .28, shoulderColor)
  const top = addRing(positions, colors, .82, .5, topColors[1])
  const topCenter = positions.length / 3
  positions.push(.04, .58, -.02)
  colors.push(topColors[0].r, topColors[0].g, topColors[0].b)

  for (let index = 0; index < CHAMFERED_RING.length; index++) {
    const next = (index + 1) % CHAMFERED_RING.length
    indices.push(
      lower + index, lower + next, shoulder + next,
      lower + index, shoulder + next, shoulder + index,
      shoulder + index, shoulder + next, top + next,
      shoulder + index, top + next, top + index,
      top + index, top + next, topCenter,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.userData.stylizedStoneBlock = true
  geometry.userData.stoneFacets = true
  return geometry
}
