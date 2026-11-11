import { randomUUID } from 'node:crypto';

// Source client defines the schema and 5s authoritative brew / 3-sip / 25-bow rules.
// shortcut: proximity, transfer timing and in-memory persistence are local replacements pending source-service parity evidence.
export class Cafe25 {
  constructor(now, visitors, publish) {
    this.now = now;
    this.visitors = visitors;
    this.publish = publish;
    this.epoch = randomUUID();
    this.revision = 0;
    this.accounts = new Map();
    this.cups = new Map();
    this.offers = new Map();
    this.seats = new Map();
    this.effects = new Map();
    this.completedBows = new Map();
  }
  account(id) {
    if (!this.accounts.has(id)) this.accounts.set(id, { bows: 0, credit: 0 });
    return this.accounts.get(id);
  }
  cup(id) {
    return [...this.cups.values()].find((candidateCup) => candidateCup.holderId === id) ?? null;
  }
  offer(id) {
    return [...this.offers.values()].find((offer) => offer.fromId === id || offer.toId === id);
  }
  state(id) {
    const accountState = this.account(id);
    return {
      authorityEpoch: this.epoch,
      revision: this.revision,
      selfId: id,
      ...accountState,
      cup: this.cup(id),
      outgoing: [...this.offers.values()].find((offer) => offer.fromId === id) ?? null,
      incoming: [...this.offers.values()].find((offer) => offer.toId === id) ?? null,
      cups: [...this.cups.values()],
      seats: [...this.seats].map(([seatId, visitorId]) => ({ seatId, visitorId })),
      effect: this.effects.get(id) ?? null,
      effects: [...this.effects].map(([visitorId, effect]) => ({ visitorId, ...effect })),
    };
  }
  changed() {
    this.revision++;
    this.publish();
  }
  clearOffers(id) {
    for (const [key, offer] of this.offers)
      if (offer.fromId === id || offer.toId === id) this.offers.delete(key);
  }
  remove(id) {
    this.clearOffers(id);
    for (const [key, value] of this.seats) if (value === id) this.seats.delete(key);
    const cup = this.cup(id);
    if (cup) this.cups.delete(cup.id);
    this.changed();
  }
  action(visitor, action, payload = {}) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) payload = {};
    const id = visitor.id,
      account = this.account(id),
      cup = this.cup(id),
      now = this.now();
    const fail = (code) => ({ ok: false, code, state: this.state(id) }),
      ok = () => {
        this.changed();
        return { ok: true, state: this.state(id) };
      };
    switch (action) {
      case 'sync':
        return { ok: true, state: this.state(id) };
      case 'measure':
        return { ok: true, state: this.state(id) };
      case 'bow-complete': {
        if (
          !Number.isFinite(visitor.bowAt) ||
          now - visitor.bowAt < 4700 ||
          this.completedBows.get(id) === visitor.bowAt ||
          visitor.pose !== 'kneel'
        )
          return fail('incomplete-bow');
        this.completedBows.set(id, visitor.bowAt);
        account.bows++;
        account.credit++;
        return ok();
      }
      case 'mint': {
        if (cup) return fail('already-holding');
        if (Math.hypot(visitor.position.x - 14.8, visitor.position.z - 30.855) > 1.1)
          return fail('machine-too-far');
        if (
          !['gift', 'self'].includes(payload.mode) ||
          !['americano', 'latte'].includes(payload.kind) ||
          !['hot', 'iced'].includes(payload.temperature)
        )
          return fail('invalid-cup');
        if (payload.mode === 'self' && account.credit < 25) return fail('need-25-bows');
        if (payload.mode === 'self') account.credit -= 25;
        const candidateCup = {
          id: randomUUID(),
          holderId: id,
          mode: payload.mode,
          kind: payload.kind,
          temperature: payload.temperature,
          sips: 0,
          readyAt: now + 5000,
          pickedUp: false,
        };
        this.cups.set(candidateCup.id, candidateCup);
        return ok();
      }
      case 'pickup':
        if (!cup) return fail('no-cup');
        if (cup.readyAt > now) return fail('not_ready');
        cup.pickedUp = true;
        return ok();
      case 'sip':
        if (!cup || !cup.pickedUp) return fail('no-cup');
        if (cup.mode === 'gift') return fail('cannot-drink-gift');
        if (cup.sips >= 3) return fail('cup-empty');
        cup.sips++;
        if (cup.sips === 3) this.effects.set(id, { startedAt: now, until: now + 300000 });
        return ok();
      case 'clear':
        if (!cup) return ok();
        if (payload.cupId !== cup.id) return fail('stale-cup');
        if (cup.pickedUp) return fail('bin-required');
        this.cups.delete(cup.id);
        this.clearOffers(id);
        return ok();
      case 'dispose':
        if (!cup) return fail('no-cup');
        if (payload.cupId !== cup.id) return fail('stale-cup');
        if (typeof payload.binId !== 'string' || payload.binId.length > 80)
          return fail('invalid-bin');
        this.cups.delete(cup.id);
        this.clearOffers(id);
        return ok();
      case 'offer':
      case 'request': {
        const target = this.visitors.get(payload.targetId);
        if (!target || target.id === id) return fail('recipient-too-far');
        if (
          Math.hypot(
            target.position.x - visitor.position.x,
            target.position.z - visitor.position.z,
          ) > 5
        )
          return fail('recipient-too-far');
        if (this.offer(id) || this.offer(target.id)) return fail('offer-pending');
        const from = action === 'offer' ? visitor : target,
          to = action === 'offer' ? target : visitor,
          candidateCup = this.cup(from.id);
        if (!candidateCup || candidateCup.mode !== 'gift' || !candidateCup.pickedUp)
          return fail('gift-cup-required');
        if (this.cup(to.id)) return fail('recipient-holding');
        const offer = {
          id: randomUUID(),
          cupId: candidateCup.id,
          fromId: from.id,
          toId: to.id,
          expiresAt: now + 60000,
          ...(action === 'request' ? { requested: true, approved: false } : {}),
        };
        this.offers.set(offer.id, offer);
        return ok();
      }
      case 'approve': {
        const offer = this.offers.get(payload.offerId);
        if (!offer || offer.fromId !== id) return fail('offer-missing');
        offer.approved = true;
        return ok();
      }
      case 'accept': {
        const offer = this.offers.get(payload.offerId);
        if (!offer || offer.toId !== id || offer.expiresAt <= now) return fail('offer-missing');
        if (offer.requested && !offer.approved) return fail('not_ready');
        const candidateCup = this.cups.get(offer.cupId),
          from = this.visitors.get(offer.fromId);
        if (!candidateCup || !from || this.cup(id)) return fail('recipient-holding');
        if (
          Math.hypot(from.position.x - visitor.position.x, from.position.z - visitor.position.z) >
          0.85
        )
          return fail('too-far');
        candidateCup.holderId = id;
        candidateCup.mode = 'received';
        this.offers.delete(offer.id);
        return ok();
      }
      case 'cancel':
        this.clearOffers(id);
        return ok();
      case 'decline': {
        const offer = this.offers.get(payload.offerId);
        if (!offer || (offer.toId !== id && offer.fromId !== id)) return fail('offer-missing');
        this.offers.delete(offer.id);
        return ok();
      }
      case 'seat': {
        if (typeof payload.seatId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(payload.seatId))
          return fail('invalid-seat');
        if (this.seats.has(payload.seatId) && this.seats.get(payload.seatId) !== id)
          return fail('seat-taken');
        for (const [key, value] of this.seats) if (value === id) this.seats.delete(key);
        this.seats.set(payload.seatId, id);
        return ok();
      }
      case 'stand':
        for (const [key, value] of this.seats) if (value === id) this.seats.delete(key);
        return ok();
      default:
        return fail('unsupported-action');
    }
  }
  tick() {
    let dirty = false;
    for (const candidateCup of this.cups.values())
      if (!candidateCup.pickedUp && candidateCup.readyAt <= this.now()) {
        candidateCup.pickedUp = true;
        dirty = true;
      }
    for (const [id, offer] of this.offers)
      if (offer.expiresAt <= this.now()) {
        this.offers.delete(id);
        dirty = true;
      }
    for (const [id, effect] of this.effects)
      if (effect.until <= this.now()) {
        this.effects.delete(id);
        dirty = true;
      }
    if (dirty) this.changed();
  }
}
