const storageKey = 'temple-anonymous-visitor-v1';
const validID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
let visitor;
try {
  visitor = localStorage.getItem(storageKey);
  if (!validID.test(visitor)) {
    visitor = uuid();
    localStorage.setItem(storageKey, visitor);
  }
} catch {
  try {
    visitor = uuid();
  } catch {
    /* Tracking is optional on unsupported browsers. */
  }
}
function track(type) {
  if (!visitor) return;
  try {
    const payload = JSON.stringify({ id: uuid(), visitor, type });
    if (
      !navigator.sendBeacon?.('/api/analytics', new Blob([payload], { type: 'application/json' }))
    )
      fetch('/api/analytics', {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(() => {});
  } catch {
    /* Analytics must never interrupt temple entry. */
  }
}
let entered = false;
export function recordEntrance() {
  if (entered) return;
  entered = true;
  track('enter');
}
track('pageview');
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  track('pageview');
  if (entered) track('enter');
});
