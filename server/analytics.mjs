import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayKey = (timestamp) => calendar.format(timestamp);
const counts = `COALESCE(SUM(kind='pageview'),0) AS pv,
  COUNT(DISTINCT CASE WHEN kind='pageview' THEN visitor END) AS uv,
  COALESCE(SUM(kind='enter'),0) AS entries,
  COUNT(DISTINCT CASE WHEN kind='enter' THEN visitor END) AS enteredUsers`;
const empty = () => ({ pv: 0, uv: 0, entries: 0, enteredUsers: 0 });

export function createAnalytics({ path = ':memory:', now = Date.now } = {}) {
  if (path !== ':memory:') {
    path = resolve(path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }
  const db = new DatabaseSync(path);
  if (path !== ':memory:') {
    path = realpathSync(path);
    chmodSync(path, 0o600);
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY, visitor TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('pageview','enter')),
      timestamp INTEGER NOT NULL, day TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS visits_day ON visits(day,kind,visitor);`);
  db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('startedAt', String(now()));
  const startedAt = Number(
    db.prepare("SELECT value FROM metadata WHERE key='startedAt'").get().value,
  );
  const insert = db.prepare('INSERT INTO visits VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING');
  const total = db.prepare(`SELECT ${counts} FROM visits`);
  const days = db.prepare(`SELECT day AS date, ${counts} FROM visits WHERE day>=? GROUP BY day`);
  return {
    path,
    record(event) {
      if (
        !event ||
        typeof event.id !== 'string' ||
        typeof event.visitor !== 'string' ||
        !uuid.test(event.id) ||
        !uuid.test(event.visitor) ||
        !['pageview', 'enter'].includes(event.type)
      )
        throw new Error('Invalid analytics event');
      const timestamp = now();
      return (
        insert.run(
          event.id.toLowerCase(),
          event.visitor.toLowerCase(),
          event.type,
          timestamp,
          dayKey(timestamp),
        ).changes > 0
      );
    },
    report() {
      const timestamp = now();
      const dates = Array.from({ length: 30 }, (_, i) => dayKey(timestamp - i * 86400000));
      const rows = new Map(days.all(dates.at(-1)).map((row) => [row.date, { ...row }]));
      const series = dates.map((date) =>
        date < dayKey(startedAt)
          ? { date, pv: null, uv: null, entries: null, enteredUsers: null, collected: false }
          : { ...(rows.get(date) ?? { date, ...empty() }), collected: true },
      );
      return {
        startedAt: new Date(startedAt).toISOString(),
        updatedAt: new Date(timestamp).toISOString(),
        timeZone: 'Asia/Shanghai',
        total: { ...total.get() },
        today: series[0],
        days: series,
      };
    },
    close() {
      db.close();
    },
  };
}
