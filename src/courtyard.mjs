import * as T from 'three'

const dummy = new T.Object3D()
function random(seed) {
  return () => {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0
    return seed / 4294967296
  }
}
const paint = (color, roughness = .92) => new T.MeshStandardMaterial({color,roughness})
function put(group,geometry,material,x,y,z) {
  const item = new T.Mesh(geometry,material)
  item.position.set(x,y,z)
  group.add(item)
  return item
}
const box = (g,m,x,y,z,w,h,d) => put(g,new T.BoxGeometry(w,h,d),m,x,y,z)
const glow = new T.MeshBasicMaterial({color:0xffe5a7})
const frame = paint(0x49241a)
const metal = paint(0x303132)
const lampCanvas = document.createElement('canvas')
lampCanvas.width = lampCanvas.height = 128
const lampInk = lampCanvas.getContext('2d')
const gradient = lampInk.createRadialGradient(64,64,0,64,64,64)
gradient.addColorStop(0,'rgba(255,200,111,.48)')
gradient.addColorStop(.32,'rgba(255,155,66,.27)')
gradient.addColorStop(1,'rgba(255,128,45,0)')
lampInk.fillStyle = gradient
lampInk.fillRect(0,0,128,128)
const poolMaterial = new T.MeshBasicMaterial({map:new T.CanvasTexture(lampCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})
export function paperLamp(scene,x,z,stone) {
  box(scene,stone,x,.085,z,.76,.17,.76)
  box(scene,frame,x,.22,z,.56,.1,.56)
  box(scene,glow,x,.49,z,.39,.47,.39)
  for(const dx of [-.21,.21]) for(const dz of [-.21,.21]) box(scene,frame,x+dx,.49,z+dz,.055,.54,.055)
  box(scene,frame,x,.75,z,.57,.09,.57)
  const cap = put(scene,new T.CylinderGeometry(.15,.43,.12,4),metal,x,.85,z)
  cap.rotation.y=Math.PI/4
  const pool = put(scene,new T.PlaneGeometry(3.3,3.3),poolMaterial,x,.021,z)
  pool.rotation.x=-Math.PI/2
}
export function hangingLamp(scene,x,y,z) {
  const flower = new T.Group()
  flower.position.set(x,y,z)
  scene.add(flower)
  const outer = new T.MeshStandardMaterial({color:0xffbc91,emissive:0xe9743a,emissiveIntensity:.66,roughness:.65})
  const inner = new T.MeshStandardMaterial({color:0xffdfae,emissive:0xffa95e,emissiveIntensity:.72,roughness:.65})
  const petal = new T.SphereGeometry(.17,12,10)
  for (let i=0;i<14;i++) {
    const a=i*Math.PI/3.5
    const r=i<7?.145:.095
    const p=put(flower,petal,i<7?outer:inner,Math.sin(a)*r,i<7?0:.12,Math.cos(a)*r)
    p.scale.set(.58,1.25,.46)
    p.rotation.set(Math.cos(a)*.49,0,-Math.sin(a)*.49)
  }
  box(flower,frame,0,.37,0,.014,.52,.014)
}
export function pagoda(scene,x,z,stone) {
  for (const [h,w,y] of [[.18,3.25,.1],[.19,2.89,.27],[.28,2.6,.5],[.23,2.34,.72]]) box(scene,stone,x,y,z,w,h,w)
  for (let i=0;i<4;i++) {
    const width=2.3-i*.39
    const y=.8+i*.76
    box(scene,stone,x,y+.24,z,width*.66,.55,width*.66)
    const eave = put(scene,new T.CylinderGeometry(width*.53,width*.74,.24,4),stone,x,y+.6,z)
    eave.rotation.y=Math.PI/4
    box(scene,stone,x,y+.5,z,width,.11,width)
  }
  put(scene,new T.SphereGeometry(.23,12,8),stone,x,4.02,z)
}
export function autumnGrove(scene,trees) {
  const rand=random(216)
  const bark=paint(0x473028)
  const branch=new T.CylinderGeometry(.48,1,1,8)
  const up=new T.Vector3(0,1,0)
  const vector=new T.Vector3()
  function limb(a,b,r) {
    vector.subVectors(b,a)
    const twig=put(scene,branch,bark,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2)
    twig.quaternion.setFromUnitVectors(up,vector.clone().normalize())
    twig.scale.set(r,vector.length(),r)
  }
  const shape=new T.Shape()
  shape.moveTo(0,-.5)
  for(const [x,y] of [[-.23,-.24],[-.48,-.13],[-.36,.03],[-.54,.27],[-.19,.17],[-.27,.43],[-.09,.34],[0,.63],[.11,.34],[.31,.45],[.2,.17],[.53,.29],[.37,.01],[.47,-.12],[.2,-.28]]) shape.lineTo(x,y)
  shape.closePath()
  const leafMaterial=new T.MeshStandardMaterial({color:0xffffff,roughness:.93,side:T.DoubleSide,emissive:0x432313,emissiveIntensity:.3})
  const leaves=new T.InstancedMesh(new T.ShapeGeometry(shape),leafMaterial,trees.length*440)
  const color=new T.Color()
  let index=0
  const amount=trees.length*440
  for(const [x,z,h,tint] of trees) {
    const base=new T.Vector3(x,0,z)
    const middle=new T.Vector3(x+.21,h*.63,z+.2)
    const tip=new T.Vector3(x-.23,h,z+.09)
    limb(base,middle,h*.036)
    limb(middle,tip,h*.024)
    for(let b=0;b<8;b++) {
      const a=b*2.39996+rand()
      const length=h*(.18+rand()*.19)
      const from=new T.Vector3(x+.14,h*(.42+rand()*.34),z+.1)
      const end=from.clone().add(new T.Vector3(Math.cos(a)*length,h*.16,Math.sin(a)*length))
      limb(from,end,h*.012)
      for(let j=0;j<55;j++) {
        const az=rand()*Math.PI*2
        const radial=Math.sqrt(rand())*h*.22
        dummy.position.set(end.x+Math.cos(az)*radial,end.y+(rand()-.4)*h*.26,end.z+Math.sin(az)*radial)
        const scale=.13+rand()*.23
        dummy.scale.setScalar(scale)
        dummy.rotation.set(rand()*6.28,rand()*6.28,rand()*6.28)
        dummy.updateMatrix()
        const slot=index%2 ? Math.ceil(amount/2)+Math.floor(index/2) : index/2
        leaves.setMatrixAt(slot,dummy.matrix)
        color.setHex(tint).multiplyScalar(.52+rand()*.64)
        leaves.setColorAt(slot,color)
        index++
      }
    }
  }
  scene.add(leaves)
  return {leaves,amount}
}

export function pond(scene,x,z,radius) {
  const environment = new T.WebGLCubeRenderTarget(128,{
    generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter,magFilter:T.LinearFilter,
  })
  const probe = new T.CubeCamera(.08,80,environment)
  probe.position.set(x,.25,z)
  const shader=new T.ShaderMaterial({
    uniforms:{time:{value:0},environment:{value:environment.texture},ready:{value:false}},
    vertexShader:`varying vec2 surface;
      varying vec3 worldPoint;
      void main() {
        surface=position.xy;
        worldPoint=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader:`uniform float time;
      uniform samplerCube environment;
      uniform bool ready;
      varying vec2 surface;
      varying vec3 worldPoint;
      void main() {
        float d=length(surface);
        float waveA=cos(surface.y*19.+surface.x*2.-time*1.4);
        float waveB=cos(surface.x*12.-surface.y*4.+time*.84);
        vec3 normal=normalize(vec3(waveB*.026,1.,waveA*.036));
        vec3 view=normalize(cameraPosition-worldPoint);
        vec3 ray=reflect(-view,normal);
        vec3 base=vec3(.032,.107,.099);
        vec3 reflected=ready?textureCube(environment,ray,1.2).rgb:base;
        float fresnel=.13+.59*pow(1.-clamp(dot(normal,view),0.,1.),2.1);
        vec3 color=mix(base,reflected,fresnel);
        color=mix(color,vec3(.15,.11,.071),smoothstep(3.8,4.19,d)*.7);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const water=put(scene,new T.CircleGeometry(radius,70),shader,x,.018,z)
  water.rotation.x=-Math.PI/2
  const pad=paint(0x526d3b)
  const rand=random(84)
  for(let i=0;i<34;i++) {
    const a=rand()*6.28
    const r=Math.sqrt(rand())*3.6
    const leaf=put(scene,new T.CircleGeometry(.15+rand()*.25,13,.25,5.8),pad,x+Math.cos(a)*r,.034,z+Math.sin(a)*r)
    leaf.rotation.set(-Math.PI/2,0,a)
  }
  for(const [dx,dz] of [[-1.4,.3],[.2,-1.9],[1.4,1.4]]) {
    for(let i=0;i<7;i++) {
      const a=i*6.28/7
      const petal=put(scene,new T.SphereGeometry(.105,8,6),glow,x+dx+Math.cos(a)*.12,.12,z+dz+Math.sin(a)*.12)
      petal.scale.set(.7,1.2,.6)
      petal.rotation.z=Math.cos(a)*.7
    }
  }
  let face=0
  return {
    invalidate() {
      face=0
      shader.uniforms.ready.value=false
    },
    update(renderer, now, avatar) {
      shader.uniforms.time.value=now*.001
      if(face>=6) return
      if(face===0) {
        probe.coordinateSystem=renderer.coordinateSystem
        probe.updateCoordinateSystem()
        probe.updateMatrixWorld(true)
      }
      const previous=renderer.getRenderTarget()
      const previousFace=renderer.getActiveCubeFace()
      const previousLevel=renderer.getActiveMipmapLevel()
      const avatarVisible=avatar.visible
      const waterVisible=water.visible
      const xr=renderer.xr.enabled
      water.visible=false
      avatar.visible=false
      renderer.xr.enabled=false
      try {
        environment.texture.generateMipmaps=face===5
        renderer.setRenderTarget(environment,face)
        renderer.render(scene,probe.children[face])
        face++
        shader.uniforms.ready.value=face===6
      } finally {
        renderer.setRenderTarget(previous,previousFace,previousLevel)
        renderer.xr.enabled=xr
        avatar.visible=avatarVisible
        water.visible=waterVisible
      }
    },
  }
}

export function forestFloor(scene) {
  const rand=random(437)
  const bladeGeometry=new T.BufferGeometry()
  bladeGeometry.setAttribute('position',new T.Float32BufferAttribute([-.027,0,0,.03,0,0,.034,.15,.03,.08,.31,.073,.007,.15,.025],3))
  bladeGeometry.setIndex([0,1,2,0,2,4,4,2,3])
  bladeGeometry.computeVertexNormals()
  const grass=paint(0xffffff)
  grass.side=T.DoubleSide
  const blades=new T.InstancedMesh(bladeGeometry,grass,1950)
  const leafGeometry=new T.CircleGeometry(.065,5)
  const autumn=new T.InstancedMesh(leafGeometry,paint(0xffffff),620)
  const color=new T.Color()
  for(let i=0;i<1950;i++) {
    const clump=Math.floor(i/13)
    const x=(rand()-.5)*.44+(clump%2?1:-1)*(1.85+((clump*37)%140)/22)
    const z=(rand()-.5)*.48+12-((clump*31)%320)/20
    const inPond=Math.hypot(x-7.1,z-7.8)<4
    dummy.position.set(x,inPond?-1:.011,z)
    dummy.rotation.set(0,rand()*6.28,0)
    dummy.scale.setScalar(.45+rand()*.92)
    dummy.updateMatrix()
    blades.setMatrixAt(i,dummy.matrix)
    blades.setColorAt(i,color.setHex(i%3===0?0x69734c:0x526146).multiplyScalar(.65+rand()*.45))
  }
  for(let i=0;i<620;i++) {
    const x=(rand()-.5)*20,z=14-rand()*24
    const hidden=Math.hypot(x-7.1,z-7.8)<4.22
    dummy.position.set(x,hidden?-1:Math.abs(x)<1.71?.044:.012,z)
    dummy.rotation.set(-Math.PI/2,0,rand()*6.28)
    dummy.scale.set(.75+rand()*.6,.6+rand()*.6,1)
    dummy.updateMatrix()
    autumn.setMatrixAt(i,dummy.matrix)
    autumn.setColorAt(i,color.setHex([0x83301a,0xa95227,0xb18a41,0x725034][i%4]))
  }
  scene.add(blades,autumn)
}

export function contactShadow() {
  const canvas=document.createElement('canvas')
  canvas.width=canvas.height=64
  const ctx=canvas.getContext('2d')
  const gradient=ctx.createRadialGradient(32,32,0,32,32,32)
  gradient.addColorStop(0,'rgba(20,12,9,.52)')
  gradient.addColorStop(.45,'rgba(20,12,9,.32)')
  gradient.addColorStop(1,'rgba(20,12,9,0)')
  ctx.fillStyle=gradient
  ctx.fillRect(0,0,64,64)
  const shadow=new T.Mesh(new T.PlaneGeometry(.83,.71),new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}))
  shadow.rotation.x=-Math.PI/2
  return shadow
}
