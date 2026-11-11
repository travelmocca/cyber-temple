import * as T from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { gateFooting, pondBounds, lightModeAt } from './state.mjs'
import { autumnGrove, contactShadow, forestFloor, hangingLamp, pagoda, paperLamp, pond } from './courtyard.mjs'

const palette = {
  granite:0xb6ada0,
  wood: 0x674332, beam: 0x422e26, plaster: 0xe3d8ba, tile: 0x3d4848,
  gold: 0xddab50, grass: 0xa58262, stone: 0x767d80,
}
const material = color => new T.MeshStandardMaterial({ color, roughness: 0.88 })
const materials = Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, material(color)]))
function mesh(parent, geometry, surface, x, y, z) {
  const object = new T.Mesh(geometry, surface)
  object.position.set(x, y, z)
  parent.add(object)
  return object
}
const box = (p, m, x, y, z, w, h, d) => mesh(p, new T.BoxGeometry(w, h, d), materials[m], x, y, z)
const sphere = (p, m, x, y, z, r) => mesh(p, new T.SphereGeometry(r, 16, 12), m, x, y, z)
export const seats = Array.from({ length: 24 }, (_, i) => ({ x: (i % 6 - 2.5) * 1.42, z: -7.9 + Math.floor(i / 6) * 1.4 }))

function roof(scene, x, z, y, width, length, height = 1.7) {
  const count=Math.floor(width/.72)
  const ribs=new T.InstancedMesh(new T.BoxGeometry(.056,.075,length/10.8),materials.tile,(count*2+1)*12)
  const ridge=new T.Object3D()
  let index=0
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const offset = length * (i + 0.5) / 12
      const rise = (1 - i / 6) ** 1.65 * height
      const slab = box(scene, 'tile', x, y + rise, z + offset * side, width + i * 0.15, 0.14, length / 11)
      slab.rotation.x = side * Math.atan(height / (length / 2)) * (1.2 - i * 0.14)
      for(let rib=-count;rib<=count;rib++) {
        ridge.position.set(x+rib*.35,y+rise+.075,z+offset*side)
        ridge.rotation.x=slab.rotation.x
        ridge.updateMatrix()
        ribs.setMatrixAt(index++,ridge.matrix)
      }
    }
  }
  scene.add(ribs)
  box(scene, 'tile', x, y + height + .1, z, width + 0.45, 0.2, 0.42)
}

