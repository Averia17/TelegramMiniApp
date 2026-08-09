import * as THREE from "three"
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js"
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader.js"
import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js"

const palette = {
  skin: 0xc56b31, skinLight: 0xe28b45, hair: 0x2d175c, hairLight: 0x5b2b8b,
  pink: 0xd93678, pinkLight: 0xf56ca1, white: 0xfff7ef, blue: 0x168bd0,
  blueLight: 0x5bd4f4, gold: 0xf4b72c, goldLight: 0xffd96a, goldDark: 0xa76b16, dark: 0x251a38,
  crystal: 0x62e6ef, crystalPink: 0xff72c3,
}

const mat = (color, options = {}) => new THREE.MeshPhysicalMaterial({
  color,
  roughness:.53,
  metalness:.04,
  envMapIntensity:.22,
  clearcoat:.12,
  clearcoatRoughness:.28,
  ...options,
})
const materials = Object.fromEntries(Object.entries(palette).map(([name, color]) => [name, mat(color)]))
materials.crystal = mat(palette.crystal, {roughness:.2, metalness:.08, emissive:palette.crystal, emissiveIntensity:.18, transparent:true, opacity:.92})
materials.crystalPink = mat(palette.crystalPink, {roughness:.25, emissive:palette.crystalPink, emissiveIntensity:.14})

