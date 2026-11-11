import './style.css'
import { createWorld, seats } from './world.mjs'
import { spawn, walk, ritual, ceremony, pondBounds, planWalk } from './state.mjs'

const $ = id => document.getElementById(id)
const dialog = $('dialog')
const content = $('dialog-content')
const peers = new Map()
const keys = new Set()
const places = [
  { name:'山门',x:0,z:12 }, { name:'石阶',x:0,z:4 },
  { name:'清静法堂',x:0,z:-3.2 }, { name:'莲池',x:pondBounds.x-pondBounds.radius-.55,z:pondBounds.z },
  { name:'灯径',x:5.8,z:2.8 }, { name:'松间茶舍',x:9,z:2 },
]
const selected = new URL(location.href).searchParams.get('room')
let room = /^(0[1-9]|1[012])$/.test(selected ?? '') ? selected : '01'
let visitor = { ...spawn, seat:null }
let roomActivity = {wishes:[],incense:[]}
let cup
let world, self, socket, target, mapTravel, drag, reconnect, audio, noticeTimer
const chant = new Audio('/audio/chant.mp3')
chant.preload = 'none'
let animation, active = false, angle = 0, zoom = 1, last = 0, lastSent = 0, dirty = true
let toneEnabled = localStorage.getItem('temple:effects') !== 'off'
let ambient
const getVolume = (name,fallback) => {
  const saved = localStorage.getItem(`temple:volume:${name}`)
  return saved === null ? fallback : Math.max(0,Math.min(1,Number(saved) || 0))
}
chant.volume = getVolume('chant',0.45)
function startAmbience() {
  if (ambient) return
  const ctx = audioContext()
  const buffer = ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i=0;i<samples.length;i++) samples[i] = Math.random()*2-1
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  filter.type = 'lowpass'
  filter.frequency.value = 320
  source.buffer = buffer
  source.loop = true
  gain.gain.value = getVolume('ambient',0.22)*0.14
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start()
  ambient = {source,gain}
}
function stopAmbience() {
  ambient?.source.stop()
  ambient = undefined
}

function notice(value) {
  $('notice').textContent = value
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => $('notice').textContent = '', 3000)
}
function updateOnline() {
  $('online').textContent = self ? `${peers.size + 1} 人同在` : '连接中'
}
function connect(keepPosition = false) {
  clearTimeout(reconnect)
  self = undefined
  cup = undefined
  peers.clear()
  roomActivity = {wishes:[],incense:[]}
  world.showWishes([])
  updateOnline()
  const endpoint = new URL('/presence',location.href)
  endpoint.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  endpoint.searchParams.set('room',room)
  const old = socket
  const channel = socket = new WebSocket(endpoint)
  old?.close()
  let full = false
  channel.onmessage = ({data}) => {
    if (socket !== channel) return
    const message = JSON.parse(data)
    if (message.type === 'snapshot') {
      self = message.id
      const local = message.visitors.find(person => person.id === self)
      cup = local?.cup
      if (!keepPosition && local) visitor = { ...spawn, x:local.x,z:local.z,seat:null }
      for (const person of message.visitors) if (person.id !== self) peers.set(person.id,person)
      dirty = true
    }
    if (message.type === 'visitor' && message.visitor.id === self) {
      const next = message.visitor.cup
      const changed = next?.kind !== cup?.kind || next?.sips !== cup?.sips
      cup = next
      if (changed && $('dialog-title').textContent === '松间茶舍' && dialog.open) renderTea()
    }
    if (message.type === 'tea-gifted') notice('茶已送到')
    if (message.type === 'tea-unavailable') notice('对方手上已有一杯茶')
    if (message.type === 'visitor' && message.visitor.id !== self) {
      const previous = peers.get(message.visitor.id)
      if (previous?.pose !== 'greet' && message.visitor.pose === 'greet') notice(`${message.visitor.name} 合掌问候`)
      peers.set(message.visitor.id,message.visitor)
    }
    if (message.type === 'left') peers.delete(message.id)
    if (message.type === 'activity') {
      roomActivity = message
      world.showWishes(message.wishes)
      if (dialog.open && $('dialog-title').textContent === '同房祈愿') renderOfferings()
    }
    if (message.type === 'seat-taken') {
      visitor = { ...visitor, pose:'stand', seat:null }
      dirty = true
      notice('这个蒲团已有访客')
    }
    if (message.type === 'full') {
      full = true
      notice('房间已满，请选择其他房间')
      $('rooms').click()
    }
    updateOnline()
  }
  channel.onclose = () => {
    if (socket !== channel || !active) return
    peers.clear()
    self = undefined
    updateOnline()
    if (!full) {
      notice('连接中断，正在重连')
      reconnect = setTimeout(() => connect(true),1500)
    }
  }
}