function hall(scene) {
  box(scene, 'stone', 0, 0.09, -6, 14.5, 0.18, 10)
  box(scene, 'wood', 0, 0.21, -6, 13.1, 0.19, 9.4)
  box(scene, 'plaster', 0, 2.36, -10.55, 13.1, 4.1, 0.18)
  for (const x of [-6.3, -3.15, 0, 3.15, 6.3]) {
    box(scene, 'beam', x, 2.36, -10.4, 0.26, 4.2, 0.26)
    if (x !== 0) box(scene, 'beam', x, 2.36, -1.55, 0.26, 4.2, 0.26)
    box(scene, 'wood', x, 4.33, -6, 0.3, 0.23, 9.3)
  }
  for (const x of [-6.3, 6.3]) {
    box(scene, 'plaster', x, 0.98, -6, 0.15, 1.4, 8.9)
    for (let z = -10; z < -2; z += 0.63) box(scene, 'wood', x, 2.6, z, 0.14, 1.85, 0.12)
  }
  box(scene, 'beam', 0, 4.48, -1.55, 13.7, 0.4, 0.35)
  const paper=material(0xb7ac8c)
  paper.emissive.setHex(0x544018)
  paper.emissiveIntensity=.65
  for(const x of [-4.7,-2.73,2.73,4.7]) {
    const z=-1.64
    mesh(scene,new T.BoxGeometry(1.85,1.37,.10),paper,x,2.74,z)
    box(scene,'wood',x,1.08,z,1.85,1.51,.13)
    for(let i=0;i<10;i++) box(scene,'beam',x+(i-4.5)*.2,2.74,z+.07,.038,1.45,.045)
    for(let i=0;i<7;i++) box(scene,'beam',x,2.74+(i-3)*.23,z+.07,1.86,.039,.048)
  }
  for(let i=0;i<7;i++) {
    const x=(i-3)*1.59
    hangingLamp(scene,x,3.63,-1.36)
    box(scene,'wood',x,4.08,-1.49,.71,.18,.58)
  }
  for(let i=0;i<3;i++) box(scene,'granite',0,.06+i*.07,-.81-i*.23,3.55,.12+i*.14,.28)
  const altarLight=new T.PointLight(0xffb055,26,8,2)
  altarLight.position.set(0,2.5,-7.8)
  scene.add(altarLight)
  roof(scene, 0, -6, 4.56, 14.5, 10.6)
  for (let i = 0; i < 25; i++) box(scene, 'wood', (i - 12) * 0.51, 0.313, -6, 0.49, 0.012, 9.05)
  box(scene, 'beam', 0, 0.47, -9.58, 4.75, 0.4, 1.62)
  box(scene, 'gold', 0, 0.72, -9.54, 2.8, 0.16, 1.25)
  const statue = new T.Group()
  statue.position.set(0, 0.83, -9.55)
  scene.add(statue)
  const gold = new T.MeshStandardMaterial({color:0xc78b35,roughness:.44,metalness:.34,emissive:0x7c4c1b,emissiveIntensity:.23})
  const gilding = new T.MeshStandardMaterial({color:0xf3c76d,roughness:.43,metalness:.26,emissive:0x815526,emissiveIntensity:.27})
  const sculpt=(x,y,z,r,sx,sy,sz,surface=gold)=>{
    const part=sphere(statue,surface,x,y,z,r)
    part.scale.set(sx,sy,sz)
    return part
  }
  const aura=mesh(statue,new T.TorusGeometry(.89,.047,10,55),gilding,0,1.56,-.38)
  aura.scale.y=1.16
  const iconBacking=material(0x532c20)
  mesh(statue,new T.BoxGeometry(2.56,2.73,.065),iconBacking,0,1.41,-.46)
  for(let i=0;i<22;i++) {
    const a=i*Math.PI/11
    const petal=sculpt(Math.cos(a)*.93,1.56+Math.sin(a)*1.06,-.36,.115,1.4,.49,.42,gilding)
    petal.rotation.z=a
  }
  sculpt(0,.21,.03,.63,1.28,.28,.84)
  for(let i=0;i<14;i++) {
    const a=i*Math.PI/7
    const petal=sculpt(Math.cos(a)*.53,.29,Math.sin(a)*.33,.133,1.55,.42,.72,gilding)
    petal.rotation.y=-a
  }
  for(const side of [-1,1]) {
    const knee=sculpt(side*.28,.48,.16,.35,1.05,.43,.87)
    knee.rotation.y=side*.28
    const arm=sculpt(side*.36,.98,.065,.19,.79,1.8,.91)
    arm.rotation.z=side*.25
    const forearm=sculpt(side*.25,.69,.33,.158,1.48,.65,.79,gilding)
    forearm.rotation.z=side*.21
    sculpt(side*.083,.7,.42,.105,1.38,.45,.83,gilding)
  }
  sculpt(0,.98,0,.42,.91,1.11,.67)
  sculpt(0,1.41,.017,.144,.89,1.22,.89,gilding)
  sculpt(0,1.72,.034,.235,.88,1.12,.88,gilding)
  for(const x of [-.206,.206]) sculpt(x,1.68,.032,.062,.55,1.44,.48,gilding)
  sculpt(0,1.674,.229,.042,.63,1.17,.71,gilding)
  for(let i=0;i<31;i++) {
    const a=i*2.39996
    const k=(i+.5)/31
    const radius=Math.sqrt(1-k*k)*.193
    sculpt(Math.cos(a)*radius,1.80+k*.17,.033+Math.sin(a)*radius,.036,1,1,1)
  }
  sculpt(0,2.009,.035,.081,1,1.05,1)
  for(let i=0;i<5;i++) {
    const points=Array.from({length:11},(_,j)=>{
      const t=j/10
      return new T.Vector3(-.36+t*.68,.73+i*.073+Math.sin(t*Math.PI)*.055+i*t*.023,.236+Math.sin(t*Math.PI)*.068)
    })
    mesh(statue,new T.TubeGeometry(new T.CatmullRomCurve3(points),16,.012,5,false),gilding,0,0,0)
  }
  for (const x of [-1.8, 1.8]) {
    box(scene, 'gold', x, 0.88, -9.43, 0.13, 0.31, 0.13)
    const flame = material(0xffd680)
    flame.emissive.setHex(0xffa43e)
    sphere(scene, flame, x, 1.08, -9.43, 0.06).scale.y = 1.7
  }
  const cushion = new RoundedBoxGeometry(1,.138,1.05,2,.055)
  const linen = [0x85877f,0x8e8d83,0x7c8179].map(color =>
    new T.MeshStandardMaterial({color,roughness:1}))
  seats.forEach(({x,z},index)=>mesh(scene,cushion,linen[index%3],x,.388,z))
  const loader=new GLTFLoader()
  return Promise.all([
    loader.loadAsync('/models/duksu-2116-seated.glb'),
    loader.loadAsync('/models/duksu-2116-standing.glb'),
  ]).then(([seated,standing])=>{
    const arrangement=new T.Group()
    arrangement.position.copy(statue.position)
    seated.scene.scale.setScalar(1.92)
    arrangement.add(seated.scene)
    for(const side of [-1,1]) {
      const figure=standing.scene.clone()
      figure.scale.setScalar(1.72)
      figure.position.set(side*1.22,0,.09)
      figure.rotation.y=-side*.14
      arrangement.add(figure)
    }
    mesh(arrangement,new T.BoxGeometry(4.1,2.83,.08),iconBacking,0,1.39,-.72)
    arrangement.add(aura)
    scene.add(arrangement)
    scene.remove(statue)
    return true
  }).catch(error=>{
    console.warn('法堂 3D 藏品加载失败',error)
    return false
  })
}

