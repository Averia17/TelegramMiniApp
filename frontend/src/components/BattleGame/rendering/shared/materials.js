import * as THREE from "three"

export const flatMaterial = (color, options = {}) =>
  new THREE.MeshBasicMaterial({color, ...options})

let contactShadowTexture = null

const getContactShadowTexture = () => {
  if (contactShadowTexture) return contactShadowTexture
  const size = 32
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + .5) / size * 2 - 1
      const dy = (y + .5) / size * 2 - 1
      const distance = Math.min(1, Math.hypot(dx, dy))
      const alpha = Math.round(Math.pow(1 - distance, 1.8) * 255)
      const offset = (y * size + x) * 4
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = alpha
    }
  }
  contactShadowTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  contactShadowTexture.needsUpdate = true
  contactShadowTexture.minFilter = THREE.LinearFilter
  contactShadowTexture.magFilter = THREE.LinearFilter
  return contactShadowTexture
}

export const createContactShadow = radius => {
  const material = flatMaterial(0x172238, {
    map: getContactShadowTexture(),
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.018
  mesh.scale.y = 0.48
  mesh.userData.role = "contact-shadow"
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
