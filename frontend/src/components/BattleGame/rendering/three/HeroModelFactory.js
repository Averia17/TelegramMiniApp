import * as THREE from "three"

let simplifyToon = false

// A single-pass mobile toon material. Quantized diffuse light gives the hard
// painted bands; view-space rim darkening keeps silhouettes readable without
// rendering a second, inverted copy of every mesh.
const toon = (color, emissive = 0x000000) => {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: {value:new THREE.Color(color)},
      emissive: {value:new THREE.Color(emissive)},
      opacity: {value:1},
      hit: {value:0},
      rimStrength: {value:simplifyToon ? 0 : .62},
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform vec3 emissive;
      uniform float opacity;
      uniform float hit;
      uniform float rimStrength;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 lightDir = normalize(vec3(-0.45, 0.82, 0.55));
        float diffuse = dot(normalize(vNormal), lightDir) * 0.5 + 0.5;
        float band = diffuse > 0.72 ? 1.16 : (diffuse > 0.42 ? 0.94 : 0.72);
        float rim = pow(1.0 - max(0.0, dot(normalize(vNormal), normalize(vView))), 2.2);
        vec3 shaded = color * band * mix(1.0, 0.58, rim * rimStrength) + emissive * 0.42;
        shaded = mix(shaded, vec3(1.0, 0.34, 0.34), clamp(hit, 0.0, 0.78));
        gl_FragColor = vec4(shaded, opacity);
      }
    `,
  })
  Object.defineProperty(material, "opacity", {get:()=>material.uniforms.opacity.value,set:value=>{material.uniforms.opacity.value=value}})
  return material
}
const mesh = (geometry, material, x = 0, y = 0, z = 0) => {
  const value = new THREE.Mesh(geometry, material)
  value.position.set(x, y, z)
  value.castShadow = true
  value.receiveShadow = true
  return value
}
const ball = (r, material, x = 0, y = 0, z = 0, sy = 1) => {
  const value = mesh(new THREE.SphereGeometry(r, 16, 12), material, x, y, z)
  value.scale.set(1, sy, 1)
  return value
}
const box = (w, h, d, material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), material, x, y, z)
const cyl = (r, h, material, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(r, r * .86, h, 12), material, x, y, z)
const cone = (r, h, material, x = 0, y = 0, z = 0) => mesh(new THREE.ConeGeometry(r, h, 10), material, x, y, z)
const glow = color => toon(color, color)

const COLORS = {
  shelly: [0x8e55d9, 0x38245f, 0xffd44f], colt: [0xe94d56, 0x26335d, 0x5db7ff],
  barley: [0x47a7e8, 0x26364e, 0xffc93f],
  viper: [0x312c31, 0xff6b2d, 0xffdc55], titan: [0x236343, 0x55bd72, 0x58f6e9],
  shadow: [0x418c46, 0x7a3d98, 0xf4de62], spark: [0x181320, 0x4f326e, 0x7dff63],
}

const limb = (material, length = .72, radius = .15) => {
  const joint = new THREE.Group()
  const part = cyl(radius, length, material, 0, -length / 2, 0)
  joint.add(part, ball(radius * 1.12, material, 0, -length, 0))
  return joint
}

const humanoid = (root, primary, secondary, skin = toon(0xd7906d)) => {
  const hips = new THREE.Group(); hips.position.y = 1.22; root.add(hips)
  const torso = box(1.15, 1.22, .66, primary, 0, .68, 0); torso.geometry.translate(0, .12, 0); hips.add(torso)
  const head = ball(.54, skin, 0, 1.72, 0, 1.06); hips.add(head)
  const legs = [-1,1].map(side => { const g=limb(secondary,.86,.17);g.position.set(side*.3,.08,0);hips.add(g);return g })
  const arms = [-1,1].map(side => { const g=limb(primary,.78,.17);g.position.set(side*.7,1.13,0);g.rotation.z=side*.24;hips.add(g);return g })
  return {hips, torso, head, legs, arms}
}

const addEyes = (head, color = 0xffffff, visor = false) => {
  const m = glow(color)
  if (visor) { const v=box(.64,.16,.08,m,0,.04,.49);head.add(v); return }
  for(const side of [-1,1]) head.add(ball(.09,m,side*.19,.08,.49,1.12))
}

const addGun = (parent, material, accent, side = 1, length = 1.12) => {
  const gun = new THREE.Group();gun.position.set(0,-.65,.12);gun.rotation.set(Math.PI/2,0,side*.05)
  gun.add(box(.28,.3,length,material,0,0,.38),box(.12,.1,length*.72,accent,0,.17,.38),cyl(.12,.42,material,0,-.22,.18))
  parent.add(gun);return gun
}

export const createHeroModel = (heroName, options = {}) => {
  simplifyToon = Boolean(options.simple)
  const hero=String(heroName||"shelly").toLowerCase();const [a,b,c]=COLORS[hero]||COLORS.shelly
  const A=toon(a),B=toon(b),C=glow(c),dark=toon(0x171b29),metal=toon(0x6c7484),skin=toon(0xd7906d)
  const root=new THREE.Group();root.rotation.y=.42
  const bones={tails:[],orbit:[],cape:[],arms:[],legs:[],weapons:[]}

  if(hero==="viper"){
    const body=ball(.92,A,0,1.25,0,1.05);root.add(body,ball(.52,B,0,1.35,.72,1.18),ball(.28,C,0,1.4,1.2))
    const head=ball(.42,A,0,2.18,.03);root.add(head);addEyes(head,0xff9a36)
    for(const side of [-1,1]){const arm=limb(A,1.02,.35);arm.position.set(side*.88,1.72,0);arm.rotation.z=side*.56;root.add(arm);bones.arms.push(arm);const leg=limb(A,.7,.3);leg.position.set(side*.42,.67,0);root.add(leg);bones.legs.push(leg)}
    const belt=box(1.5,.26,.82,toon(0x6b482c),0,.82,0);belt.add(box(.45,.4,.12,toon(0xd49b37),0,0,.48));root.add(belt)
  }else if(hero==="shadow"){
    const body=ball(.78,A,0,1.15,0,1.18);root.add(body);body.add(ball(.11,toon(0xffffff),-.22,.12,.73,1.15),ball(.11,toon(0xffffff),.22,.12,.73,1.15),ball(.05,dark,-.2,.11,.82,1.2),ball(.05,dark,.24,.11,.82,1.2))
    const vest=box(1.35,.62,.85,B,0,1.08,.02);root.add(vest)
    for(let i=0;i<18;i+=1){const ang=i*Math.PI*2/18;const spike=cone(.07,.35,toon(0xe6efb5),Math.cos(ang)*.72,1.2+Math.sin(ang)*.85,Math.sin(ang)*.52);spike.rotation.z=-ang;root.add(spike)}
    for(const side of [-1,1]){const arm=limb(A,.7,.22);arm.position.set(side*.69,1.38,0);arm.rotation.z=side*.58;root.add(arm);bones.arms.push(arm);root.add(ball(.28,A,side*.36,.25,0,.65))}
    const flower=new THREE.Group();flower.position.set(0,2.02,0);flower.add(cyl(.07,.45,A,0,.2,0));for(let i=0;i<7;i+=1){const p=ball(.22,toon(0xef6fc0),Math.cos(i*Math.PI*2/7)*.25,.5,Math.sin(i*Math.PI*2/7)*.25,.62);flower.add(p)}flower.add(ball(.14,toon(0xffdc56),0,.52,0));root.add(flower);bones.flower=flower
  }else{
    const rig=humanoid(root,A,B,skin);Object.assign(bones,rig)
    addEyes(rig.head,hero==="spark"?c:0xffffff,hero==="titan")
    if(hero==="shelly"){
      const hair=ball(.61,toon(0x6f2c91),-.08,.23,-.04,.82);rig.head.add(hair)
      const pony=new THREE.Group();pony.position.set(-.48,.35,-.15);for(let i=0;i<4;i+=1){const piece=ball(.25,toon(i%2?0x7e359f:0x63277f),-i*.18,-i*.18,0,.8);pony.add(piece)}rig.head.add(pony);bones.tails.push(pony)
      const shotgun=addGun(rig.arms[1],dark,C,1,1.55);shotgun.scale.set(1.2,1.2,1.18);bones.weapons.push(shotgun)
    }else if(hero==="colt"){
      const hair=box(.9,.24,.84,toon(0x24355f),0,.44,-.04);rig.head.add(hair)
      const tuft=cone(.24,.72,toon(0x24355f),-.25,.73,0);tuft.rotation.z=-.5;rig.head.add(tuft)
      bones.weapons.push(addGun(rig.arms[0],dark,C,-1,.92),addGun(rig.arms[1],dark,C,1,.92))
    }else if(hero==="barley"){
      rig.head.material=metal;rig.torso.material=A;rig.legs.forEach(leg=>leg.children.forEach(child=>{if(child.material)child.material=dark}))
      rig.head.add(cyl(.55,.2,dark,0,.48,0))
      const bottle=new THREE.Group();bottle.position.set(0,-.62,.18);bottle.add(cyl(.2,.66,C,0,-.2,0),cyl(.1,.22,toon(0xd8efff),0,.23,0));rig.arms[1].add(bottle);bones.weapons.push(bottle)
    }else if(hero==="titan"){
      const hood=cone(.76,1.15,toon(0x3a9b70),0,.55,-.04);hood.material.transparent=true;hood.material.opacity=.78;rig.head.add(hood);rig.arms.forEach(x=>x.rotation.z=0);for(let i=0;i<5;i+=1){const seg=ball(.18,i%2?A:B,-.45-i*.23,-.1,-.15);root.add(seg);bones.tails.push(seg)}for(let i=0;i<3;i+=1){const disc=mesh(new THREE.TorusGeometry(.25,.07,8,18),C);root.add(disc);bones.orbit.push(disc)}
    }else if(hero==="spark"){
      const hood=cone(.68,.95,dark,0,.45,0);rig.head.add(hood);for(let i=0;i<3;i+=1){const cape=box(.52,1.25,.12,toon(0x241832),-.52+i*.52,.18,-.4);rig.hips.add(cape);bones.cape.push(cape)}const pole=cyl(.08,1.8,metal,0,-.6,0);rig.arms[1].add(pole);const blade=mesh(new THREE.TorusGeometry(.65,.1,8,24,Math.PI*.8),C,.42,-1.42,0);rig.arms[1].add(blade);bones.weapons.push(pole)
    }else{
      const mask=cone(.34,.92,toon(0xe0d5b6),0,-.05,.46);mask.rotation.x=Math.PI/2;rig.head.add(mask);rig.head.add(cyl(.56,.22,dark,0,.45,0));for(const side of [-1,1])for(let i=0;i<4;i+=1){const feather=box(.18,.72,.12,i%2?A:B,side*(.72+i*.18),.7-i*.07,-.25);feather.rotation.z=side*(.55+i*.12);rig.hips.add(feather);bones.cape.push(feather)}for(let i=-1;i<=1;i+=1)rig.torso.add(cyl(.07,.5,C,i*.2,-.05,.42));bones.weapons.push(addGun(rig.arms[1],dark,C,1,.9))
    }
  }

  root.userData.animate=(time,moving=.15,recoil=0)=>{
    const gait=Math.sin(time*7)*moving;root.position.y=Math.abs(Math.sin(time*3.5))*moving*.11+Math.sin(time*2)*.025
    bones.legs?.forEach((leg,i)=>leg.rotation.x=(i?1:-1)*gait)
    bones.arms?.forEach((arm,i)=>arm.rotation.x=(i?-1:1)*gait*.55-recoil*.2)
    bones.cape.forEach((piece,i)=>piece.rotation.x=-.12+Math.sin(time*2.5+i*.7)*.07)
    bones.tails.forEach((part,i)=>{part.rotation.z=Math.sin(time*2+i*.48)*.12})
    bones.orbit.forEach((disc,i)=>{const q=time*1.4+i*Math.PI*2/3;disc.position.set(Math.cos(q)*1.25,1.35+Math.sin(q)*.55,Math.sin(q)*.55);disc.rotation.x=q})
    if(bones.flower) bones.flower.rotation.z=Math.sin(time*2)*.1
    if(bones.umbrella) bones.umbrella.rotation.z=Math.sin(time*1.8)*.05
    if(bones.core) bones.core.rotation.set(time,time*.7,0)
  }
  root.userData.bones=bones
  simplifyToon = false
  return root
}