function gateRoof(scene,z) {
  const width=8.3
  const depth=1.25
  const rows=4
  const columns=18
  const height=(x,t)=>4.48-.76*t+.16*t*t+.3*(Math.abs(x)/(width/2))**6*t
  const positions=[],uvs=[],indices=[]
  for(let row=0;row<=rows*2;row++) {
    const dz=(row/rows-1)*depth
    for(let col=0;col<=columns;col++) {
      const x=(col/columns-.5)*width
      positions.push(x,height(x,Math.abs(dz)/depth),dz)
      uvs.push(col/columns,row/(rows*2))
      if(row&&col) {
        const i=row*(columns+1)+col
        indices.push(i,i-columns-1,i-1,i-1,i-columns-1,i-columns-2)
      }
    }
  }
  const surface=new T.BufferGeometry()
  surface.setAttribute('position',new T.Float32BufferAttribute(positions,3))
  surface.setAttribute('uv',new T.Float32BufferAttribute(uvs,2))
  surface.setIndex(indices)
  surface.computeVertexNormals()
  const roofMaterial=materials.tile.clone()
  roofMaterial.side=T.DoubleSide
  mesh(scene,surface,roofMaterial,0,0,z)
  for(let i=0;i<12;i++) {
    const x=(i/11-.5)*width
    const points=Array.from({length:9},(_,k)=>{
      const t=k/4-1
      return new T.Vector3(x,height(x,Math.abs(t))+.035,t*depth)
    })
    mesh(scene,new T.TubeGeometry(new T.CatmullRomCurve3(points),10,.044,6,false),materials.tile,0,0,z)
  }
}

