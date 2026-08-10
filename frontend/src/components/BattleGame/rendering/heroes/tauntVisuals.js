import * as THREE from "three"

const material = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: .5,
  metalness: .05,
  ...options,
})

export const createClownTaunt = () => {
  const root = new THREE.Group()
  root.name = "ClownTaunt"
  root.visible = false
  root.position.y = 5.5

  const face = new THREE.Mesh(new THREE.SphereGeometry(.68, 20, 14), material(0xffe36b))
  face.scale.set(1, .94, .82)
  root.add(face)

  const eyeMaterial = material(0xffffff)
  const pupilMaterial = material(0x17213b)
  for (const x of [-.23, .23]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 8), eyeMaterial)
    eye.position.set(x, .15, .56)
    root.add(eye)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 7), pupilMaterial)
    pupil.position.set(x, .15, .68)
    root.add(pupil)
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 10), material(0xff4b62, {emissive: 0x6d1022, emissiveIntensity: .25}))
  nose.position.set(0, -.02, .69)
  root.add(nose)

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.22, .05, 8, 18, Math.PI), material(0x5a2141))
  mouth.position.set(0, -.29, .57)
  mouth.rotation.set(Math.PI / 2, 0, Math.PI)
  root.add(mouth)

  const hat = new THREE.Mesh(new THREE.ConeGeometry(.5, .72, 12), material(0x8d4de8))
  hat.position.y = .98
  root.add(hat)
  const hatBall = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), material(0xffd84d))
  hatBall.position.y = 1.37
  root.add(hatBall)

  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 7), material(index % 2 ? 0x65d8ff : 0xff5d83))
    hair.position.set(Math.cos(angle) * .69, .28 + Math.sin(angle) * .48, Math.sin(angle) * .34)
    root.add(hair)
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .035, 8, 32), material(0x74f4ff, {emissive: 0x1d6d8f, emissiveIntensity: .6}))
  ring.rotation.x = Math.PI / 2
  ring.position.y = .08
  root.add(ring)
  return root
}
