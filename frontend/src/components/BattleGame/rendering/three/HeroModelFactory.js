import * as THREE from "three"

const toon = (color, emissive = 0x000000) => new THREE.MeshToonMaterial({color, emissive, emissiveIntensity: emissive ? .5 : 0})
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
  blaze: [0x343849, 0xc64bff, 0x62f3ff], frost: [0xeaf5ff, 0x2392d1, 0x54f2ff],
  viper: [0x312c31, 0xff6b2d, 0xffdc55], titan: [0x236343, 0x55bd72, 0x58f6e9],
  shadow: [0x418c46, 0x7a3d98, 0xf4de62], spark: [0x181320, 0x4f326e, 0x7dff63],
  nova: [0xf379c4, 0x325c9b, 0x70eaff], rex: [0x25283a, 0x9d2948, 0x4bc7ff],
  pixel: [0xd83b3b, 0x3377c9, 0xffdf4b], boulder: [0x302a34, 0x544034, 0x65e357],
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

export const createHeroModel = heroName => {
  const hero=String(heroName||"blaze").toLowerCase();const [a,b,c]=COLORS[hero]||COLORS.blaze
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
    const rig=humanoid(root,A,B,hero==="pixel"?metal:skin);Object.assign(bones,rig)
    if(!["pixel"].includes(hero)) addEyes(rig.head,hero==="spark"||hero==="boulder"?c:0xffffff,hero==="titan")
    if(hero==="blaze"){
      const hair=ball(.58,toon(0x61205e),-.12,.18,-.04,.72);rig.head.add(hair);for(let i=0;i<3;i+=1){const cape=box(.46,1.35,.12,toon([0x71258e,0x9f30bb,0xd33ce0][i]),-.45+i*.45,.26,-.37);cape.rotation.z=(i-1)*.12;rig.hips.add(cape);bones.cape.push(cape)}bones.weapons.push(addGun(rig.arms[1],dark,C,1,1.45))
    }else if(hero==="frost"){
      const hair=new THREE.Group();hair.position.set(0,.5,0);for(let i=0;i<6;i+=1){const p=cone(.18,.65,toon(0xf13b9b),(i-2.5)*.13,.22+Math.abs(i-2.5)*.05,0);p.rotation.z=(i-2.5)*-.16;hair.add(p)}rig.head.add(hair);bones.weapons.push(addGun(rig.arms[0],dark,C,-1),addGun(rig.arms[1],dark,C,1))
    }else if(hero==="titan"){
      const hood=cone(.76,1.15,toon(0x3a9b70),0,.55,-.04);hood.material.transparent=true;hood.material.opacity=.78;rig.head.add(hood);rig.arms.forEach(x=>x.rotation.z=0);for(let i=0;i<5;i+=1){const seg=ball(.18,i%2?A:B,-.45-i*.23,-.1,-.15);root.add(seg);bones.tails.push(seg)}for(let i=0;i<3;i+=1){const disc=mesh(new THREE.TorusGeometry(.25,.07,8,18),C);root.add(disc);bones.orbit.push(disc)}
    }else if(hero==="spark"){
      const hood=cone(.68,.95,dark,0,.45,0);rig.head.add(hood);for(let i=0;i<3;i+=1){const cape=box(.52,1.25,.12,toon(0x241832),-.52+i*.52,.18,-.4);rig.hips.add(cape);bones.cape.push(cape)}const pole=cyl(.08,1.8,metal,0,-.6,0);rig.arms[1].add(pole);const blade=mesh(new THREE.TorusGeometry(.65,.1,8,24,Math.PI*.8),C,.42,-1.42,0);rig.arms[1].add(blade);bones.weapons.push(pole)
    }else if(hero==="nova"){
      rig.legs.forEach(x=>x.visible=false);for(let i=0;i<4;i+=1){const skirt=mesh(new THREE.CylinderGeometry(.5+i*.15,.8+i*.2,.32,24),toon([0xf6a1da,0xee79c6,0xd955ad,0xa83c91][i]),0,.55-i*.23,0);rig.hips.add(skirt)}const umbrella=new THREE.Group();umbrella.position.set(.65,1.15,.1);umbrella.add(cyl(.05,1.55,B,0,-.55,0),mesh(new THREE.SphereGeometry(.74,18,8,0,Math.PI*2,0,Math.PI/2),B,0,.25,0));rig.hips.add(umbrella);bones.umbrella=umbrella;addGun(rig.arms[1],B,C,1,1.35)
    }else if(hero==="rex"){
      const hair=ball(.57,dark,-.08,.18,0,.75);rig.head.add(hair);for(const side of [-1,1]){let parent=rig.hips;for(let i=0;i<7;i+=1){const segment=new THREE.Group();segment.position.set(i?0:side*.52,i?-.02:.86,i?0:-.2);const part=cyl(.13,.48,i%2?metal:dark,0,.24,0);part.rotation.z=side*.62;segment.add(part,ball(.18,C,side*.14,.42,0));parent.add(segment);parent=segment;bones.tails.push(segment)}}
    }else if(hero==="pixel"){
      rig.torso.material=B;rig.arms[0].children[0].material=toon(0xd83b3b);rig.arms[1].children[0].material=toon(0x3377c9);addEyes(rig.head,c);rig.head.add(box(.7,.16,.12,toon(0xffdf4b),0,.07,.48));const core=box(.36,.36,.36,C,0,.65,.42);rig.hips.add(core);bones.core=core
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
  return root
}