function landscape(scene) {
  box(scene, 'grass', 0, -0.22, 0, 140, 0.4, 130)
  for (let row=0;row<18;row++) for(let column=0;column<3;column++) {
    const x=(column-1)*1.51 + Math.sin(row*7+column)*.035
    const flag=box(scene,'stone',x,.009,14.2-row*.94,1.495,.058,.92)
    flag.rotation.y=Math.sin(row*2+column)*.016
  }
  for (const x of [-gateFooting.x,gateFooting.x]) {
    box(scene,'stone',x,.12,gateFooting.z,.76,.24,.76)
    mesh(scene,new T.CylinderGeometry(.17,.2,3.33,16),materials.wood,x,1.855,gateFooting.z)
  }
  box(scene,'wood',0,3.52,gateFooting.z,6.55,.30,.68)
  box(scene,'beam',0,3.77,gateFooting.z,7.04,.13,.81)
  gateRoof(scene,gateFooting.z)
  const gateSign = document.createElement('canvas')
  gateSign.width=256
  gateSign.height=96
  const gateInk=gateSign.getContext('2d')
  gateInk.fillStyle='#25352d'
  gateInk.fillRect(0,0,256,96)
  gateInk.strokeStyle='#ae9060'
  gateInk.lineWidth=5
  gateInk.strokeRect(1,1,254,94)
  gateInk.fillStyle='#e1c99e'
  gateInk.font='bold 46px serif'
  gateInk.textAlign='center'
  gateInk.fillText('山 寺',128,62)
  const gateMap=new T.CanvasTexture(gateSign)
  gateMap.colorSpace=T.SRGBColorSpace
  mesh(scene,new T.PlaneGeometry(2.1,.65),new T.MeshBasicMaterial({map:gateMap}),0,3.465,gateFooting.z+.4)
  for (const [x,z] of [[-2.6,12.2],[2.5,10.7],[-2.3,6.2],[2.2,4.2],[-2.25,2.1],[2.3,.6],[-5.4,4.4],[5.5,6.2]]) paperLamp(scene,x,z,materials.stone)
  for (let i=0;i<7;i++) hangingLamp(scene,(i-3)*.83-.37,3.04+.36*Math.abs(i-3)/3,5.9)
  for(const [x,y,z,intensity] of [[-.45,2.5,8.2,10],[-2.55,.66,12.25,3.3],[2.5,.64,10.7,3.7]]) {
    const bounce=new T.PointLight(0xffae62,intensity,5,2)
    bounce.position.set(x,y,z)
    scene.add(bounce)
  }
  pagoda(scene,-5.24,8.1,materials.granite)
  const trees=[
    [4.8,8.1,5.7,0xa43c23],[-5.4,5.7,4.2,0xd59b36],[7,4,5.4,0xd6933d],
    [-5.2,1.7,4.7,0x9a341e],[4.6,.5,4.6,0xb85a32],[6.2,-2.8,5.6,0xd7b8aa],
    [-7.3,1.2,4.9,0xb64322],[-6.3,-2.9,5.3,0xbb522b],[9.6,5.4,5.5,0xbc752d],
    ...Array.from({length:23},(_,i)=>[Math.sin(i*2.39996)*(11+i%7),-9+Math.cos(i*2.39996)*(8+i%7),3.8+i%5*.54,[0x8e3422,0xb54824,0xd69637,0x776837][i%4]]),
  ]
  const grove=autumnGrove(scene,trees.filter(([x,z])=>Math.abs(x)>8.1||z < -14||z>1.3))
  forestFloor(scene)
  const hills = [material(0x685348),material(0x57514d),material(0x4c5150)]
  for (let i = 0; i < 18; i++) {
    const angle = i * Math.PI/9
    const hill = mesh(scene,new T.ConeGeometry(7+i%4,6+i%5*2,7),hills[i%3],Math.cos(angle)*43,1,Math.sin(angle)*43)
    hill.rotation.y = angle
  }
  box(scene,'wood',9,0.12,-1.1,5.6,0.24,4.8)
  box(scene,'plaster',9,1.62,-3.26,5.3,2.8,0.18)
  for (const x of [6.4,11.6]) {
    for (const z of [-3.15,1.05]) box(scene,'beam',x,1.66,z,0.22,3,0.22)
  }
  box(scene,'wood',9,0.65,0.85,3.2,1,0.52)
  roof(scene,9,-1.05,3.05,5.9,5.4)
  const plaque = document.createElement('canvas')
  plaque.width = 256
  plaque.height = 64
  const ink = plaque.getContext('2d')
  ink.fillStyle = '#263730'
  ink.fillRect(0,0,256,64)
  ink.font = '28px serif'
  ink.textAlign = 'center'
  ink.fillStyle = '#ead9af'
  ink.fillText('松间茶舍',128,43)
  const sign = new T.MeshBasicMaterial({map:new T.CanvasTexture(plaque)})
  mesh(scene,new T.PlaneGeometry(2.6,0.65),sign,9,2.66,1.18)
  const pool = pond(scene,pondBounds.x,pondBounds.z,pondBounds.radius)
  for(const [x,z] of [[-3.7,6.5],[3.7,4.5],[-4.6,-.2]]) {
    box(scene,'beam',x,.53,z,1.64,.12,.45)
    box(scene,'wood',x,.87,z-.18,1.64,.36,.09)
    for(const dx of [-.66,.66]) box(scene,'beam',x+dx,.25,z,.11,.5,.39)
  }
  const lanterns = []
  for (let i = 0; i < 7; i++) {
    const z = 2.6-i*.87
    for (const x of [4.95,6.15]) {
      const surface = material(0xdbae71)
      surface.emissive.setHex(0xa24d20)
      surface.emissiveIntensity = 0.33
      box(scene,'stone',x,0.015,z,0.39,0.11,0.41)
      box(scene,'wood',x,0.78,z,0.1,1.5,0.1)
      const lantern = sphere(scene,surface,x,1.48,z,0.19)
      lantern.scale.y = 0.8
      lanterns.push(lantern)
      box(scene,'beam',x,1.66,z,0.43,0.075,0.43)
    }
  }
  for (let i = 0; i < 18; i++) {
    const x = Math.sin(i*2.7) * 12
    const z = Math.cos(i*3.1) * 13
    if (Math.abs(x)<7 && z<0) continue
    const rock = mesh(scene,new T.DodecahedronGeometry(0.18 + (i%5)*0.06),materials.stone,x,0.08,z)
    rock.scale.set(1.45,0.5,0.95)
    rock.rotation.y = i
  }
  return {lanterns,pool,grove}
}

