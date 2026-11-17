// Public records and their actual, non-rejected relationships. Keep graph
// selection independent of source files: many searchable records are derived
// from evidence and database rows rather than standalone Markdown files.
function collectGraph(db) {
  const rows = db.prepare('SELECT id,title,kind,href FROM cards WHERE published=1 ORDER BY id').all();
  const index = new Map(rows.map((row, i) => [row.id, i]));
  const preferred = ['wikilink', 'dmce', 'distiller', 'mesh', 'note-property'];
  const present = db.prepare('SELECT DISTINCT origin FROM relations ORDER BY origin').all().map(row => row.origin);
  const origins = preferred.filter(origin => present.includes(origin)).concat(present.filter(origin => !preferred.includes(origin)));
  if (origins.length > 16) throw new Error('Graph relationship masks support at most 16 origins.');
  const originIndex = new Map(origins.map((origin, i) => [origin, i]));
  const pairBits = new Map(), stride = Math.max(1, rows.length);
  if (!Number.isSafeInteger(stride * stride)) throw new Error('Graph exceeds safe pair indexing.');
  const relationCounts = origins.map(() => 0);
  for (const row of db.prepare(`SELECT source,target,origin FROM relations
    WHERE coalesce(predicate,'')!='none' AND coalesce(status,'') NOT IN ('none','rejected')`).iterate()) {
    const a = index.get(row.source), b = index.get(row.target);
    if (a === undefined || b === undefined || a === b) continue;
    const origin = originIndex.get(row.origin);
    relationCounts[origin]++;
    const key = Math.min(a, b) * stride + Math.max(a, b);
    pairBits.set(key, (pairBits.get(key) || 0) | (1 << origin));
  }
  const pairs = new Uint32Array(pairBits.size * 2), bits = new Uint16Array(pairBits.size);
  let i = 0;
  for (const [key, mask] of pairBits) {
    pairs[i * 2] = Math.floor(key / stride); pairs[i * 2 + 1] = key % stride;
    bits[i++] = mask;
  }
  return {rows, index, origins, pairs, bits, relationCounts};
}
module.exports = {collectGraph};