function createPatternTexture(kind) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext("2d")
  context.fillStyle = kind === "jacket" ? "#fff7ef" : "#f56ca1"
  context.fillRect(0, 0, 256, 256)
  if (kind === "jacket") {
    for (let y = 28; y < 256; y += 70) {
      for (let x = 30; x < 256; x += 74) {
        context.strokeStyle = "#ef4f92"
        context.lineWidth = 5
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = petal * Math.PI * 2 / 5
          context.beginPath()
          context.ellipse(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9, 7, 4, angle, 0, Math.PI * 2)
          context.stroke()
        }
        context.fillStyle = "#f4b72c"
        context.beginPath()
        context.arc(x, y, 4, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = "#39b957"
        context.beginPath()
        context.ellipse(x + 21, y + 18, 12, 5, -.5, 0, Math.PI * 2)
        context.fill()
      }
    }
  } else {
    context.strokeStyle = "rgba(255,245,255,.16)"
    context.lineWidth = 3
    for (let x = -256; x < 512; x += 22) {
      context.beginPath()
      context.moveTo(x, 0)
      context.lineTo(x + 256, 256)
      context.stroke()
    }
    context.strokeStyle = "rgba(142,24,82,.16)"
    context.lineWidth = 4
    for (let y = 24; y < 256; y += 48) {
      context.beginPath()
      context.moveTo(0, y)
      context.lineTo(256, y)
      context.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(1.6, 1.6)
  return texture
}

function createBadgeTexture() {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext("2d")
  context.clearRect(0, 0, 256, 256)
  context.fillStyle = "#f4b72c"
  context.beginPath()
  context.arc(128, 128, 105, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = "#d94c33"
  context.lineWidth = 10
  context.stroke()
  context.fillStyle = "#c93832"
  context.font = "900 68px Arial, sans-serif"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText("108", 128, 124)
  context.font = "900 26px Arial, sans-serif"
  context.fillText("K", 128, 184)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

materials.jacket = mat(palette.white, {map:createPatternTexture("jacket"), roughness:.72})
materials.skirt = mat(palette.pinkLight, {map:createPatternTexture("skirt"), roughness:.68})

function mesh(geometry, material, position, scale = [1, 1, 1]) {
  const item = new THREE.Mesh(geometry, material)
  item.position.set(...position)
  item.scale.set(...scale)
  item.castShadow = true
  item.receiveShadow = true
  return item
}

function sphere(material, position, scale = [1, 1, 1], segments = 20) {
  return mesh(new THREE.SphereGeometry(1, segments, Math.max(12, segments / 2)), material, position, scale)
}

function roundedBox(material, position, scale, radius = .12) {
  const [x, y, z] = scale
  return mesh(new RoundedBoxGeometry(x, y, z, 4, Math.min(radius, x / 3, y / 3, z / 3)), material, position)
}

function lathe(material, profile, position, segments = 32) {
  const points = profile.map(([radius, height]) => new THREE.Vector2(radius, height))
  return mesh(new THREE.LatheGeometry(points, segments), material, position)
}

function cylinderBetween(material, from, to, radius, segments = 16) {
  const start = new THREE.Vector3(...from)
  const end = new THREE.Vector3(...to)
  const direction = end.clone().sub(start)
  const item = mesh(new THREE.CylinderGeometry(radius, radius * 1.04, direction.length(), segments), material, [0, 0, 0])
  item.position.copy(start).add(end).multiplyScalar(.5)
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  return item
}

function addJacketFlower(parent, position) {
  for (let index = 0; index < 5; index += 1) {
    const angle = index * Math.PI * 2 / 5
    parent.add(sphere(materials.crystalPink, [position[0] + Math.cos(angle) * .1, position[1] + Math.sin(angle) * .1, position[2]], [.07, .09, .025], 12))
  }
  parent.add(sphere(materials.gold, position, [.045, .045, .025], 12))
}

function addBun(parent, x, y, z, flip = 1) {
  parent.add(sphere(materials.hair, [x, y, z], [.48, .59, .43], 24))
  parent.add(sphere(materials.hairLight, [x - .14 * flip, y + .16, z + .11], [.31, .28, .26], 18))
  parent.add(sphere(materials.hair, [x + .12 * flip, y - .18, z + .14], [.3, .34, .28], 18))
  const band = mesh(new THREE.TorusGeometry(.36, .035, 8, 20), materials.gold, [x, y - .04, z])
  band.rotation.x = Math.PI / 2
  parent.add(band)
  if (flip === 1) {
    const ribbon = roundedBox(materials.gold, [x + .42, y - .3, z + .08], [.15, .62, .07], .04)
    ribbon.rotation.z = -.12
    parent.add(ribbon)
    const ribbonTip = roundedBox(materials.goldLight, [x + .55, y - .62, z + .08], [.18, .26, .07], .04)
    ribbonTip.rotation.z = .16
    parent.add(ribbonTip)
  }
}

function createKatty() {
  const root = new THREE.Group()
  root.name = "KattyProcedural"
  const head = new THREE.Group()
  root.add(head)
  head.scale.set(.86, .86, .86)
  head.position.y = .45

  head.add(sphere(materials.hair, [0, 4.32, -.05], [.82, .76, .64], 28))
  head.add(sphere(materials.skin, [0, 4.08, .2], [.59, .67, .52], 28))
  addBun(head, -.68, 4.23, -.18, -1)
  addBun(head, .68, 4.23, -.18, 1)
  head.add(sphere(materials.hair, [0, 4.46, .43], [.72, .34, .22], 28))
  head.add(sphere(materials.hairLight, [-.28, 4.37, .53], [.19, .1, .06], 18))
  head.add(sphere(materials.hair, [-.58, 4.02, .47], [.17, .56, .14], 18))
  head.add(sphere(materials.hair, [.58, 4.02, .47], [.17, .56, .14], 18))
  head.add(sphere(materials.hair, [0, 3.93, -.3], [.7, .62, .34], 22))
  head.add(sphere(materials.hairLight, [-.42, 3.78, -.38], [.24, .42, .24], 18))
  head.add(sphere(materials.hairLight, [.42, 3.78, -.38], [.24, .42, .24], 18))
  head.add(roundedBox(materials.hairLight, [0, 3.94, -.64], [.72, .055, .035], .015))
  head.add(sphere(materials.white, [0, 4.78, .62], [.4, .31, .27], 22))
  const crownBowLeft = roundedBox(materials.blue, [-.12, 4.52, .8], [.16, .34, .08], .035)
  crownBowLeft.rotation.z = -.38
  const crownBowRight = roundedBox(materials.blue, [.12, 4.52, .8], [.16, .34, .08], .035)
  crownBowRight.rotation.z = .38
  head.add(crownBowLeft, crownBowRight)
  head.add(sphere(materials.gold, [-.2, 4.44, .86], [.1, .1, .08], 14))
  head.add(sphere(materials.gold, [.2, 4.44, .86], [.1, .1, .08], 14))

  for (const x of [-.26, .26]) {
    head.add(sphere(materials.white, [x, 4.11, .72], [.16, .23, .11], 22))
    head.add(sphere(materials.dark, [x, 4.08, .83], [.07, .12, .05], 18))
    head.add(sphere(materials.white, [x - .035, 4.16, .88], [.035, .05, .025], 12))
  }
  const browLeft = roundedBox(materials.dark, [-.27, 4.38, .7], [.28, .055, .055], .025)
  browLeft.rotation.z = -.18
  const browRight = roundedBox(materials.dark, [.27, 4.38, .7], [.28, .055, .055], .025)
  browRight.rotation.z = .18
  head.add(browLeft, browRight)
  head.add(sphere(materials.skinLight, [0, 3.94, .78], [.09, .09, .08], 14))
  head.add(sphere(materials.dark, [0, 3.82, .79], [.13, .045, .04], 14))
  head.add(sphere(materials.crystalPink, [-.47, 3.9, .7], [.11, .08, .025], 14))
  head.add(sphere(materials.crystalPink, [.47, 3.9, .7], [.11, .08, .025], 14))
  for (const side of [-1, 1]) {
    head.add(sphere(materials.gold, [side * .72, 3.98, .32], [.1, .1, .08], 14))
    const earring = roundedBox(materials.goldLight, [side * .79, 3.72, .3], [.1, .4, .06], .025)
    earring.rotation.z = side * -.12
    head.add(earring)
  }

  root.add(roundedBox(materials.jacket, [0, 2.92, 0], [.96, 1.06, .62], .2))
  root.add(lathe(materials.skirt, [[.55, 1.25], [.67, 1.34], [.7, 1.58], [.68, 1.96], [.62, 2.3], [.53, 2.52], [.42, 2.58]], [0, 0, 0]))
  root.add(lathe(materials.pinkLight, [[.17, 1.36], [.24, 1.43], [.31, 1.82], [.3, 2.32], [.23, 2.53]], [0, 0, .52], 24))
  for (const x of [-.3, 0, .3]) root.add(roundedBox(materials.pink, [x, 1.78, .57], [.025, .62, .025], .01))
  const skirtHem = mesh(new THREE.TorusGeometry(.59, .055, 10, 32), materials.pinkLight, [0, 1.27, 0], [1.08, 1, .7])
  skirtHem.rotation.x = Math.PI / 2
  root.add(skirtHem)
  root.add(cylinderBetween(materials.skin, [0, 3.38, .02], [0, 3.7, .02], .17, 16))
  root.add(roundedBox(materials.white, [0, 2.96, .39], [.46, .93, .08], .04))
  const collarLeft = roundedBox(materials.pinkLight, [-.19, 3.21, .42], [.18, .74, .08], .04)
  collarLeft.rotation.z = -.35
  const collarRight = roundedBox(materials.pinkLight, [.19, 3.21, .42], [.18, .74, .08], .04)
  collarRight.rotation.z = .35
  root.add(collarLeft, collarRight)
  addJacketFlower(root, [-.31, 3.18, .37])
  addJacketFlower(root, [.29, 3.02, .37])
  root.add(sphere(materials.blueLight, [-.56, 2.98, .38], [.1, .045, .02], 12))
  root.add(sphere(materials.blueLight, [.55, 3.28, .38], [.1, .045, .02], 12))
  root.add(roundedBox(materials.gold, [0, 2.5, .48], [.85, .12, .1], .035))
  root.add(sphere(materials.goldLight, [-.18, 2.65, .56], [.19, .12, .08], 18))
  root.add(sphere(materials.goldLight, [.18, 2.65, .56], [.19, .12, .08], 18))
  root.add(sphere(materials.gold, [0, 2.64, .58], [.1, .1, .08], 18))
  root.add(sphere(materials.gold, [-.22, 2.96, .47], [.055, .055, .045], 12))
  root.add(sphere(materials.gold, [.22, 2.82, .47], [.055, .055, .045], 12))
  const bowLeft = sphere(materials.pinkLight, [-.48, 2.42, -.44], [.42, .26, .1], 18)
  bowLeft.rotation.z = -.22
  const bowRight = sphere(materials.pinkLight, [.48, 2.42, -.44], [.42, .26, .1], 18)
  bowRight.rotation.z = .22
  root.add(bowLeft, bowRight)
  root.add(sphere(materials.pink, [0, 2.42, -.5], [.15, .15, .11], 16))
  const bowTailLeft = roundedBox(materials.pink, [-.18, 2.03, -.44], [.14, .68, .08], .04)
  bowTailLeft.rotation.z = -.08
  const bowTailRight = roundedBox(materials.pink, [.18, 2.03, -.44], [.14, .68, .08], .04)
  bowTailRight.rotation.z = .08
  root.add(bowTailLeft, bowTailRight)
  root.add(roundedBox(materials.gold, [-.45, 2.1, .57], [.16, .9, .07], .035))
  const longRibbon = roundedBox(materials.goldLight, [-.58, 2.06, .58], [.14, 1.02, .07], .035)
  longRibbon.rotation.z = -.05
  root.add(longRibbon)
  root.add(cylinderBetween(materials.blue, [0, 2.52, .55], [0, 2.28, .55], .05, 12))
  root.add(sphere(materials.white, [0, 2.18, .55], [.1, .1, .07], 16))
  root.add(roundedBox(materials.blueLight, [0, 2.08, .56], [.1, .22, .08], .025))
  root.add(roundedBox(materials.blue, [-.08, 2.06, .57], [.07, .2, .08], .02))
  root.add(roundedBox(materials.blue, [.08, 2.06, .57], [.07, .2, .08], .02))

  const sleeveL = cylinderBetween(materials.jacket, [-.42, 3.17, .08], [-.72, 2.86, .24], .25, 18)
  const sleeveR = cylinderBetween(materials.jacket, [.42, 3.17, .08], [.72, 2.86, .18], .25, 18)
  root.add(sleeveL, sleeveR)
  root.add(sphere(materials.blue, [-.72, 2.86, .18], [.27, .23, .26], 18))
  root.add(sphere(materials.blue, [.72, 2.86, .18], [.27, .23, .26], 18))
  root.add(cylinderBetween(materials.skinLight, [-.74, 2.76, .28], [-.78, 2.35, .7], .12, 16))
  root.add(cylinderBetween(materials.skinLight, [.76, 2.77, .25], [1.02, 2.7, .43], .12, 16))
  root.add(sphere(materials.skinLight, [-.78, 2.29, .76], [.15, .16, .13], 18))
  root.add(sphere(materials.skinLight, [1.04, 2.7, .45], [.15, .16, .13], 18))
  for (let finger = 0; finger < 4; finger += 1) root.add(cylinderBetween(materials.skinLight, [-.82 + finger * .07, 2.25, .76], [-.9 + finger * .08, 2.1 - finger * .015, .84], .028, 10))
  addJacketFlower(root, [-.47, 2.96, .36])
  addJacketFlower(root, [.47, 2.82, .36])
  root.add(sphere(materials.blueLight, [-.4, 3.25, .37], [.08, .04, .025], 12))
  root.add(sphere(materials.blueLight, [.4, 3.12, .37], [.08, .04, .025], 12))

  root.add(cylinderBetween(materials.skinLight, [-.3, .7, .12], [-.3, 1.35, .12], .13, 16))
  root.add(cylinderBetween(materials.skinLight, [.3, .7, .12], [.3, 1.35, .12], .13, 16))
  root.add(roundedBox(materials.blue, [-.3, .65, .14], [.42, .26, .62], .08))
  root.add(roundedBox(materials.blue, [.3, .65, .14], [.42, .26, .62], .08))
  root.add(roundedBox(materials.white, [-.3, .77, .48], [.43, .23, .31], .08))
  root.add(roundedBox(materials.white, [.3, .77, .48], [.43, .23, .31], .08))
  root.add(roundedBox(materials.gold, [-.3, .52, .14], [.5, .08, .7], .03))
  root.add(roundedBox(materials.gold, [.3, .52, .14], [.5, .08, .7], .03))

  const candyBlaster = new THREE.Group()
  candyBlaster.name = "MandyStyleCandyBlaster"
  candyBlaster.add(cylinderBetween(materials.white, [1.02, 2.7, .52], [.55, 1.62, .52], .17, 18))
  candyBlaster.add(cylinderBetween(materials.blue, [.55, 1.62, .52], [-.28, .78, .52], .16, 18))
  candyBlaster.add(sphere(materials.pinkLight, [-.46, .5, .52], [.54, .46, .4], 24))
  candyBlaster.add(mesh(new THREE.TorusGeometry(.47, .055, 10, 28), materials.blue, [-.46, .5, .56]))
  candyBlaster.add(sphere(materials.gold, [-.46, .5, .9], [.24, .24, .08], 18))
  candyBlaster.add(mesh(new THREE.CircleGeometry(.2, 32), mat(palette.white, {map:createBadgeTexture(), roughness:.48}), [-.46, .5, .985]))
  candyBlaster.add(roundedBox(materials.crystalPink, [-.46, .17, .58], [.16, .34, .1], .045))
  candyBlaster.add(sphere(materials.blueLight, [-.73, .24, .58], [.1, .1, .08], 14))
  candyBlaster.add(sphere(materials.blueLight, [-.19, .24, .58], [.1, .1, .08], 14))
  root.add(candyBlaster)
  root.userData.animate = time => {
    root.position.y = Math.sin(time * 2.1) * .025
    head.rotation.z = Math.sin(time * 1.35) * .012
    candyBlaster.rotation.z = Math.sin(time * 1.7) * .008
  }
  root.userData.height = 5.1
  return root
}

function createScene(element, kind) {
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:"high-performance"})
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  element.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture
  scene.environmentIntensity = .22
  pmrem.dispose()
  const camera = new THREE.PerspectiveCamera(31, 1, .1, 30)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 7.2
  controls.maxDistance = 13
  controls.target.set(0, 2.45, 0)
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x523b4b, 2.4))
  const key = new THREE.DirectionalLight(0xfff8ea, 3.3)
  key.position.set(-4, 8, 6)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 7; key.shadow.camera.bottom = -1
  scene.add(key)
  const rim = new THREE.DirectionalLight(kind === "katty" ? palette.crystal : 0xffc17c, 2.2)
  rim.position.set(4, 4, -5)
  scene.add(rim)
  const floor = mesh(new THREE.CircleGeometry(3.15, 64), mat(kind === "katty" ? 0xd88339 : 0xc96d4c, {roughness:1}), [0, .03, 0])
  floor.rotation.x = -Math.PI / 2
  floor.scale.y = .5
  floor.receiveShadow = true
  scene.add(floor)
  let model = kind === "katty" ? createKatty() : new THREE.Group()
  scene.add(model)
  const mixer = kind === "mandy" ? {value:null} : null
  const runtime = {model}
  let angle = 0
  let frameSync = null

  const getModelMetrics = () => {
    runtime.model.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(runtime.model)
    if (bounds.isEmpty()) return null
    return {
      min: bounds.min.clone(),
      max: bounds.max.clone(),
      size: bounds.getSize(new THREE.Vector3()),
    }
  }

  const applyFrame = ({target, distance, yaw = angle}) => {
    angle = yaw
    const direction = new THREE.Vector3(Math.sin(angle), .02, Math.cos(angle)).normalize()
    camera.position.copy(target).addScaledVector(direction, distance)
    controls.target.copy(target)
    controls.minDistance = Math.max(2, distance * .62)
    controls.maxDistance = Math.max(8, distance * 1.8)
    controls.update()
  }

  const frameModel = () => {
    const metrics = getModelMetrics()
    if (!metrics) return
    const {size, min, max} = metrics
    const verticalFov = THREE.MathUtils.degToRad(camera.fov)
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
    const distance = Math.max(
      size.y / 2 / Math.tan(verticalFov / 2),
      size.x / 2 / Math.tan(horizontalFov / 2),
      size.z / 2 / Math.tan(verticalFov / 2),
    ) * 1.16
    const target = new THREE.Vector3((min.x + max.x) / 2, min.y + size.y * .52, (min.z + max.z) / 2)
    applyFrame({target, distance})
  }

  const resize = () => {
    const width = Math.max(1, element.clientWidth)
    const height = Math.max(1, element.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (frameSync) frameSync()
    else frameModel()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(element)
  resize()
  const setAngle = preset => {
    angle = preset.yaw
    runtime.model.rotation.y = 0
    frameModel()
  }
  const setAngleOnly = preset => {
    angle = preset.yaw
    runtime.model.rotation.y = 0
  }
  const setFrameSync = callback => { frameSync = callback }
  setAngle({yaw:Math.PI * .62, pitch:.04})
  let frameTime = performance.now()
  renderer.setAnimationLoop(now => {
    const delta = Math.min(.05, (now - frameTime) / 1000)
    frameTime = now
    controls.update()
    runtime.model.userData.animate?.(now / 1000, delta)
    mixer?.value?.update(delta)
    renderer.render(scene, camera)
  })
  return {renderer, scene, model, camera, controls, mixer, runtime, setAngle, setAngleOnly, setFrameSync, getModelMetrics, applyFrame, frameModel, destroy:() => { observer.disconnect(); renderer.setAnimationLoop(null); controls.dispose(); renderer.dispose(); element.removeChild(renderer.domElement) }}
}

function loadMandy(sceneRuntime, onLoaded) {
  new GLTFLoader().load("/assets/heroes/output_heroes/mandy_base.glb", gltf => {
    const model = gltf.scene
    model.rotation.y = 0
    model.traverse(item => { if (item.isMesh) { item.castShadow = true; item.receiveShadow = true } })
    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    model.scale.setScalar(4.95 / size.y)
    model.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(model)
    const center = fitted.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.z -= center.z
    model.position.y -= fitted.min.y - .03
    sceneRuntime.scene.remove(sceneRuntime.model)
    sceneRuntime.scene.add(model)
    sceneRuntime.model = model
    sceneRuntime.runtime.model = model
    sceneRuntime.frameModel()
    onLoaded?.()
    const clip = gltf.animations.find(item => /idle/i.test(item.name)) || gltf.animations[0]
    if (clip) { const mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play(); sceneRuntime.mixer.value = mixer }
  })
}

export function mountKattyLab({referenceElement, proceduralElement}) {
  if (!referenceElement || !proceduralElement) return () => {}
  const mandy = createScene(referenceElement, "mandy")
  const katty = createScene(proceduralElement, "katty")
  let activePreset = {yaw:Math.PI * .62, pitch:.04}
  const syncCameras = () => {
    const mandyMetrics = mandy.getModelMetrics()
    const kattyMetrics = katty.getModelMetrics()
    if (!mandyMetrics || !kattyMetrics) return
    const metrics = [mandyMetrics, kattyMetrics]
    const maxHeight = Math.max(...metrics.map(item => item.size.y))
    const maxHalfX = Math.max(...metrics.map(item => Math.max(Math.abs(item.min.x), Math.abs(item.max.x))))
    const maxHalfZ = Math.max(...metrics.map(item => Math.max(Math.abs(item.min.z), Math.abs(item.max.z))))
    const verticalFov = THREE.MathUtils.degToRad(mandy.camera.fov)
    const verticalDistance = maxHeight / 2 / Math.tan(verticalFov / 2)
    const horizontalDistances = [mandy.camera, katty.camera].map(camera => {
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect)
      return maxHalfX / Math.tan(horizontalFov / 2)
    })
    const distance = Math.max(verticalDistance, ...horizontalDistances, maxHalfZ / Math.tan(verticalFov / 2)) * 1.16
    const target = new THREE.Vector3(0, Math.max(...metrics.map(item => item.min.y + item.size.y * .52)), 0)
    const frame = {target, distance, yaw:activePreset.yaw}
    mandy.applyFrame(frame)
    katty.applyFrame(frame)
  }
  mandy.setFrameSync(syncCameras)
  katty.setFrameSync(syncCameras)
  const setAngle = preset => {
    activePreset = preset
    mandy.setAngleOnly(preset)
    katty.setAngleOnly(preset)
    syncCameras()
  }
  loadMandy(mandy, syncCameras)
  const api = {setAngle, syncCameras}
  const destroy = () => { mandy.destroy(); katty.destroy() }
  destroy.api = api
  return destroy
}
