export const spawn = { x: 0.8, z: 11.5, yaw: Math.PI, pose: 'stand' }
export const pondBounds = { x:7.1, z:7.8, radius:4.2 }
export const gateFooting = { x:2.6, z:9.52, halfWidth:.38 }
export const poses = ['stand', 'walk', 'sit', 'bow', 'greet']
const bound = (n, min, max) => Math.min(max, Math.max(min, n))

export function walk(visitor, x, z, elapsed) {
  const length = Math.hypot(x, z)
  if (!length || visitor.until) return visitor
  const duration = bound(elapsed, 0, 0.25)
  const steps = Math.max(1, Math.ceil(duration / 0.035))
  const step = 3.3 * duration / (length * steps)
  let nextX = bound(visitor.x, -13, 13)
  let nextZ = bound(visitor.z, -14, 14)
  for (let i = 0; i < steps; i++) {
    const xCandidate = bound(nextX + x * step, -13, 13)
    if (!obstacle(xCandidate,nextZ)) nextX = xCandidate
    const zCandidate = bound(nextZ + z * step, -14, 14)
    if (!obstacle(nextX,zCandidate)) nextZ = zCandidate
  }
  return {
    ...visitor,
    x: nextX,
    z: nextZ,
    yaw: Math.atan2(x, z),
    pose: 'stand',
  }
}

export function ritual(visitor, action, now) {
  if (visitor.until) return visitor
  return { ...visitor, pose: action, rest: visitor.pose === 'sit' ? 'sit' : 'stand', until: now + (action === 'bow' ? 4800 : 1350) }
}

function obstacle(x,z) {
  const across = Math.abs(x)
  const sideWall = Math.abs(across-6.3) < 0.27 && z > -10.7 && z < -1.45
  const frontPanels = across > 1.57 && across < 5.9 && Math.abs(z+1.64) < .32
  const backWall = across < 6.55 && Math.abs(z+10.55) < 0.29
  const altar = across < 2.5 && z > -9.43 && z < -8.64
  const pond = Math.hypot(x-pondBounds.x,z-pondBounds.z) < pondBounds.radius+.28
  const post = Math.abs(across-gateFooting.x) < gateFooting.halfWidth+.28
    && Math.abs(z-gateFooting.z) < gateFooting.halfWidth+.28
  return sideWall || frontPanels || backWall || altar || pond || post
}

// Sample the same obstacles used for walking. The junctions cover the
// courtyard paths between the hall door, pond bank and eastern buildings.
export function planWalk(start, goal) {
  const points = [start, goal,
    {x:0,z:11}, {x:0,z:8}, {x:0,z:2.4}, {x:0,z:-.65},
    {x:0,z:-3.2}, {x:3,z:2.4}, {x:10,z:2.4},
    {x:2.25,z:6.5}, {x:-7.3,z:.4}, {x:7.3,z:.4},
    {x:-7.3,z:-11.4}, {x:7.3,z:-11.4},
  ]
  const inside = ({x,z}) => Number.isFinite(x) && Number.isFinite(z) && Math.abs(x)<=13 && Math.abs(z)<=14
  if (!inside(start) || !inside(goal) || obstacle(goal.x,goal.z)) return null
  const lengths = points.map(() => Infinity)
  const previous = []
  const visited = new Set()
  lengths[0] = 0
  while (true) {
    const current = lengths.reduce((best,length,index) =>
      !visited.has(index) && length < (best < 0 ? Infinity : lengths[best]) ? index : best,-1)
    if (current < 0) return null
    if (current === 1) {
      const route = []
      for (let index=1;index!==0;index=previous[index]) {
        const {x,z} = points[index]
        route.unshift({x,z})
      }
      return route
    }
    visited.add(current)
    const from = points[current]
    for (let index=1;index<points.length;index++) {
      if (visited.has(index)) continue
      const to=points[index]
      const dx=to.x-from.x, dz=to.z-from.z
      const distance=Math.hypot(dx,dz)
      if (lengths[current]+distance>=lengths[index]) continue
      const samples=Math.max(1,Math.ceil(distance/.06))
      let clear=true
      for (let i=1;i<=samples;i++) {
        if (obstacle(from.x+dx*i/samples,from.z+dz*i/samples)) {
          clear=false
          break
        }
      }
      if (clear) {
        lengths[index]=lengths[current]+distance
        previous[index]=current
      }
    }
  }
}

export function lightModeAt(now) {
  const hour = new Date(now+9*3600000).getUTCHours()
  return hour>=6 && hour<18 ? 'day' : 'night'
}

export function ceremony(now) {
  const hour = 3600000
  const day = 24 * hour
  const start = Math.floor((now + 9 * hour) / day) * day - 9 * hour
  const times = [{name:'晨课',time:start+5*hour}, {name:'暮课',time:start+18*hour}]
  const next = times.find(event => event.time+119369 > now) ?? {name:'晨课',time:start+day+5*hour}
  return {...next,active:now>=next.time}
}