function nameplate(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#f0e8d2'
  ctx.beginPath()
  ctx.roundRect(8,4,240,56,28)
  ctx.fill()
  ctx.font = '28px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = '#35453b'
  ctx.fillText(name,128,42)
  const sprite = new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false}))
  sprite.position.y = 1.53
  sprite.scale.set(.74,.185,1)
  return sprite
}

function addSurfaceMaps() {
  const hash=(x,y)=> {
    const n=Math.sin(x*127.1+y*311.7)*43758.5453
    return n-Math.floor(n)
  }
  const noise=(x,y)=> {
    const ix=Math.floor(x), iy=Math.floor(y)
    let u=x-ix,v=y-iy
    u=u*u*(3-2*u)
    v=v*v*(3-2*v)
    return T.MathUtils.lerp(T.MathUtils.lerp(hash(ix,iy),hash(ix+1,iy),u),
      T.MathUtils.lerp(hash(ix,iy+1),hash(ix+1,iy+1),u),v)
  }
  for (const [name,base] of [['wood',[183,142,119]],['beam',[178,151,132]],['stone',[164,167,168]],['granite',[188,181,168]],['grass',[184,163,139]],['tile',[143,149,148]]]) {
    if (materials[name].map) continue
    const canvas=document.createElement('canvas')
    const size=256
    canvas.width=canvas.height=size
    const ctx=canvas.getContext('2d')
    const pixels=ctx.createImageData(size,size)
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
      const i=(y*size+x)*4
      const grain=name==='wood'||name==='beam'
      const tone=grain
        ? noise(x/2.8+noise(x/49,y/70)*5,y/112)*.55+noise(x/8,y/46)*.30+hash(x,y)*.15
        : noise(x/65,y/65)*.29+noise(x/15,y/15)*.35+noise(x/3,y/3)*.2+hash(x,y)*.16
      const mul=.60+tone*.78
      for(let k=0;k<3;k++) pixels.data[i+k]=base[k]*mul
      pixels.data[i+3]=255
    }
    ctx.putImageData(pixels,0,0)
    const texture=new T.CanvasTexture(canvas)
    texture.colorSpace=T.SRGBColorSpace
    texture.anisotropy=8
    if(name==='grass') {
      texture.wrapS=texture.wrapT=T.RepeatWrapping
      texture.repeat.set(18,18)
    }
    const relief=texture.clone()
    relief.colorSpace=T.NoColorSpace
    relief.needsUpdate=true
    materials[name].map=texture
    materials[name].bumpMap=relief
    materials[name].bumpScale=name==='grass'?.045:.026
    materials[name].needsUpdate=true
  }
}

