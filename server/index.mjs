import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { WebSocketServer } from 'ws'
import { spawn, poses } from '../src/state.mjs'

const production = process.argv.includes('--production')
const vite = production ? null : await (await import('vite')).createServer({ server: { middlewareMode: true, hmr: false }, appType: 'spa' })
const root = resolve('dist')
const rooms = new Map()
const offerings = new Map()
const capacity = 24
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.txt':'text/plain; charset=utf-8' }
const server = createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname
  if (pathname === '/rooms') {
    res.setHeader('Content-Type','application/json')
    return res.end(JSON.stringify(Array.from({length: 12}, (_, i) => ({ id: String(i+1).padStart(2,'0'), count: rooms.get(String(i+1).padStart(2,'0'))?.size ?? 0, capacity }))))
  }
  if (vite) return vite.middlewares(req,res)
  try {
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(root + sep)) throw new Error('invalid path')
    const body = await readFile(file)
    res.setHeader('Content-Type',mime[extname(file)] ?? 'application/octet-stream')
    if (extname(file) === '.mp3') {
      res.setHeader('Accept-Ranges','bytes')
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range)
        const start = match?.[1] ? Number(match[1]) : Math.max(0,body.length-Number(match?.[2]))
        const end = match?.[1] && match[2] ? Math.min(body.length-1,Number(match[2])) : body.length-1
        if (!match || !Number.isFinite(start) || start >= body.length || start > end) {
          res.setHeader('Content-Range',`bytes */${body.length}`)
          return res.writeHead(416).end()
        }
        res.setHeader('Content-Range',`bytes ${start}-${end}/${body.length}`)
        res.setHeader('Content-Length',end-start+1)
        return res.writeHead(206).end(body.subarray(start,end+1))
      }
    }
    res.setHeader('Content-Length',body.length)
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })
server.on('upgrade',(req,socket,head) => {
  const url = new URL(req.url,'http://localhost')
  const room = url.searchParams.get('room')
  if (url.pathname !== '/presence' || !/^(0[1-9]|1[012])$/.test(room ?? '')) return socket.destroy()
  if (req.headers.origin && !['http://', 'https://'].some(scheme => req.headers.origin === scheme + req.headers.host)) return socket.destroy()
  wss.handleUpgrade(req,socket,head,peer => wss.emit('connection',peer,room))
})
const send = (peer, value) => { if(peer.readyState === 1) peer.send(JSON.stringify(value)) }
const labels = ['松间风','山中月','云边雨','阶前苔','晚归鹤','林下泉']
wss.on('connection',(peer,room) => {
  const members = rooms.get(room) ?? new Map()
  if (members.size >= capacity) {
    send(peer,{type:'full'})
    return peer.close(1008)
  }
  rooms.set(room,members)
  const id = randomUUID()
  const visitor = { ...spawn, x:spawn.x - (members.size % 5)*0.8, z:spawn.z-(members.size % 3)*0.45, id, name: labels[members.size % labels.length], seat: null, cup:null }
  const activity = offerings.get(room) ?? { wishes:[], incense:new Map(), queue:new Set(), groupAt:0 }
  offerings.set(room,activity)
  let lastUpdate = 0
  let lastOffering = 0
  peer.isAlive = true
  peer.on('pong', () => { peer.isAlive = true })
  const publish = message => { for (const member of members.keys()) send(member,message) }
  members.set(peer,visitor)
  const roomActivity = () => {
    const now = Date.now()
    for (const [key,end] of activity.incense) if (end <= now) activity.incense.delete(key)
    if (activity.groupAt && now > activity.groupAt+60000) activity.groupAt = 0
    return {type:'activity',wishes:activity.wishes,incense:[...activity.incense.values()],queue:[...activity.queue],groupAt:activity.groupAt}
  }
  send(peer,{type:'snapshot',id,visitors:[...members.values()]})
  send(peer,roomActivity())
  publish({type:'visitor',visitor})
  peer.on('message',bytes => {
    const now = Date.now()
    let value
    try { value = JSON.parse(bytes) } catch { return }
    if (!value || typeof value !== 'object') return
    if (value.type === 'tea') {
      if (now-lastOffering < 500) return
      if (value.action === 'sip' && visitor.cup?.sips > 0) {
        visitor.cup.sips--
        if (!visitor.cup.sips) visitor.cup = null
        publish({type:'visitor',visitor})
      } else if (value.action === 'pour' && ['松香清茶','桂花暖茶'].includes(value.kind)) {
        const recipient = value.to ? [...members.values()].find(member => member.id === value.to) : visitor
        if (!recipient || recipient.cup) return send(peer,{type:'tea-unavailable'})
        recipient.cup = {kind:value.kind,sips:3}
        publish({type:'visitor',visitor:recipient})
        if (recipient !== visitor) send(peer,{type:'tea-gifted'})
      }
      lastOffering = now
      return
    }
    if (value.type === 'incense-queue') {
      if (value.join === true) activity.queue.add(id)
      else activity.queue.delete(id)
      if (activity.queue.size >= 2 && !activity.groupAt) {
        activity.groupAt = now+3000
        const group = [...activity.queue]
        activity.queue.clear()
        setTimeout(() => {
          for (const member of group) activity.incense.set(member,Date.now()+60000)
          publish(roomActivity())
        },3000).unref()
        setTimeout(() => publish(roomActivity()),63100).unref()
      }
      publish(roomActivity())
      return
    }
    if (value.type === 'wish' || value.type === 'incense') {
      if (now-lastOffering < 2200) return
      if (value.type === 'wish') {
        const text = typeof value.text === 'string' ? value.text.trim() : ''
        if (!text || [...text].length > 40 || !['琥珀','莲红','青绿'].includes(value.color)) return
        activity.wishes.push({text,color:value.color})
        if (activity.wishes.length > 24) activity.wishes.shift()
      } else {
        activity.incense.set(id,now + 60000)
      }
      lastOffering = now
      publish(roomActivity())
      return
    }
    if (now-lastUpdate < 45) return
    lastUpdate = now
    if (![value.x,value.z,value.yaw].every(Number.isFinite) || !poses.includes(value.pose)) return
    const seat = ['sit','greet','bow'].includes(value.pose) && Number.isInteger(value.seat) && value.seat >= 0 && value.seat < 24 ? value.seat : null
    if (seat !== null && [...members.values()].some(other => other.id !== id && other.seat === seat)) {
      send(peer,{type:'seat-taken'})
      return
    }
    Object.assign(visitor,{
      x: Math.max(-13,Math.min(13,value.x)), z: Math.max(-14,Math.min(14,value.z)), yaw:value.yaw % (2*Math.PI),
      pose:value.pose, seat, until: Number.isFinite(value.until) ? Math.max(now,Math.min(now+4800,value.until)) : undefined,
    })
    publish({type:'visitor',visitor})
  })
  peer.on('close',() => {
    members.delete(peer)
    if (activity.queue.delete(id)) publish(roomActivity())
    if (!members.size) rooms.delete(room)
    publish({type:'left',id})
  })
  peer.on('error',() => peer.terminate())
})
const heartbeat = setInterval(() => {
  for (const peer of wss.clients) {
    if (!peer.isAlive) peer.terminate()
    else {
      peer.isAlive = false
      peer.ping()
    }
  }
},15000)
heartbeat.unref()
server.listen(Number(process.env.PORT || 4173), process.env.HOST || '127.0.0.1',() => console.log('Listening on',server.address().port))
