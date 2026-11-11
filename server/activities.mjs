import * as incense from './activities/incense.mjs';
import * as construction from './activities/construction.mjs';
export { Cafe25 } from './activities/cafe25.mjs';

// Published client constants: queue lease 60s, offering lifetime 120s.
// shortcut: server-side proximity and scheduling are replacements; original server rules are not published.
// Preserve public state and methods for existing callers while separating the rules.
export class Activities {
  constructor(now, broadcast, options = {}) {
    this.now = now;
    this.broadcast = broadcast;
    this.options = options;
    this.incense = [];
    this.queue = { revision: 0, members: [], activeId: null, expiresAt: 0 };
    this.started = null;
    this.lanterns = [];
    this.tiles = 0;
    this.workers = [];
  }
  nearIncense(visitor) {
    return incense.nearIncense(this, visitor);
  }
  queueChanged() {
    return incense.queueChanged(this);
  }
  join(visitor) {
    return incense.join(this, visitor);
  }
  leave(id) {
    return incense.leave(this, id);
  }
  start(visitor) {
    return incense.start(this, visitor);
  }
  offer(visitor) {
    return incense.offer(this, visitor);
  }
  remove(id) {
    this.leave(id);
    this.workers = this.workers.filter((worker) => worker.id !== id);
  }
  work(visitor, action) {
    return construction.work(this, visitor, action);
  }
  participation() {
    return construction.participation(this);
  }
  construction() {
    return construction.construction(this);
  }
  tick() {
    return incense.tick(this);
  }
}