function stopAudio() {
  chant.pause()
  $('sound').setAttribute('aria-pressed','false')
}
chant.addEventListener('ended',stopAudio)
function audioContext() {
  audio ??= new AudioContext()
  audio.resume().catch(() => {})
  return audio
}
function strike(frequency, volume = 0.18) {
  if (!toneEnabled) return
  const ctx = audioContext()
  const now = ctx.currentTime
  const oscillator = ctx.createOscillator()
  const amp = ctx.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.value = frequency
  amp.gain.setValueAtTime(Math.max(0.001,volume*getVolume('effects',0.85)),now)
  amp.gain.exponentialRampToValueAtTime(0.001,now+0.34)
  oscillator.connect(amp).connect(ctx.destination)
  oscillator.start()
  oscillator.stop(now+0.36)
}
$('sound').onclick = async () => {
  if (!chant.paused) return stopAudio()
  const event = ceremony(Date.now())
  if (event.active) chant.currentTime = (Date.now()-event.time)/1000
  try {
    await chant.play()
    $('sound').setAttribute('aria-pressed','true')
  } catch {
    notice('暂时无法播放诵念')
  }
}
document.addEventListener('visibilitychange',() => {
  if (document.hidden && localStorage.getItem('temple:background') !== 'yes') {
    stopAudio()
    stopAmbience()
  } else if (active && localStorage.getItem('temple:ambience') === 'yes') startAmbience()
})

function panel(title) {
  $('dialog-title').textContent = title
  content.className = 'panel-list'
  content.replaceChildren()
  if (!dialog.open) dialog.showModal()
  return content
}
function button(label,action) {
  const node = document.createElement('button')
  node.type = 'button'
  node.textContent = label
  node.onclick = action
  return node
}
$('rooms').onclick = async () => {
  const list = panel('选择房间')
  const request = document.createElement('p')
  request.textContent = '正在读取房间…'
  list.append(request)
  try {
    const response = await fetch('/rooms')
    if (!response.ok) throw new Error('rooms')
    const rooms = await response.json()
    if (!dialog.open || $('dialog-title').textContent !== '选择房间') return
    list.replaceChildren(...rooms.map(item => button(
      `山寺 ${item.id} · ${item.count}/${item.capacity}${item.id === room ? ' · 当前' : ''}`,() => {
        if (item.id !== room || !self) {
          room = item.id
          $('room-label').textContent = room
          const url = new URL(location.href)
          url.searchParams.set('room',room)
          history.replaceState(null,'',url)
          visitor = { ...spawn, seat:null }
          stopTravel()
          connect()
        }
        dialog.close()
      },
    )))
  } catch {
    request.textContent = '暂时无法读取房间'
  }
}
function stopTravel() {
  mapTravel = null
  target = null
  $('stop-travel').hidden = true
}
$('stop-travel').onclick = () => {
  stopTravel()
  $('stop-travel').blur()
}
$('map').onclick = () => {
  panel('山寺游览').append(...places.map(place => button(place.name,() => {
    if (visitor.until) return
    const route = planWalk(visitor,place)
    dialog.close()
    if (!route) {
      notice('暂时无法沿路到达此处')
      return
    }
    keys.clear()
    mapTravel = { place, route }
    target = route.shift()
    $('stop-travel').hidden = false
  })))
}
$('support').onclick = () => {
  const box = panel('添一份供养')
  const description = document.createElement('p')
  description.textContent = '可选择一份象征供养，当前为本地体验。'
  const message = document.createElement('p')
  message.setAttribute('role','status')
  box.append(description,...['一碗米','一盏灯','一束花'].map(label => button(label,() => {
    box.replaceChildren(message,button('确认测试供养',() => {
      message.textContent = `已送上${label} · 测试流程完成`
      box.replaceChildren(message)
    }),button('取消',() => dialog.close()))
    message.textContent = `确认送上${label}？`
  })))
}
$('ceremony').onclick = () => {
  const schedule = panel('每日早晚课')
  const event = ceremony(Date.now())
  const status = document.createElement('p')
  status.textContent = event.active ? `${event.name}进行中` : `下一场是${event.name}，当地时间 ${new Date(event.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`
  const detail = document.createElement('p')
  detail.textContent = '山寺时间 05:00 晨课 · 18:00 暮课'
  schedule.append(status,detail)
}

