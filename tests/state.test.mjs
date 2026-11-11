import test from 'node:test'
import assert from 'node:assert/strict'
import { ritual, walk, spawn, pondBounds } from '../src/state.mjs'

test('walking is bounded and a seated visitor can stand to walk', () => {
  const visitor = { ...spawn, pose: 'sit' }
  assert.equal(walk(visitor, 0, -1, 0.1).pose, 'stand')
  assert.equal(walk({ ...visitor, z: -100 }, 0, -1, 0.1).z, -14)
})

test('prayer actions return to the previous resting pose', () => {
  const visitor = { ...spawn, pose: 'sit' }
  assert.equal(ritual(visitor, 'bow', 10).rest, 'sit')
  assert.equal(ritual(visitor, 'bow', 10).until, 4810)
})

test('ceremony times are anchored to Seoul regardless of browser timezone', async () => {
  const { ceremony } = await import('../src/state.mjs')
  assert.deepEqual(ceremony(Date.parse('2026-11-09T08:59:00Z')), {name:'暮课',time:Date.parse('2026-11-09T09:00:00Z'),active:false})
  assert.equal(ceremony(Date.parse('2026-11-09T09:00:00Z')).active,true)
  assert.equal(ceremony(Date.parse('2026-11-09T10:00:00Z')).name,'晨课')
})

test('movement cannot walk through the rear wall of the hall', () => {
  const nearWall = { ...spawn,z:-10.15 }
  assert.ok(walk(nearWall,0,-1,0.1).z >= -10.26)
})

test('a slow render frame preserves walking speed without skipping the rear wall', () => {
  const advancing = walk(spawn, 0, -1, 0.2)
  assert.ok(Math.abs(advancing.z - (spawn.z - 0.66)) < 1e-9)
  const blocked = walk({ ...spawn,x:0,z:-10.22 }, 0, -1, 0.25)
  assert.equal(blocked.z, -10.22)
})

test('visitors stop at the pond bank and the gate footing', () => {
  const bank = { ...spawn, x:2.55,z:7.8 }
  assert.equal(walk(bank,1,0,.2).x,bank.x)
  const gate = { ...spawn, x:2.6,z:10.22 }
  assert.equal(walk(gate,0,-1,.2).z,gate.z)
})

test('map routes can go around the pond and enter the hall through its front', async () => {
  const { planWalk } = await import('../src/state.mjs')
  for (const [start,goal] of [[spawn,{x:9,z:2}],[{x:9,z:2},{x:0,z:-3.2}],[{x:0,z:-3.2},{x:0,z:12}]]) {
    const route = planWalk(start,goal)
    assert.ok(route?.length)
    assert.deepEqual(route.at(-1),goal)
    let position = {...start}
    for (const waypoint of route) {
      for (let i=0;i<200;i++) {
        const x=waypoint.x-position.x, z=waypoint.z-position.z
        const remaining=Math.hypot(x,z)
        if(remaining<.025) break
        position=walk(position,x,z,Math.min(.05,remaining/3.3))
      }
      assert.ok(Math.hypot(waypoint.x-position.x,waypoint.z-position.z)<.025)
    }
  }
  assert.equal(planWalk(spawn,pondBounds),null)
})

test('the hall facade blocks walking through its lattice panels', () => {
  const outside = { ...spawn,x:2.73,z:-1.27 }
  assert.equal(walk(outside,0,-1,.2).z,outside.z)
  assert.ok(walk({...outside,x:0},0,-1,.2).z < -1.64)
})

test('daylight switches at 06:00 and 18:00 Seoul time', async () => {
  const { lightModeAt } = await import('../src/state.mjs')
  for (const [iso,mode] of [
    ['2026-11-09T20:59:59Z','night'],['2026-11-09T21:00:00Z','day'],
    ['2026-11-10T08:59:59Z','day'],['2026-11-10T09:00:00Z','night'],
  ]) assert.equal(lightModeAt(Date.parse(iso)),mode)
})
