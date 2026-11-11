import { randomUUID } from 'node:crypto';

// Queue lease 60s and offering lifetime 120s, unchanged from the local backend.
export function nearIncense(state, visitor) {
  return Math.hypot(visitor.position.x, visitor.position.z - 13.058) <= 7.5;
}

export function queueChanged(state) {
  state.queue.revision++;
  const activeId = state.queue.members[0] ?? null;
  if (activeId !== state.queue.activeId) {
    state.queue.activeId = activeId;
    state.queue.expiresAt = activeId ? state.now() + 60000 : 0;
    state.started = null;
  }
  state.broadcast({
    type: 'incense-queue',
    queue: structuredClone(state.queue),
    serverTime: state.now(),
  });
}

export function join(state, visitor) {
  if (
    !state.nearIncense(visitor) ||
    state.incense.some((offering) => offering.visitorId === visitor.id)
  )
    return false;
  if (!state.queue.members.includes(visitor.id)) {
    state.queue.members.push(visitor.id);
    state.queueChanged();
  }
  return true;
}

export function leave(state, id) {
  const index = state.queue.members.indexOf(id);
  if (index < 0) return;
  state.queue.members.splice(index, 1);
  if (index === 0) state.queueChanged();
  else {
    state.queue.revision++;
    state.broadcast({
      type: 'incense-queue',
      queue: structuredClone(state.queue),
      serverTime: state.now(),
    });
  }
}

export function start(state, visitor) {
  if (state.queue.activeId !== visitor.id || state.started) return;
  state.started = { id: visitor.id, at: state.now() };
  state.broadcast({ type: 'incense-start', ...state.started, serverTime: state.now() });
}

export function offer(state, visitor) {
  if (
    state.queue.activeId !== visitor.id ||
    !state.started ||
    state.incense.some((offering) => offering.visitorId === visitor.id)
  )
    return false;
  const offering = {
    id: randomUUID(),
    visitorId: visitor.id,
    at: state.now(),
    expiresAt: state.now() + 120000,
  };
  state.incense.push(offering);
  state.broadcast({ type: 'incense', offering, serverTime: state.now() });
  return true;
}

export function tick(state) {
  state.incense = state.incense.filter((offering) => offering.expiresAt > state.now());
  if (state.queue.members.length && state.queue.expiresAt <= state.now()) {
    state.queue.members.shift();
    state.queueChanged();
  }
}
