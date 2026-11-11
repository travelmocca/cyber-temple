function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function recommend(temples, categoryId, seen = [], previous = [], random = Math.random) {
  const pool = temples.filter(
    (t) => t.enabled !== false && t.wishes.some((w) => w.categoryId === categoryId),
  );
  const validIds = new Set(pool.map((t) => t.id));
  let visited = new Set(seen.filter((id) => validIds.has(id)));
  const newRound = pool.length > 0 && visited.size === pool.length;
  if (newRound) visited = new Set();
  const unseen = pool.filter((t) => !visited.has(t.id));
  const last = new Set(previous);
  // Avoid the last batch when a new round begins; all unseen entries still get a turn.
  const ordered = [
    ...shuffle(
      unseen.filter((t) => !last.has(t.id)),
      random,
    ),
    ...shuffle(
      unseen.filter((t) => last.has(t.id)),
      random,
    ),
    ...shuffle(
      pool.filter((t) => visited.has(t.id) && !last.has(t.id)),
      random,
    ),
    ...shuffle(
      pool.filter((t) => visited.has(t.id) && last.has(t.id)),
      random,
    ),
  ];
  const ids = ordered.slice(0, 5).map((t) => t.id);
  const repeated = !newRound && ids.some((id) => visited.has(id));
  return { ids, seen: [...new Set([...visited, ...ids])], repeated, newRound, total: pool.length };
}