function figure(name) {
  const root = new T.Group()
  const body = new T.Group()
  const shadow=contactShadow()
  root.add(body,nameplate(name),shadow)
  const robe=new T.MeshStandardMaterial({color:new T.Color(.4,.45,.415),roughness:.86})
  const fold=new T.MeshStandardMaterial({color:new T.Color(.34,.38,.35),roughness:.86})
  const skin=new T.MeshStandardMaterial({color:new T.Color(.79,.54,.36),roughness:.8})
  const cloth=new T.MeshStandardMaterial({color:new T.Color(.86,.56,.135),roughness:.86})
  const shoe=new T.MeshStandardMaterial({color:new T.Color(.51,.43,.32),roughness:.86})
  const ellipsoid=(group,m,x,y,z,r,sx,sy,sz) => {
    const part=sphere(group,m,x,y,z,r)
    part.scale.set(sx,sy,sz)
    return part
  }
  const tailoring=[[0,0],[.23,0],[.249,.035],[.225,.23],[.204,.42],[.17,.49],[0,.5]]
  const coat=mesh(body,new T.LatheGeometry(tailoring.map(([x,y])=>new T.Vector2(x,y)),28),robe,0,.28,0)
  coat.scale.z=.83
  const fabric=new T.BufferGeometry()
  const vertices=[]
  const indices=[]
  for(let row=0;row<9;row++) {
    const t=row/8
    for(let col=0;col<10;col++) {
      const u=col/9
      const x=(u-.5)*(.27+.095*t)+.13-t*.17
      const y=.781-t*.45+(u-.5)*(.07+t*.055)
      const z=-.155-Math.sin(Math.PI*u)*.05-t*.05+Math.sin(u*21+t*3)*.013
      vertices.push(x,y,z)
      if(row&&col) {
        const k=row*10+col
        indices.push(k-11,k-1,k,k-11,k,k-10)
      }
    }
  }
  fabric.setAttribute('position',new T.Float32BufferAttribute(vertices,3))
  fabric.setIndex(indices)
  fabric.computeVertexNormals()
  cloth.side=T.DoubleSide
  mesh(body,fabric,cloth,0,0,0)
  ellipsoid(body,skin,0,1.01,0,.248,1,1.08,1)
  ellipsoid(body,skin,0,.783,0,.09,1,1,1)
  const eyes=material(0x3c2b27)
  for(const x of [-.075,.075]) ellipsoid(body,eyes,x,1.014,.236,.016,.82,1,.56)
  ellipsoid(body,skin,0,.966,.242,.027,.8,.73,1)
  for(const x of [-.229,.229]) ellipsoid(body,skin,x,.981,.015,.049,.72,1,.65)
  const arms=[],legs=[]
  for(const sign of [-1,1]) {
    const arm=new T.Group()
    arm.position.set(sign*.185,.675,0)
    arm.rotation.z=sign*.25
    body.add(arm)
    ellipsoid(arm,robe,sign*.042,-.095,0,.103,1,1.63,.91)
    ellipsoid(arm,fold,sign*.048,-.214,0,.079,1,.41,.91)
    arms.push(arm)
    ellipsoid(arm,skin,sign*.051,-.244,.014,.056,.91,1,.94)
    const leg=new T.Group()
    leg.position.set(sign*.105,.33,0)
    root.add(leg)
    ellipsoid(leg,fold,0,-.127,0,.105,.91,1.65,1.04)
    ellipsoid(leg,shoe,0,-.277,.028,.09,1,.53,1.3)
    legs.push(leg)
  }
  return {root,body,arms,legs,shadow}
}

function animate(model, state, now) {
  const {root,body,arms,legs,shadow} = model
  root.position.set(state.x, state.z <= -1.35 && state.z >= -10.55 && Math.abs(state.x) <= 6.45 ? 0.325 : 0.08, state.z)
  shadow.position.y=root.position.y>.3?-.006:Math.abs(state.x)<1.75?-.033:-.069
  root.rotation.y = state.yaw
  const sit = state.pose === 'sit'
  const bow = state.pose === 'bow'
  const greet = state.pose === 'greet'
  const phase = bow ? 1 - Math.max(0, (state.until - Date.now()) / 4800) : 0
  const bend = bow ? Math.max(0, Math.min(1, (phase - 0.11) / 0.35, (1 - phase) / 0.37)) : 0
  body.position.y = sit ? -0.31 : -0.38 * bend
  body.rotation.x = 1.19 * bend
  arms.forEach((arm,i) => {
    const sign=i?1:-1
    arm.rotation.z=sign*(greet?-.67:.27)
    arm.rotation.x=greet?-1.43:state.pose==='walk'?Math.sin(now*.011+i*Math.PI)*.35:0
  })
  legs.forEach((leg,i) => {
    leg.rotation.x=sit?-1.21:state.pose==='walk'?Math.sin(now*.011+i*Math.PI)*.38:0
    leg.position.y=sit?.17:.33
  })
}