function renderOfferings() {
  const list = $('offering-list')
  if (!list) return
  const count = roomActivity.incense.filter(end => end > Date.now()).length
  const summary = document.createElement('p')
  summary.textContent = count ? `当前有 ${count} 炷香` : '炉前清静'
  const joined = roomActivity.queue?.includes(self)
  const queue = document.createElement('p')
  queue.textContent = roomActivity.groupAt > Date.now() ? '两位访客已就绪，即将共香'
    : roomActivity.groupAt && count ? '共香进行中'
    : `共香候场 · ${roomActivity.queue?.length ?? 0} 人`
  list.replaceChildren(summary,queue)
  if (!roomActivity.groupAt) list.append(button(joined?'离开候场':'加入共香',() => sendOffering({type:'incense-queue',join:!joined})))
  for (const wish of [...roomActivity.wishes].reverse()) {
    const entry = document.createElement('p')
    entry.textContent = `${wish.color} · ${wish.text}`
    list.append(entry)
  }
}
function sendOffering(value) {
  if (socket?.readyState !== WebSocket.OPEN || !self) {
    notice('请等待房间连接')
    return false
  }
  socket.send(JSON.stringify(value))
  return true
}
function renderTea() {
  const section = panel('松间茶舍')
  const text = document.createElement('p')
  text.textContent = cup ? `${cup.kind} · 还可饮 ${cup.sips} 口` : '一壶清茶，可自饮，也可送给同房访客。'
  section.append(text)
  if (cup) section.append(button('饮一口',() => sendOffering({type:'tea',action:'sip'})))
  const recipient = document.createElement('select')
  recipient.setAttribute('aria-label','赠给')
  recipient.append(new Option('给自己',''))
  for (const [id,person] of peers) recipient.append(new Option(person.name,id))
  section.append(recipient,...['松香清茶','桂花暖茶'].map(kind => button(kind,() => sendOffering({type:'tea',action:'pour',kind,to:recipient.value}))))
}
$('offerings').onclick = () => {
  const section = panel('同房祈愿')
  const list = document.createElement('div')
  list.id = 'offering-list'
  const input = document.createElement('textarea')
  input.setAttribute('aria-label','一行心愿')
  input.placeholder = '写下一行心愿，同房访客可见'
  input.maxLength = 80
  const color = document.createElement('select')
  color.setAttribute('aria-label','祈愿灯颜色')
  for (const item of ['琥珀','莲红','青绿']) color.append(new Option(item,item))
  const submit = button('挂上祈愿灯',() => {
    const text = input.value.trim()
    if (!text || [...text].length > 40) {
      input.setCustomValidity('请输入 1–40 个字符')
      input.reportValidity()
      return
    }
    if (sendOffering({type:'wish',text,color:color.value})) input.value = ''
  })
  input.oninput = () => input.setCustomValidity('')
  section.append(input,color,submit,button('上一炷香',() => sendOffering({type:'incense'})),list)
  renderOfferings()
}

$('settings').onclick = () => {
  function toggle(label,value,change) {
    const row = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = value
    input.onchange = () => change(input.checked)
    row.append(label,input)
    return row
  }
  function volume(label,name,fallback,change) {
    const row = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'range'
    input.min = 0
    input.max = 100
    input.value = Math.round(getVolume(name,fallback)*100)
    input.oninput = () => {
      const value = Number(input.value)/100
      localStorage.setItem(`temple:volume:${name}`,String(value))
      change?.(value)
    }
    row.append(label,input)
    return row
  }
  const credits = document.createElement('a')
  credits.href = '/models/ATTRIBUTION.txt'
  credits.target = '_blank'
  credits.rel = 'noopener'
  credits.textContent = '法堂藏品出处与许可'
  panel('设置').append(
    toggle('环境音',localStorage.getItem('temple:ambience') === 'yes',value => {
      localStorage.setItem('temple:ambience',value ? 'yes' : 'no')
      if (value) startAmbience()
      else stopAmbience()
    }),
    volume('环境音量','ambient',0.22,value => { if (ambient) ambient.gain.gain.value = value*0.14 }),
    volume('仪式音量','effects',0.85),
    volume('诵念音量','chant',0.45,value => {chant.volume = value}),
    toggle('仪式音效',toneEnabled,value => {
      toneEnabled = value
      localStorage.setItem('temple:effects',value ? 'on' : 'off')
    }),
    toggle('低画质',localStorage.getItem('temple:quality') === 'low',value => {
      localStorage.setItem('temple:quality',value ? 'low' : 'normal')
      world.quality(value)
    }),
    toggle('后台播放',localStorage.getItem('temple:background') === 'yes',value => localStorage.setItem('temple:background',value ? 'yes' : 'no')),
    credits,
  )
}

