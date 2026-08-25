import * as THREE from "three"

// Keep the world-space clown noticeably smaller than a hero and its labels.
export const CLOWN_TAUNT_DISPLAY_SCALE = .75

const material = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: .5,
  metalness: .05,
  transparent: true,
  ...options,
})

const createClownFaceBillboard = () => {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 128
  canvas.height = 160
  const context = canvas.getContext("2d")
  if (!context) return null

  const circle = (x, y, radius, color) => {
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  }

  circle(25, 80, 15, "#ff5d83")
  circle(103, 80, 15, "#65d8ff")
  context.fillStyle = "#8d4de8"
  context.beginPath()
  context.moveTo(25, 49)
  context.lineTo(64, 7)
  context.lineTo(103, 49)
  context.closePath()
  context.fill()
  context.fillStyle = "#ff5d83"
  context.fillRect(24, 43, 80, 10)
  circle(64, 8, 8, "#ffd84d")

  circle(64, 84, 43, "#ffe36b")
  circle(47, 76, 11, "#ffffff")
  circle(81, 76, 11, "#ffffff")
  circle(47, 77, 5, "#17213b")
  circle(81, 77, 5, "#17213b")
  circle(64, 92, 11, "#ff405b")
  context.fillStyle = "#24152d"
  context.beginPath()
  context.ellipse(64, 113, 19, 13, 0, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = "#ff5874"
  context.beginPath()
  context.ellipse(64, 119, 10, 5, 0, 0, Math.PI * 2)
  context.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }))
  sprite.name = "ClownFaceBillboard"
  sprite.position.set(0, .34, 1.02)
  sprite.scale.set(1.48, 1.84, 1)
  sprite.renderOrder = 40
  sprite.userData.tauntTexture = texture
  return sprite
}

export const createClownTaunt = () => {
  const root = new THREE.Group()
  root.name = "ClownTaunt"
  root.visible = false
  root.position.y = 6

  const face = new THREE.Mesh(new THREE.SphereGeometry(.68, 20, 14), material(0xffe36b))
  face.scale.set(1, .94, .82)
  root.add(face)

  const eyeMaterial = material(0xffffff)
  const pupilMaterial = material(0x17213b)
  for (const x of [-.23, .23]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 8), eyeMaterial)
    eye.position.set(x, .17, .56)
    root.add(eye)
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 7), pupilMaterial)
    pupil.position.set(x, .17, .72)
    root.add(pupil)
  }

  const cheekMaterial = material(0xff6b87, {emissive: 0x6d1022, emissiveIntensity: .16})
  for (const x of [-.43, .43]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 8), cheekMaterial)
    cheek.position.set(x, -.12, .57)
    root.add(cheek)
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 10), material(0xff405b, {emissive: 0x8c1028, emissiveIntensity: .35}))
  nose.position.set(0, -.01, .76)
  root.add(nose)

  const smile = new THREE.Mesh(new THREE.TorusGeometry(.24, .055, 8, 18, Math.PI), material(0x5a2141))
  smile.position.set(0, -.31, .62)
  smile.rotation.set(Math.PI / 2, 0, Math.PI)
  root.add(smile)
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 10), material(0x24152d))
  mouth.scale.set(.92, .55, .2)
  mouth.position.set(0, -.31, .68)
  root.add(mouth)
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), material(0xff5874, {emissive: 0x781428, emissiveIntensity: .25}))
  tongue.scale.set(1, .55, .2)
  tongue.position.set(0, -.38, .73)
  root.add(tongue)

  const hat = new THREE.Mesh(new THREE.ConeGeometry(.58, .88, 12), material(0x8d4de8))
  hat.position.y = 1.03
  root.add(hat)
  const hatBand = new THREE.Mesh(new THREE.TorusGeometry(.48, .07, 8, 20), material(0xff5d83, {emissive: 0x6d1022, emissiveIntensity: .2}))
  hatBand.rotation.x = Math.PI / 2
  hatBand.position.y = .64
  root.add(hatBand)
  const hatBall = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), material(0xffd84d))
  hatBall.position.y = 1.52
  root.add(hatBall)

  const bowMaterial = material(0xff405b, {emissive: 0x8c1028, emissiveIntensity: .24})
  for (const x of [-.22, .22]) {
    const bow = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), bowMaterial)
    bow.scale.set(1.2, .72, .6)
    bow.position.set(x, -.73, .2)
    root.add(bow)
  }
  const bowCenter = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), material(0xffd84d))
  bowCenter.position.set(0, -.73, .3)
  root.add(bowCenter)

  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 7), material(index % 2 ? 0x65d8ff : 0xff5d83))
    hair.position.set(Math.cos(angle) * .69, .28 + Math.sin(angle) * .48, Math.sin(angle) * .34)
    root.add(hair)
  }

  const ring = new THREE.Mesh(new THREE.TorusGeometry(.76, .025, 8, 32), material(0xffd84d, {emissive: 0x8f5a12, emissiveIntensity: .35}))
  ring.rotation.x = Math.PI / 2
  ring.position.y = .08
  root.add(ring)
  const faceBillboard = createClownFaceBillboard()
  if (faceBillboard) root.add(faceBillboard)
  root.traverse(child => {
    if (!child.isMesh) return
    child.renderOrder = 30
    child.material.depthTest = false
    child.material.depthWrite = false
  })
  return root
}