function batchStaticMeshes(scene) {
  const batches = new Map()
  for (const item of scene.children) {
    if (!item.isMesh || item.isInstancedMesh || item.material.transparent || item.material.isShaderMaterial) continue
    const attributes=Object.keys(item.geometry.attributes).sort().join(',')
    const key=`${item.material.uuid}:${Boolean(item.geometry.index)}:${attributes}`
    const list=batches.get(key) ?? []
    list.push(item)
    batches.set(key,list)
  }
  for(const items of batches.values()) {
    if(items.length<4) continue
    const copies=items.map(item => {
      item.updateMatrix()
      return item.geometry.clone().applyMatrix4(item.matrix)
    })
    const joined=mergeGeometries(copies)
    copies.forEach(geometry=>geometry.dispose())
    if(!joined) continue
    for(const item of items) scene.remove(item)
    scene.add(new T.Mesh(joined,items[0].material))
  }
}

export function createWorld(container) {
  const scene = new T.Scene()
  scene.background = new T.Color(0x243e4d)
  scene.fog = new T.FogExp2(0x574d47, 0.016)
  const camera = new T.PerspectiveCamera(64, 1, .08, 280)
  const renderer = new T.WebGLRenderer({antialias: true})
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.55))
  renderer.toneMapping = T.ACESFilmicToneMapping
  renderer.shadowMap.enabled=true
  renderer.shadowMap.type=T.PCFShadowMap
  renderer.shadowMap.autoUpdate=false
  renderer.shadowMap.needsUpdate=true
  container.append(renderer.domElement)
  const daylight = new T.DirectionalLight(0xffd2a4, 1.65)
  daylight.position.set(-36,34.5,32)
  daylight.target.position.set(0,0,-4)
  daylight.castShadow=true
  daylight.shadow.mapSize.set(1536,1536)
  Object.assign(daylight.shadow.camera,{left:-21,right:21,top:21,bottom:-21,near:1,far:88})
  daylight.shadow.camera.updateProjectionMatrix()
  daylight.shadow.normalBias=.045
  scene.add(daylight.target)
  const hemisphere = new T.HemisphereLight()
  const ambient = new T.AmbientLight()
  scene.add(daylight,hemisphere,ambient)
  addSurfaceMaps()
  const {lanterns,pool,grove} = landscape(scene)
  let altarReady=false
  hall(scene).then(loaded=>{
    altarReady=true
    if(loaded) {
      renderer.domElement.dataset.altar='museum-duksu-2116'
    }
  })
  batchStaticMeshes(scene)
  scene.traverse(item=>{
    if(!item.isMesh || item.material.transparent) return
    item.receiveShadow=true
    item.castShadow=[materials.wood,materials.beam,materials.tile,materials.granite].includes(item.material)
  })
  const marker = new T.Mesh(new T.RingGeometry(.26,.32,40),
    new T.MeshBasicMaterial({color:0xf5deb1,transparent:true,opacity:.8,depthWrite:false,side:T.DoubleSide}))
  marker.rotation.x=-Math.PI/2
  marker.visible=false
  scene.add(marker)
  const local = figure('我')
  scene.add(local.root)
  const peers = new Map()
  const observer = new ResizeObserver(() => {
    const {clientWidth:w,clientHeight:h} = container
    renderer.setSize(w, h)
    camera.aspect = w / Math.max(1,h)
    camera.fov = camera.aspect < .8 ? 68 : 64
    camera.updateProjectionMatrix()
  })
  observer.observe(container)
  const view = new T.Vector3()
  const aim = new T.Vector3()
  const pointer = new T.Vector2()
  const ray = new T.Raycaster()
  const ground = new T.Plane(new T.Vector3(0,1,0), -0.08)
  let reduced=false
  let renderedAt=-Infinity
  let lightMode
  let nextLightCheck=-Infinity
  function refreshLighting(now) {
    if (now < nextLightCheck) return
    nextLightCheck=now+1000
    const mode=lightModeAt(Date.now())
    if (mode===lightMode) return
    lightMode=mode
    const day=mode==='day'
    renderer.domElement.dataset.light=mode
    scene.background.setHex(day?0x8dbadc:0x243e4d)
    scene.fog.color.setHex(day?0xaabbbd:0x343a50)
    daylight.color.setHex(day?0xfff0d8:0xb2c0e5)
    daylight.intensity=day?2.08:.48
    hemisphere.color.setHex(day?0xdde6ec:0xadbcdb)
    hemisphere.groundColor.setHex(day?0xa69b85:0x8f9b8c)
    hemisphere.intensity=day?.78:.62
    ambient.color.setHex(day?0xf6eee3:0xefd2c4)
    ambient.intensity=day?.15:.42
    renderer.shadowMap.needsUpdate=!reduced
    pool.invalidate()
  }
  return {
    showWishes(wishes) {
      const colors = {琥珀:0xf4b45c,莲红:0xf07086,青绿:0x9ae3ab}
      lanterns.forEach((light,i) => {
        const wish = wishes.slice(-lanterns.length)[i]
        light.material.color.setHex(colors[wish?.color] ?? 0xdbae71)
        light.material.emissive.setHex(wish ? colors[wish.color] : 0xa24d20)
        light.material.emissiveIntensity = wish ? 0.55 : 0.33
      })
    },
    quality(low) {
      reduced=low
      renderer.shadowMap.enabled=!low
      renderer.shadowMap.needsUpdate=!low
      grove.leaves.count=low ? Math.ceil(grove.amount/2) : grove.amount
      renderer.setPixelRatio(low ? .62 : Math.min(devicePixelRatio,1.55))
    },
    canvas: renderer.domElement,
    point(x,y) {
      const box = renderer.domElement.getBoundingClientRect()
      pointer.set((x-box.left)/box.width*2-1, 1-(y-box.top)/box.height*2)
      ray.setFromCamera(pointer, camera)
      return ray.ray.intersectPlane(ground, new T.Vector3())
    },
    render(visitor, visitors, now, rotate, zoom, destination) {
      if(reduced && now-renderedAt<75) return
      renderedAt=now
      refreshLighting(now)
      animate(local, visitor, now)
      for (const [id, state] of visitors) {
        let peer = peers.get(id)
        if (!peer) {
          peer = figure(state.name ?? '访客')
          peers.set(id, peer)
          peer.motion = {x:state.x,z:state.z}
          scene.add(peer.root)
        }
        peer.motion.x = T.MathUtils.lerp(peer.motion.x,state.x,0.18)
        peer.motion.z = T.MathUtils.lerp(peer.motion.z,state.z,0.18)
        animate(peer,{...state,...peer.motion},now)
      }
      for (const [id, peer] of peers) {
        if (visitors.has(id)) continue
        scene.remove(peer.root)
        peer.root.traverse(part => {
          part.geometry?.dispose()
          part.material?.map?.dispose()
          part.material?.dispose()
        })
        peers.delete(id)
      }
      const indoor = visitor.z < -1.6
      const distance = (indoor ? 3.6 : 3.85) * zoom
      const side=Math.sin(rotate)
      const back=Math.cos(rotate)
      const portrait=camera.aspect < .8
      const eye=indoor ? 2.48 : local.root.position.y+(portrait ? 2.65 : 1.88)+Math.max(0,distance-3.85)*.22+.045
      view.set(visitor.x+side*distance,eye,visitor.z+back*distance)
      if (!camera.position.length()) camera.position.copy(view)
      camera.position.lerp(view,0.19)
      const lookHeight=indoor ? .94 : local.root.position.y+(portrait ? .85 : 1.13)-.0255
      aim.set(visitor.x-side*3,lookHeight,visitor.z-back*3)
      camera.lookAt(aim)
      marker.visible=false
      if(altarReady) pool.update(renderer,now,local.root)
      if(destination) {
        const inHall=destination.z < -1.55 && destination.z > -10.55 && Math.abs(destination.x)<6.3
        marker.position.set(destination.x,inHall?.335:.05,destination.z)
        marker.visible=true
      }
      renderer.render(scene,camera)
    },
  }
}
