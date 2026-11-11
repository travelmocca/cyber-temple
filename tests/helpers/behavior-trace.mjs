import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';

// Deterministic IDs are installed only in this test process, never in the server.
export async function captureBehavior(moduleURL) {
  const originalUUID = crypto.randomUUID;
  let nextId = 0;
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
  syncBuiltinESMExports();
  try {
    const { PresenceHub, roomIDs, CLIENT_SEND_TYPES, MAP } = await import(moduleURL.href);
    const trace = [{ constants: { MAP, roomIDs, CLIENT_SEND_TYPES } }];
    const clean = (value) =>
      JSON.parse(
        JSON.stringify(value, (_key, item) => {
          if (item instanceof Map) return { map: [...item] };
          if (item instanceof Set) return { set: [...item] };
          return item;
        }),
      );
    function fixture(name, options = {}) {
      let now = 1800000000000;
      const hub = new PresenceHub({ ...options, now: () => now });
      const clients = new Map();
      let messages = [];
      const state = () =>
        clean({
          rooms: [...hub.rooms].map(([id, room]) => ({
            id,
            revision: room.revision,
            visitors: room.visitors,
            sessions: [...room.sessions].map((s) => s.visitor.id),
            activities: Object.fromEntries(
              Object.entries(room.activities).filter(
                ([k]) => !['now', 'broadcast', 'options'].includes(k),
              ),
            ),
            cafe: Object.fromEntries(
              Object.entries(room.cafe).filter(
                ([k]) => !['now', 'visitors', 'publish'].includes(k),
              ),
            ),
          })),
          lapsed: hub.lapsed,
          sessions: [...clients].map(([label, s]) => ({
            label,
            active: s.active,
            token: s.token,
            resumed: s.resumed,
            visitor: s.visitor,
            room: s.room?.id,
            cache: s.cache,
          })),
          directory: hub.directory(),
        });
      const step = (label, fn) => {
        fn();
        trace.push({ scenario: name, step: label, messages, state: state() });
        messages = [];
      };
      const join = (label, room = 'maru', visit) =>
        step(`join ${label} ${room}`, () => {
          clients.set(
            label,
            hub.connect({ room, visit }, (message) =>
              messages.push({ client: label, message: clean(message) }),
            ),
          );
        });
      const send = (label, message) =>
        step(`send ${label} ${JSON.stringify(message)}`, () =>
          hub.receive(clients.get(label), message),
        );
      const advance = (ms) =>
        step(`advance ${ms}`, () => {
          now += ms;
          hub.tick();
        });
      const move = (label, x, z, pose = 'walk') =>
        send(label, { type: 'move', x, z, yaw: 0, pose });
      const cafe = (label, action, payload = {}) => {
        const id = (clients.get(label).testRequestId ?? 100) + 1;
        clients.get(label).testRequestId = id;
        send(label, { type: 'cafe25', requestId: id, action, payload });
      };
      return { hub, clients, step, join, send, advance, move, cafe };
    }

    {
      const f = fixture('admission, validation, request cache and resume', {
        capacity: 2,
        cushions: [1],
      });
      const { hub, clients, step, join, send, move, advance } = f;
      join('a');
      join('b');
      join('full');
      join('other', 'auto');
      join('bad', 'invalid');
      const token = clients.get('a').token;
      join('duplicate', 'maru', token);
      for (const message of [
        null,
        [],
        'hello',
        {},
        { type: 1 },
        { type: 'unknown' },
        { type: 'seat' },
        { type: 'seat', requestId: 0 },
        { type: 'seat', requestId: -1 },
        { type: 'seat', requestId: 1.5 },
        { type: 'move', x: NaN, z: 1, yaw: 0, pose: 'walk' },
        { type: 'move', x: 301, z: 1, yaw: 0, pose: 'walk' },
        { type: 'move', x: 0, z: 1, yaw: 0, pose: 'unknown' },
      ])
        send('a', message);
      move('a', 300, -300);
      send('a', { type: 'seat', requestId: 1 });
      send('b', { type: 'seat', requestId: 1 });
      send('a', { type: 'stand' });
      send('a', { type: 'seat', requestId: 1 });
      send('b', { type: 'seat', requestId: 2 });
      for (const type of [
        'hello',
        'bead',
        'bow',
        'sync',
        'ping',
        'pong',
        'ack',
        'entry-active',
        'village-bell',
        'interest',
        'lantern-yard-hang',
      ])
        send('a', { type, requestId: 3 });
      send('a', { type: 'room-switch', room: 'maru', requestId: 4 });
      send('a', { type: 'room-switch', room: 'invalid', requestId: 5 });
      send('a', { type: 'room-switch', room: 'maru-02', requestId: 6 });
      send('a', { type: 'room-switch', room: 'maru-02', requestId: 6 });
      send('a', { type: 'entry-idle' });
      send('a', { type: 'ping' });
      join('resumed', 'maru-02', token);
      send('resumed', { type: 'leave' });
      join('fresh', 'maru-02', token);
      step('disconnect twice', () => {
        hub.disconnect(clients.get('fresh'));
        hub.disconnect(clients.get('fresh'));
      });
      advance(30 * 60000);
      join('expired', 'maru-02', clients.get('fresh').token);
      // More than 128 request keys exercises eviction and an eventual replay.
      for (let id = 1; id <= 130; id++)
        send('expired', { type: 'lantern-yard-hang', requestId: id });
      send('expired', { type: 'lantern-yard-hang', requestId: 1 });
    }
    {
      const { hub, clients, step, join, send, advance, move } = fixture(
        'incense queue and exact expiry boundaries',
      );
      for (const label of ['a', 'b', 'c']) {
        join(label);
        move(label, 0, 13.058);
      }
      send('a', { type: 'incense', requestId: 1 });
      send('a', { type: 'incense-join', requestId: 2 });
      send('a', { type: 'incense-join', requestId: 3 });
      send('a', { type: 'incense-start' });
      advance(30000);
      send('b', { type: 'incense-join', requestId: 1 });
      send('c', { type: 'incense-join', requestId: 1 });
      send('b', { type: 'incense-start' });
      send('c', { type: 'incense-abandon' });
      send('a', { type: 'incense', requestId: 4 });
      send('a', { type: 'incense', requestId: 5 });
      advance(30000);
      send('b', { type: 'incense-start' });
      send('b', { type: 'incense', requestId: 2 });
      step('head disconnect', () => hub.disconnect(clients.get('b')));
      advance(89999);
      advance(1);
      advance(30000);
      move('a', 7.5, 13.058);
      send('a', { type: 'incense-join', requestId: 6 });
      send('a', { type: 'incense-leave' });
      move('a', 7.50001, 13.058);
      send('a', { type: 'incense-join', requestId: 7 });
    }
    {
      const { hub, step, join, send, move } = fixture(
        'construction local, shared, complete and station limits',
      );
      join('a');
      let id = 0;
      const work = (action, x, z) => {
        move('a', x, z);
        send('a', { type: 'construction', requestId: ++id, action });
      };
      work('take', -2.9, 2.05);
      work('equip', -6.8, 2.05);
      work('equip', -6.8, 2.05);
      work('take', -2.9, 2.05);
      work('return', -6.8, 2.05);
      work('drop', -9.05, -25.04);
      send('a', { type: 'construction', requestId: id, action: 'drop' });
      work('return', -6.8, 2.05);
      step('local room completed', () => {
        hub.room('maru').activities.tiles = 1000;
      });
      work('equip', -6.8, 2.05);
      work('take', -2.9, 2.05);
      work('drop', -9.05, -25.04);
      step('all rooms completed', () => {
        for (const room of roomIDs) hub.room(room).activities.tiles = 1000;
      });
      work('take', -2.9, 2.05);
      work('return', -6.8, 2.05);
      work('equip', -6.8, 2.05);
      work('invalid', -6.8, 2.05);
    }
    {
      const { hub, clients, step, join, send, advance, move, cafe } = fixture(
        'coffee credits, cups, expiry and retained accounts',
      );
      join('a');
      join('b');
      for (const action of [
        'sync',
        'measure',
        'pickup',
        'sip',
        'clear',
        'dispose',
        'bow-complete',
        'unknown',
      ])
        cafe('a', action);
      cafe('a', 'mint', { mode: 'gift', kind: 'americano', temperature: 'hot' });
      move('a', 14.8, 30.855);
      cafe('a', 'mint', null);
      cafe('a', 'mint', []);
      cafe('a', 'mint', { mode: 'self', kind: 'americano', temperature: 'hot' });
      move('a', 0, 14.3, 'kneel');
      for (let i = 0; i < 25; i++) {
        send('a', { type: 'bow' });
        advance(4699);
        cafe('a', 'bow-complete');
        advance(1);
        cafe('a', 'bow-complete');
        cafe('a', 'bow-complete');
      }
      move('a', 14.8, 30.855);
      cafe('a', 'mint', { mode: 'self', kind: 'latte', temperature: 'iced' });
      cafe('a', 'mint', { mode: 'gift', kind: 'americano', temperature: 'hot' });
      cafe('a', 'clear', { cupId: 'stale' });
      cafe('a', 'pickup');
      advance(4999);
      cafe('a', 'sip');
      advance(1);
      cafe('a', 'clear', { cupId: clients.get('a').room.cafe.cup(clients.get('a').visitor.id).id });
      for (let i = 0; i < 4; i++) cafe('a', 'sip');
      for (const seatId of ['Invalid', '', 'a'.repeat(81), 'garden-1'])
        cafe('a', 'seat', { seatId });
      cafe('b', 'seat', { seatId: 'garden-1' });
      cafe('a', 'seat', { seatId: 'garden-2' });
      cafe('a', 'stand');
      advance(299999);
      advance(1);
      const cupId = clients.get('a').room.cafe.cup(clients.get('a').visitor.id).id;
      cafe('a', 'dispose', { cupId, binId: 1 });
      cafe('a', 'dispose', { cupId, binId: 'a'.repeat(81) });
      cafe('a', 'dispose', { cupId, binId: '' });
      cafe('a', 'mint', { mode: 'gift', kind: 'americano', temperature: 'hot' });
      const token = clients.get('a').token;
      step('disconnect before brew', () => hub.disconnect(clients.get('a')));
      advance(5000);
      join('resumed', 'maru', token);
      advance(0);
      step('disconnect everyone', () => {
        for (const s of clients.values()) hub.disconnect(s);
      });
      advance(31 * 60000);
      // Current account/completed-bow retention is deliberately part of this baseline.
    }
    {
      const { clients, join, advance, move, cafe } = fixture(
        'coffee gifting, requested approval and cancellation',
      );
      join('a');
      join('b');
      move('a', 14.8, 30.855);
      move('b', 14.8, 30.855);
      const id = (label) => clients.get(label).visitor.id;
      const offerId = () => clients.get('a').room.cafe.offer(id('a'))?.id;
      const mint = () => cafe('a', 'mint', { mode: 'gift', kind: 'americano', temperature: 'hot' });
      mint();
      cafe('a', 'clear', { cupId: clients.get('a').room.cafe.cup(id('a')).id });
      mint();
      advance(5000);
      cafe('a', 'sip');
      cafe('a', 'offer', { targetId: id('a') });
      cafe('a', 'offer', { targetId: 'missing' });
      move('b', 14.8, 35.856);
      cafe('a', 'offer', { targetId: id('b') });
      move('b', 14.8, 30.855);
      cafe('b', 'request', { targetId: id('a') });
      cafe('b', 'accept', { offerId: offerId() });
      cafe('a', 'offer', { targetId: id('b') });
      cafe('b', 'approve', { offerId: offerId() });
      cafe('a', 'approve', { offerId: offerId() });
      move('b', 14.8, 31.855);
      cafe('b', 'accept', { offerId: offerId() });
      move('b', 14.8, 30.855);
      cafe('b', 'accept', { offerId: offerId() });
      cafe('b', 'sip');
      cafe('a', 'accept', { offerId: 'missing' });
      mint();
      advance(5000);
      cafe('a', 'offer', { targetId: id('b') });
      const bCup = clients.get('b').room.cafe.cup(id('b')).id;
      cafe('b', 'dispose', { cupId: bCup, binId: 'bin' });
      cafe('a', 'offer', { targetId: id('b') });
      cafe('b', 'decline', { offerId: offerId() });
      cafe('a', 'offer', { targetId: id('b') });
      cafe('b', 'cancel');
      cafe('a', 'offer', { targetId: id('b') });
      advance(59999);
      advance(1);
      cafe('b', 'accept', { offerId: 'expired' });
      cafe('a', 'offer', { targetId: id('b') });
      cafe('b', 'accept', { offerId: offerId() });
    }
    return trace;
  } finally {
    crypto.randomUUID = originalUUID;
    syncBuiltinESMExports();
  }
}
