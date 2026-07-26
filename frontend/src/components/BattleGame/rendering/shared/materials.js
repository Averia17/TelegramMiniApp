import * as THREE from "three"

export const flatMaterial = (color, options = {}) =>
  new THREE.MeshBasicMaterial({color, ...options})

export const createContactShadow = radius => {
  const material = flatMaterial(0x172238, {
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.025
  mesh.scale.y = 0.42
  return mesh
}

export const createColoredBox = (width, height, depth, color) => {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  const base = new THREE.Color(color)
  const normal = geometry.getAttribute("normal")
  const colors = []

  for (let index = 0; index < normal.count; index++) {
    const normalY = normal.getY(index)
    const normalX = normal.getX(index)
    const shade = normalY > 0.5 ? 1.22 : normalY < -0.5 ? 0.55 : normalX > 0.5 ? 0.72 : 0.88
    const face = base.clone().multiplyScalar(shade)
    colors.push(face.r, face.g, face.b)
  }

  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({vertexColors: true}))
}