function action(kind) {
  if (visitor.until) return
  visitor = ritual(visitor,kind,Date.now())
  stopTravel()
  dirty = true
  if (kind === 'bow') strike(180,0.07)
}
$('greet').onclick = () => action('greet')
$('bow').onclick = () => action('bow')
$('sit').onclick = () => {
  if (visitor.until) return
  stopTravel()
  if (visitor.pose === 'sit') {
    visitor = { ...visitor, pose:'stand',seat:null }
  } else {
    const occupied = new Set([...peers.values()].map(person => person.seat))
    const nearest = seats.map((seat,index) => ({seat,index,distance:Math.hypot(seat.x-visitor.x,seat.z-visitor.z)}))
      .filter(item => !occupied.has(item.index)).sort((a,b) => a.distance-b.distance)[0]
    if (!nearest || nearest.distance > 2.6) return notice('请走近法堂里的蒲团')
    visitor = { ...visitor,...nearest.seat,yaw:Math.PI,pose:'sit',seat:nearest.index }
  }
  dirty = true
}
$('moktak').onclick = () => {
  const status = document.createElement('p')
  status.setAttribute('role','status')
  let strikes = 0
  const wood = button('轻敲木鱼',() => {
    strike(235)
    status.textContent = `已敲 ${++strikes} 次`
  })
  wood.className = 'instrument'
  panel('木鱼').append(wood,status)
}
let beads = Math.max(0,Math.min(108,Math.floor(Number(localStorage.getItem('temple:beads')) || 0)))
$('beads').onclick = () => {
  const total = document.createElement('output')
  total.className = 'count'
  total.setAttribute('aria-live','polite')
  const refresh = () => {
    total.textContent = `${beads} / 108`
    localStorage.setItem('temple:beads',String(beads))
  }
  const increment = () => {
    if (beads >= 108) return
    beads++
    refresh()
    strike(beads === 108 ? 520 : 330,0.07)
  }
  const bead = button('拨动念珠',increment)
  bead.className = 'bead'
  let y
  bead.onpointerdown = event => {y = event.clientY; bead.setPointerCapture(event.pointerId)}
  bead.onpointermove = event => {
    if (y === undefined || Math.abs(event.clientY-y) < 16) return
    y = event.clientY
    increment()
  }
  bead.onpointerup = bead.onpointercancel = () => {y = undefined}
  panel('念珠').append(total,bead,button('归零',() => {beads = 0; refresh()}))
  refresh()
}

