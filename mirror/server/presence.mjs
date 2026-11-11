import { randomUUID } from 'node:crypto';
import { Activities, Cafe25 } from './activities.mjs';
import { MAP, roomIDs } from './protocol/constants.mjs';
import { dispatchMessage } from './protocol/dispatch.mjs';
export { MAP, roomIDs, CLIENT_SEND_TYPES } from './protocol/constants.mjs';

// Owns room/session lifecycle; protocol dispatch and activity rules live in separate modules.
export class PresenceHub {
  constructor({
    now = Date.now,
    capacity = 50,
    cushions = Array.from({ length: 24 }, (_, i) => i).filter((i) => ![0, 5, 6, 11].includes(i)),
  } = {}) {
    this.now = now;
    this.capacity = capacity;
    this.cushions = cushions;
    this.rooms = new Map();
    this.sessions = new Set();
    this.lapsed = new Map();
  }
  room(id) {
    if (!this.rooms.has(id)) {
      const currentRoom = { id, visitors: new Map(), sessions: new Set(), revision: 0 };
      currentRoom.activities = new Activities(this.now, (m) => this.broadcast(currentRoom, m), {
        participation: () =>
          currentRoom.activities.tiles < 1000
            ? 'local'
            : roomIDs.some(
                  (other) => other !== id && (this.rooms.get(other)?.activities.tiles ?? 0) < 1000,
                )
              ? 'shared'
              : 'complete',
        deliver: () => this.deliverConstruction(id),
        changed: () => this.publishConstruction(),
      });
      currentRoom.cafe = new Cafe25(this.now, currentRoom.visitors, () => {
        for (const session of currentRoom.sessions)
          session.send({
            type: 'cafe25-state',
            state: currentRoom.cafe.state(session.visitor.id),
            serverTime: this.now(),
          });
      });
      this.rooms.set(id, currentRoom);
    }
    return this.rooms.get(id);
  }
  deliverConstruction(from) {
    const id = roomIDs.find(
      (id) => id !== from && (this.rooms.get(id)?.activities.tiles ?? 0) < 1000,
    );
    if (!id) return null;
    const dest = this.room(id);
    dest.activities.tiles++;
    return { room: roomIDs.indexOf(id) + 1, tiles: dest.activities.tiles, goal: 1000 };
  }
  publishConstruction() {
    for (const currentRoom of this.rooms.values())
      this.broadcast(currentRoom, {
        type: 'construction-state',
        state: currentRoom.activities.construction(),
        serverTime: this.now(),
      });
  }
  directory() {
    return {
      ok: true,
      map: MAP,
      serverTime: this.now(),
      rooms: roomIDs.map((id, i) => ({
        id,
        number: i + 1,
        count: this.rooms.get(id)?.visitors.size ?? 0,
        capacity: this.capacity,
        checkedAt: this.now(),
        stale: false,
      })),
    };
  }
  broadcast(room, message) {
    for (const session of room.sessions) session.send(message);
  }
  delta(room, upserts = [], removed = []) {
    this.broadcast(room, {
      type: 'delta',
      map: MAP,
      room: room.id,
      revision: ++room.revision,
      upserts,
      removed,
      serverTime: this.now(),
    });
  }
  snapshot(session, requestId) {
    const currentRoom = session.room;
    return {
      type: 'snapshot',
      map: MAP,
      room: currentRoom.id,
      instance: 0,
      region: 'apac',
      selfId: session.visitor.id,
      visitors: [...currentRoom.visitors.values()],
      revision: currentRoom.revision,
      serverTime: this.now(),
      visitToken: session.token,
      resumed: session.resumed,
      entryIdle: true,
      incense: currentRoom.activities.incense,
      incenseQueue: currentRoom.activities.queue,
      ...(currentRoom.activities.started ? { incenseStarted: currentRoom.activities.started } : {}),
      construction: currentRoom.activities.construction(),
      cafe25: currentRoom.cafe.state(session.visitor.id),
      ...(requestId ? { requestId } : {}),
    };
  }
  connect({ room = 'maru', visit } = {}, send) {
    const session = { send, cache: new Map(), active: false };
    if (room === 'auto') {
      const available = roomIDs.find(
        (id) => (this.rooms.get(id)?.visitors.size ?? 0) < this.capacity,
      );
      if (!available) {
        send({ type: 'error', code: 'room-full' });
        return session;
      }
      room = available;
    }
    if (!roomIDs.includes(room)) {
      send({ type: 'error', code: 'invalid-room' });
      return session;
    }
    if (visit && [...this.sessions].some((x) => x.token === visit)) {
      send({ type: 'error', code: 'visit-in-use' });
      return session;
    }
    const currentRoom = this.room(room);
    if (currentRoom.visitors.size >= this.capacity) {
      send({ type: 'error', code: 'room-full' });
      return session;
    }
    const saved = visit && this.lapsed.get(visit),
      resume = !!saved && saved.until > this.now() && saved.room === room;
    const occupied = new Set([...currentRoom.visitors.values()].map((visitor) => visitor.seat));
    let seat = 0;
    while (occupied.has(seat)) seat++;
    const position = {
      x: seat === 0 ? 0 : Math.ceil(seat / 2) * (seat % 2 ? -2.4 : 2.4),
      z: 48 + Math.floor(seat / 9) * 2.4,
      yaw: 0,
    };
    session.visitor = resume
      ? { ...saved.visitor, seat, cushion: null, pose: 'walk' }
      : {
          id: randomUUID(),
          name: '고요한 방문자 ' + (seat + 1),
          seat,
          cushion: null,
          color: '#b9c5ba',
          joinedAt: this.now(),
          pose: 'walk',
          position,
        };
    delete session.visitor.bowAt;
    session.room = currentRoom;
    session.token = resume ? visit : randomUUID();
    session.resumed = resume;
    session.active = true;
    if (resume) this.lapsed.delete(visit);
    currentRoom.visitors.set(session.visitor.id, session.visitor);
    if (resume && saved.cup) currentRoom.cafe.cups.set(saved.cup.id, saved.cup);
    currentRoom.sessions.add(session);
    this.sessions.add(session);
    session.send(this.snapshot(session));
    this.delta(currentRoom, [session.visitor]);
    return session;
  }
  disconnect(session, save = true) {
    if (!session?.active) return;
    session.active = false;
    const currentRoom = session.room,
      cup = structuredClone(currentRoom.cafe.cup(session.visitor.id));
    currentRoom.activities.remove(session.visitor.id);
    currentRoom.cafe.remove(session.visitor.id);
    currentRoom.visitors.delete(session.visitor.id);
    currentRoom.sessions.delete(session);
    this.sessions.delete(session);
    if (save)
      this.lapsed.set(session.token, {
        visitor: structuredClone(session.visitor),
        room: currentRoom.id,
        cup,
        until: this.now() + 30 * 60000,
      });
    else this.lapsed.delete(session.token);
    this.delta(currentRoom, [], [session.visitor.id]);
  }
  receive(session, message) {
    return dispatchMessage(this, session, message);
  }
  tick() {
    for (const currentRoom of this.rooms.values()) {
      currentRoom.activities.tick();
      currentRoom.cafe.tick();
    }
    for (const [token, saved] of this.lapsed)
      if (saved.until <= this.now()) this.lapsed.delete(token);
  }
}
