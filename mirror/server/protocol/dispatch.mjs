import { MAP, roomIDs, cushionPoint } from './constants.mjs';

// Keep validation, request caching and event ordering together.
export function dispatchMessage(hub, session, message) {
  if (!session?.active) return;
  if (
    !message ||
    typeof message !== 'object' ||
    Array.isArray(message) ||
    typeof message.type !== 'string'
  )
    return session.send({ type: 'error', code: 'invalid-message' });
  const room = session.room,
    visitor = session.visitor,
    activities = room.activities,
    now = hub.now();
  const reply = (message) => session.send({ ...message, serverTime: now });
  const key =
    Number.isSafeInteger(message.requestId) && message.requestId > 0
      ? message.type + ':' + message.requestId
      : null;
  if (
    [
      'seat',
      'incense',
      'incense-join',
      'room-switch',
      'construction',
      'lantern-yard-hang',
      'cafe25',
      'interest',
    ].includes(message.type) &&
    !key
  )
    return reply({ type: 'error', code: 'invalid-message' });
  if (key && session.cache.has(key)) return reply(session.cache.get(key));
  const result = (message) => {
    if (key) {
      session.cache.set(key, message);
      if (session.cache.size > 128) session.cache.delete(session.cache.keys().next().value);
    }
    reply(message);
  };
  switch (message.type) {
    case 'move':
      if (
        ![message.x, message.z, message.yaw].every(Number.isFinite) ||
        Math.abs(message.x) > 300 ||
        Math.abs(message.z) > 300 ||
        !['walk', 'kneel', 'beads', 'dance'].includes(message.pose)
      )
        return reply({ type: 'error', code: 'invalid-message' });
      visitor.position = { x: message.x, z: message.z, yaw: message.yaw };
      visitor.pose = message.pose;
      hub.delta(room, [visitor]);
      break;
    case 'stand':
      visitor.cushion = null;
      visitor.pose = 'walk';
      delete visitor.bowAt;
      hub.delta(room, [visitor]);
      break;
    case 'hello':
    case 'bead':
    case 'bow':
      if (message.type === 'bow') {
        visitor.bowAt = now;
        hub.delta(room, [visitor]);
      }
      hub.broadcast(room, {
        type: 'event',
        room: room.id,
        event: { type: message.type, id: visitor.id },
        serverTime: now,
      });
      break;
    case 'seat': {
      if (!key) return reply({ type: 'error', code: 'invalid-message' });
      const used = new Set(
        [...room.visitors.values()]
          .filter((otherVisitor) => otherVisitor !== visitor)
          .map((otherVisitor) => otherVisitor.cushion),
      );
      const free = hub.cushions
        .filter((i) => !used.has(i))
        .sort((i, j) => {
          const p = cushionPoint(i),
            q = cushionPoint(j);
          return (
            Math.hypot(p.x - visitor.position.x, p.z - visitor.position.z) -
            Math.hypot(q.x - visitor.position.x, q.z - visitor.position.z)
          );
        });
      if (!free.length) return result({ type: 'seat-unavailable', requestId: message.requestId });
      visitor.cushion = free[0];
      result({ type: 'seat-granted', seat: visitor.cushion, requestId: message.requestId });
      hub.delta(room, [visitor]);
      break;
    }
    case 'incense-join':
      result({
        type: 'incense-queue-result',
        requestId: message.requestId,
        accepted: !!key && activities.join(visitor),
      });
      break;
    case 'incense-start':
      activities.start(visitor);
      break;
    case 'incense-leave':
    case 'incense-abandon':
      activities.leave(visitor.id);
      break;
    case 'incense':
      result({
        type: 'incense-result',
        requestId: message.requestId,
        accepted: !!key && activities.offer(visitor),
      });
      break;
    case 'sync':
      session.send(hub.snapshot(session));
      break;
    case 'ping':
      reply({ type: 'pong' });
      break;
    case 'pong':
    case 'ack':
    case 'entry-active':
      break;
    case 'entry-idle':
      hub.disconnect(session);
      break;
    case 'leave':
      hub.disconnect(session, false);
      break;
    case 'room-switch': {
      if (!roomIDs.includes(message.room) || hub.room(message.room).visitors.size >= hub.capacity)
        return result({ type: 'room-switch-denied', requestId: message.requestId });
      activities.remove(visitor.id);
      room.cafe.remove(visitor.id);
      room.visitors.delete(visitor.id);
      room.sessions.delete(session);
      hub.delta(room, [], [visitor.id]);
      const dest = hub.room(message.room);
      session.room = dest;
      session.cache.clear();
      visitor.cushion = null;
      visitor.pose = 'walk';
      const used = new Set([...dest.visitors.values()].map((otherVisitor) => otherVisitor.seat));
      visitor.seat = 0;
      while (used.has(visitor.seat)) visitor.seat++;
      dest.visitors.set(visitor.id, visitor);
      dest.sessions.add(session);
      session.send(hub.snapshot(session, message.requestId));
      hub.delta(dest, [visitor]);
      break;
    }
    case 'interest':
      reply({
        type: 'update',
        room: room.id,
        revision: room.revision,
        interestId: message.requestId,
        visitors: [...room.visitors.values()],
      });
      break;
    case 'village-bell':
      hub.broadcast(room, { type: 'village-bell', id: visitor.id, at: now, serverTime: now });
      break;
    case 'construction': {
      const delivery = activities.work(visitor, message.action);
      result({
        type: 'construction-result',
        requestId: message.requestId,
        ok: !!delivery,
        ...(delivery && typeof delivery === 'object' ? { delivery } : {}),
      });
      break;
    }
    case 'lantern-yard-hang':
      result({ type: 'lantern-yard-result', requestId: message.requestId, result: 'unavailable' });
      break;
    case 'cafe25':
      result({
        type: 'cafe25-result',
        requestId: message.requestId,
        result: room.cafe.action(visitor, message.action, message.payload),
      });
      break;
    default:
      reply({ type: 'error', code: 'unsupported-message' });
  }
}