function bindWorld() {
  const canvas = world.canvas
  const contacts = new Map()
  let pinch
  const distance = () => {
    const [first,second] = contacts.values()
    return Math.hypot(first.clientX-second.clientX,first.clientY-second.clientY)
  }
  canvas.addEventListener('pointerdown',event => {
    contacts.set(event.pointerId,event)
    canvas.setPointerCapture(event.pointerId)
    if (contacts.size === 2) {
      pinch = {start:Math.max(1,distance()),zoom}
      drag = null
    } else if (contacts.size === 1) {
      drag = {x:event.clientX,y:event.clientY,angle,moved:false}
    }
  })
  canvas.addEventListener('pointermove',event => {
    if (contacts.has(event.pointerId)) contacts.set(event.pointerId,event)
    if (pinch && contacts.size >= 2) {
      zoom = Math.max(0.72,Math.min(1.45,pinch.zoom*pinch.start/Math.max(1,distance())))
      return
    }
    if (!drag) return
    const offset = event.clientX-drag.x
    if (Math.hypot(offset,event.clientY-drag.y) > 8) drag.moved = true
    if (drag.moved) angle = (drag.angle-offset*0.007) % (2*Math.PI)
  })
  canvas.addEventListener('pointerup',event => {
    contacts.delete(event.pointerId)
    if (pinch) {
      if (!contacts.size) pinch = undefined
      return
    }
    if (drag && !drag.moved) {
      const point = world.point(event.clientX,event.clientY)
      if (point) {
        stopTravel()
        target = {x:Math.max(-13,Math.min(13,point.x)),z:Math.max(-14,Math.min(14,point.z))}
      }
    }
    drag = null
  })
  canvas.addEventListener('pointercancel',event => {
    contacts.delete(event.pointerId)
    if (!contacts.size) pinch = undefined
    drag = null
  })
  canvas.addEventListener('wheel',event => {
    event.preventDefault()
    zoom = Math.max(0.72,Math.min(1.45,zoom + Math.sign(event.deltaY)*0.08))
  },{passive:false})
}
document.addEventListener('keydown',event => {
  if (!active || dialog.open || event.target.closest('input,textarea,select')) return
  const key = event.key.toLowerCase()
  if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
    event.preventDefault()
    keys.add(key)
    stopTravel()
  }
  if (!event.repeat && !event.target.closest('button')) ({'1':$('bow'),'2':$('beads'),'3':$('greet'),'5':$('moktak'),' ':$('sit')})[key]?.click()
})
document.addEventListener('keyup',event => keys.delete(event.key.toLowerCase()))
window.addEventListener('blur',() => keys.clear())

function frame(now) {
  if (!active) return
  const elapsed = Math.min(0.25,(now-last)/1000)
  last = now
  if (visitor.until && Date.now() >= visitor.until) {
    visitor = {...visitor,pose:visitor.rest,until:undefined}
    dirty = true
  }
  let x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'))
  let z = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'))
  if (dialog.open) {
    x = z = 0
  } else if (target) {
    x = target.x-visitor.x
    z = target.z-visitor.z
    if (Math.hypot(x,z) < .025) {
      target = mapTravel?.route.shift()
      if (!target) {
        const arrived = mapTravel?.place
        stopTravel()
        if (arrived?.name === '松间茶舍') renderTea()
      }
      x = z = 0
    }
  }
  if ((x || z) && !visitor.until) {
    const next = walk(visitor,x,z,target ? Math.min(elapsed,Math.hypot(x,z)/3.3) : elapsed)
    const moved = next.x !== visitor.x || next.z !== visitor.z
    if (!moved && elapsed > 0) {
      if (mapTravel) notice('前方受阻，已停止移动')
      stopTravel()
    }
    visitor = { ...next,pose:moved ? 'walk' : 'stand',seat:null }
    dirty = true
  } else if (visitor.pose === 'walk') {
    visitor = {...visitor,pose:'stand'}
    dirty = true
  }
  if (dirty && socket?.readyState === WebSocket.OPEN && self && now-lastSent > 70) {
    socket.send(JSON.stringify(visitor))
    dirty = false
    lastSent = now
  }
  $('sit').textContent = visitor.pose === 'sit' ? '起身' : '落座'
  $('bow').setAttribute('aria-pressed',String(visitor.pose === 'bow'))
  world.render(visitor,peers,now,angle,zoom,mapTravel?.place ?? target)
  animation = requestAnimationFrame(frame)
}
$('enter').onclick = () => {
  try {
    if (!world) {
      world = createWorld($('world'))
      world.quality(localStorage.getItem('temple:quality') === 'low')
      bindWorld()
    }
  } catch (error) {
    console.error('三维场景启动失败',error)
    $('entry-error').textContent = '此设备暂时无法启动三维场景，请检查浏览器的 WebGL 支持。'
    return
  }
  active = true
  if (localStorage.getItem('temple:ambience') === 'yes') startAmbience()
  last = performance.now()
  $('enter').blur()
  $('entry').hidden = true
  $('hud').hidden = false
  $('room-label').textContent = room
  connect()
  animation = requestAnimationFrame(frame)
}
$('exit').onclick = () => {
  active = false
  cancelAnimationFrame(animation)
  clearTimeout(reconnect)
  socket?.close()
  stopAudio()
  stopAmbience()
  keys.clear()
  stopTravel()
  visitor = { ...spawn,seat:null }
  $('entry').hidden = false
  $('hud').hidden = true
}
