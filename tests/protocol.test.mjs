import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceHub } from '../server/presence.mjs';
function fixture(options = {}) {
  let now = 1800000000000;
  const hub = new PresenceHub({ ...options, now: () => now });
  const join = (room = 'maru', visit) => {
    const messages = [];
    const session = hub.connect({ room, visit }, (m) => messages.push(structuredClone(m)));
    return {
      session,
      messages,
      send: (m) => hub.receive(session, m),
      last: (type) => messages.filter((m) => m.type === type).at(-1),
    };
  };
  return {
    hub,
    join,
    advance: (ms) => {
      now += ms;
      hub.tick();
    },
  };
}
test('two real sessions share state, move broadcasts and rooms remain isolated', () => {
  const { hub, join } = fixture();
  const a = join(),
    b = join(),
    c = join('maru-02');
  a.send({ type: 'sync' });
  assert.equal(a.last('snapshot').visitors.length, 2);
  assert.equal(c.last('snapshot').visitors.length, 1);
  a.send({ type: 'move', x: 2, z: 48, yaw: 1, pose: 'walk' });
  assert.equal(b.last('delta').upserts[0].position.x, 2);
  assert.ok(
    !c.messages.some(
      (m) => m.type === 'delta' && m.upserts.some((v) => v.id === a.session.visitor.id),
    ),
  );
  a.send({ type: 'hello' });
  assert.equal(b.last('event').event.id, a.session.visitor.id);
  assert.equal(hub.directory().rooms[0].count, 2);
});
test('one remaining cushion has one winner; duplicate seat request is idempotent', () => {
  const { join } = fixture({ cushions: [1] });
  const a = join(),
    b = join();
  a.send({ type: 'seat', requestId: 1 });
  b.send({ type: 'seat', requestId: 1 });
  assert.equal(a.last('seat-granted').seat, 1);
  assert.equal(b.last('seat-unavailable').requestId, 1);
  a.send({ type: 'seat', requestId: 1 });
  assert.equal(a.last('seat-granted').seat, 1);
  a.send({ type: 'stand' });
  a.send({ type: 'seat', requestId: 1 });
  assert.equal(a.session.visitor.cushion, null, 'late duplicate cannot reclaim released seat');
  b.send({ type: 'seat', requestId: 2 });
  assert.equal(b.session.visitor.cushion, 1);
});
test('disconnect releases seat and queue; valid token resumes one visitor without duplicates', () => {
  const { hub, join } = fixture();
  const a = join();
  a.send({ type: 'seat', requestId: 1 });
  const first = a.last('snapshot');
  hub.disconnect(a.session);
  assert.equal(hub.directory().rooms[0].count, 0);
  const b = join('maru', first.visitToken);
  assert.equal(b.last('snapshot').resumed, true);
  assert.equal(b.last('snapshot').selfId, first.selfId);
  assert.equal(b.session.visitor.cushion, null);
  const c = join('maru', first.visitToken);
  assert.equal(c.last('error').code, 'visit-in-use');
  assert.equal(hub.directory().rooms[0].count, 1);
});
test('incense FIFO handles cancellation, head disconnect, duplicates, ritual and expiry', () => {
  const { hub, join, advance } = fixture();
  const a = join(),
    b = join();
  for (const v of [a, b]) v.send({ type: 'move', x: 0, z: 13.06, yaw: 0, pose: 'walk' });
  a.send({ type: 'incense-join', requestId: 1 });
  a.send({ type: 'incense-join', requestId: 1 });
  b.send({ type: 'incense-join', requestId: 1 });
  assert.equal(b.last('incense-queue').queue.members.length, 2);
  assert.equal(a.last('incense-queue-result').accepted, true);
  a.send({ type: 'incense-start' });
  a.send({ type: 'incense', requestId: 2 });
  a.send({ type: 'incense', requestId: 2 });
  assert.equal(a.last('incense-result').accepted, true);
  assert.equal(hub.room('maru').activities.incense.length, 1);
  hub.disconnect(a.session);
  assert.equal(b.last('incense-queue').queue.activeId, b.session.visitor.id);
  b.send({ type: 'incense-leave' });
  assert.equal(b.last('incense-queue').queue.activeId, null);
  advance(120001);
  assert.equal(hub.room('maru').activities.incense.length, 0);
});
test('queue expires and invalid or far requests reject explicitly', () => {
  const { join, advance } = fixture();
  const a = join();
  a.send({ type: 'incense-join', requestId: 1 });
  assert.equal(a.last('incense-queue-result').accepted, false);
  a.send({ type: 'move', x: 0, z: 13.06, yaw: 0, pose: 'walk' });
  a.send({ type: 'incense-join', requestId: 2 });
  advance(60001);
  assert.equal(a.last('incense-queue').queue.members.length, 0);
  a.send({ type: 'move', x: NaN, z: 0, yaw: 0, pose: 'walk' });
  assert.equal(a.last('error').code, 'invalid-message');
  a.send({ type: 'unknown' });
  assert.equal(a.last('error').code, 'unsupported-message');
});
test('room transfer releases old states and never duplicates a visitor', () => {
  const { hub, join } = fixture();
  const a = join(),
    b = join();
  a.send({ type: 'seat', requestId: 1 });
  a.send({ type: 'room-switch', room: 'maru-02', requestId: 9 });
  assert.equal(a.last('snapshot').room, 'maru-02');
  assert.equal(a.session.visitor.cushion, null);
  assert.equal(b.last('delta').removed.length, 1);
  assert.equal(hub.directory().rooms[0].count, 1);
  assert.equal(hub.directory().rooms[1].count, 1);
});
test('room capacity rejects extra connections and disconnect frees capacity', () => {
  const { hub, join } = fixture({ capacity: 2 });
  const a = join();
  join();
  const c = join();
  assert.equal(c.last('error').code, 'room-full');
  hub.disconnect(a.session);
  assert.equal(join().last('snapshot').visitors.length, 2);
});
test('coffee brewing, gifting, receiving and sipping share authoritative state', () => {
  const { join, advance } = fixture();
  const a = join(),
    b = join();
  const cafe = (c, id, action, payload = {}) => {
    c.send({ type: 'cafe25', requestId: id, action, payload });
    return c.last('cafe25-result').result;
  };
  for (const c of [a, b]) c.send({ type: 'move', x: 14.8, z: 30.855, yaw: 0, pose: 'walk' });
  assert.equal(
    cafe(a, 1, 'mint', { mode: 'gift', kind: 'americano', temperature: 'hot' }).ok,
    true,
  );
  assert.equal(cafe(a, 2, 'pickup').code, 'not_ready');
  advance(5001);
  assert.equal(cafe(a, 3, 'pickup').ok, true);
  assert.equal(cafe(a, 4, 'sip').code, 'cannot-drink-gift');
  assert.equal(cafe(a, 5, 'offer', { targetId: b.session.visitor.id }).ok, true);
  const offer = b.last('cafe25-state').state.incoming;
  assert.ok(offer);
  assert.equal(cafe(b, 1, 'accept', { offerId: offer.id }).ok, true);
  assert.equal(a.last('cafe25-state').state.cup, null);
  assert.equal(b.last('cafe25-state').state.cup.mode, 'received');
  assert.equal(cafe(b, 2, 'sip').state.cup.sips, 1);
  assert.equal(
    cafe(b, 2, 'sip').state.cup.sips,
    1,
    'duplicate request must not consume another sip',
  );
});
test('completed bows accrue self-coffee credit once, and garden seats are exclusive', () => {
  const { join, advance } = fixture();
  const a = join(),
    b = join();
  const cafe = (c, id, action, payload = {}) => {
    c.send({ type: 'cafe25', requestId: id, action, payload });
    return c.last('cafe25-result').result;
  };
  a.send({ type: 'move', x: 1.65, z: 20.45, yaw: 0, pose: 'kneel' });
  for (let i = 0; i < 25; i++) {
    a.send({ type: 'bow' });
    advance(4801);
    assert.equal(cafe(a, i + 1, 'bow-complete').ok, true);
  }
  assert.equal(a.last('cafe25-state').state.credit, 25);
  assert.equal(cafe(a, 30, 'bow-complete').ok, false);
  a.send({ type: 'move', x: 14.8, z: 30.855, yaw: 0, pose: 'walk' });
  assert.equal(
    cafe(a, 31, 'mint', { mode: 'self', kind: 'americano', temperature: 'hot' }).ok,
    true,
  );
  assert.equal(a.last('cafe25-state').state.credit, 0);
  assert.equal(cafe(a, 32, 'seat', { seatId: 'lotus-seat-west' }).ok, true);
  assert.equal(cafe(b, 1, 'seat', { seatId: 'lotus-seat-west' }).code, 'seat-taken');
  assert.equal(cafe(a, 33, 'stand').ok, true);
  assert.equal(cafe(b, 2, 'seat', { seatId: 'lotus-seat-west' }).ok, true);
});
test('construction validates station, order and duplicate delivery', () => {
  const { join } = fixture();
  const a = join();
  const action = (id, value, x, z) => {
    a.send({ type: 'move', x, z, yaw: 0, pose: 'walk' });
    a.send({ type: 'construction', requestId: id, action: value });
    return a.last('construction-result');
  };
  assert.equal(action(1, 'take', -2.9, 2.05).ok, false);
  assert.equal(action(2, 'equip', -6.8, 2.05).ok, true);
  assert.equal(action(3, 'take', -2.9, 2.05).ok, true);
  assert.equal(action(4, 'drop', -9.05, -25.04).ok, true);
  assert.equal(action(4, 'drop', -9.05, -25.04).ok, true);
  assert.equal(a.last('construction-state').state.tiles, 1);
});
test('brew completion automatically places the cup in the visitor hands', () => {
  const { join, advance } = fixture();
  const a = join();
  a.send({ type: 'move', x: 14.8, z: 30.855, yaw: 0, pose: 'walk' });
  a.send({
    type: 'cafe25',
    requestId: 1,
    action: 'mint',
    payload: { mode: 'gift', kind: 'americano', temperature: 'hot' },
  });
  advance(5001);
  assert.equal(a.last('cafe25-state').state.cup.pickedUp, true);
});
test('joining behind an active ritual cannot reset its start or extend the head lease', () => {
  const { join, hub, advance } = fixture();
  const a = join(),
    b = join();
  for (const c of [a, b]) c.send({ type: 'move', x: 0, z: 13.06, yaw: 0, pose: 'walk' });
  a.send({ type: 'incense-join', requestId: 1 });
  a.send({ type: 'incense-start' });
  const started = hub.room('maru').activities.started,
    expires = hub.room('maru').activities.queue.expiresAt;
  advance(30000);
  b.send({ type: 'incense-join', requestId: 1 });
  assert.deepEqual(hub.room('maru').activities.started, started);
  assert.equal(hub.room('maru').activities.queue.expiresAt, expires);
  advance(30001);
  assert.equal(hub.room('maru').activities.queue.activeId, b.session.visitor.id);
});
test('mutating requests without valid positive request IDs cannot change state', () => {
  const { join } = fixture();
  const a = join();
  a.send({ type: 'move', x: 14.8, z: 30.855, yaw: 0, pose: 'walk' });
  a.send({
    type: 'cafe25',
    action: 'mint',
    payload: { mode: 'gift', kind: 'americano', temperature: 'hot' },
  });
  assert.equal(a.last('error').code, 'invalid-message');
  assert.equal(a.session.room.cafe.cup(a.session.visitor.id), null);
});
test('a transient disconnect restores held coffee with the same visitor', () => {
  const { join, hub, advance } = fixture();
  const a = join();
  a.send({ type: 'move', x: 14.8, z: 30.855, yaw: 0, pose: 'walk' });
  a.send({
    type: 'cafe25',
    requestId: 1,
    action: 'mint',
    payload: { mode: 'gift', kind: 'americano', temperature: 'hot' },
  });
  advance(5001);
  const cup = a.last('cafe25-state').state.cup,
    token = a.last('snapshot').visitToken;
  hub.disconnect(a.session);
  const b = join('maru', token);
  assert.equal(b.last('snapshot').cafe25.cup.id, cup.id);
  assert.equal(b.last('snapshot').cafe25.cup.pickedUp, true);
});
test('incense join accepts the source UI entry point before approaching the altar', () => {
  const { join } = fixture();
  const a = join();
  a.send({ type: 'move', x: 0, z: 19.07, yaw: 0, pose: 'walk' });
  a.send({ type: 'incense-join', requestId: 1 });
  assert.equal(a.last('incense-queue-result').accepted, true);
});
test('automatic admission assigns the default URL to an available room', () => {
  const { hub, join } = fixture({ capacity: 2 });
  const a = join('auto');
  assert.equal(a.last('snapshot')?.room, 'maru');
  join('auto');
  const c = join('auto');
  assert.equal(c.last('snapshot')?.room, 'maru-02');
  assert.equal(hub.directory().rooms[0].count, 2);
});
test('a completed construction room delivers overflow to another room exactly once', () => {
  const { hub, join } = fixture();
  hub.room('maru').activities.tiles = 1000;
  const a = join();
  assert.equal(a.last('snapshot').construction.rules.participation, 'shared');
  const work = (requestId, action, x, z) => {
    a.send({ type: 'move', x, z, yaw: 0, pose: 'walk' });
    a.send({ type: 'construction', requestId, action });
    return a.last('construction-result');
  };
  assert.equal(work(1, 'equip', -6.8, 2.05).ok, true);
  assert.equal(work(2, 'take', -2.9, 2.05).ok, true);
  const delivered = work(3, 'drop', -9.05, -25.04);
  assert.equal(delivered.ok, true);
  assert.deepEqual(delivered.delivery, { room: 2, tiles: 1, goal: 1000 });
  work(3, 'drop', -9.05, -25.04);
  assert.equal(hub.room('maru-02').activities.tiles, 1);
});
test('all completed construction rooms close participation without exceeding the goal', () => {
  const { hub, join } = fixture();
  for (let i = 1; i <= 20; i++)
    hub.room(i === 1 ? 'maru' : 'maru-' + String(i).padStart(2, '0')).activities.tiles = 1000;
  const a = join();
  assert.equal(a.last('snapshot').construction.rules.participation, 'complete');
  a.send({ type: 'move', x: -6.8, z: 2.05, yaw: 0, pose: 'walk' });
  a.send({ type: 'construction', requestId: 1, action: 'equip' });
  assert.equal(a.last('construction-result').ok, false);
});
