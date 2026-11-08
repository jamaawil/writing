// Packs the vault-wide claim graph (graph-nodes.json / graph-edges.json from
// the research snapshot; positions are precomputed) into compact files for the
// Zettel page's Constellation (static/js/constellation.js):
//   positions.bin  Float32 [x, y] per claim
//   categories.bin Uint8 category code per claim (255 = uncategorized)
//   edges.bin      Uint32 [source, target] per connection
//   reviewed.bin   Uint8 1 = reviewed connection
//   labels.json    [[title, readable slug], ...] in claim order
//   meta.json      counts, category names, bounds
// Each claim links to its research record (graph id X = record d:X).
// Usage: node scripts/research-constellation.js   -> .research/.../constellation/<version>/
const fs = require('node:fs'), path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const pointer = require('../.research/current.json');
const dir = path.dirname(pointer.database);
const CATEGORIES = ['causal_relationships', 'factual_claims', 'contrarian_or_surprising', 'definitional_content',
  'craft_and_method', 'connection_points', 'inspiration_and_speculation'];

// Every vault note is a node (records that came from a vault file). Claims keep
// the precomputed map positions; other notes are placed at the centre of the
// notes they link to; notes with no links sit on an outer ring (as Obsidian
// shows orphans). Every connection between two vault notes is a line.
const graphNodes = new Map(JSON.parse(fs.readFileSync(path.join(dir, 'graph-nodes.json'), 'utf8')).map(n => ['d:' + n.id, n]));
const db = new DatabaseSync(path.join(dir, 'research-public.sqlite3'), {readOnly: true});
db.exec(`CREATE TEMP TABLE v AS SELECT DISTINCT s.entity_id id FROM source_files s JOIN cards c ON c.id=s.entity_id WHERE c.published=1`);
const rows = db.prepare(`SELECT c.id,c.title,c.kind,c.href FROM v JOIN cards c ON c.id=v.id ORDER BY c.id`).all();
const KINDS = ['claim'];   // kind 0 = claim; other kinds listed in meta.kinds
const index = new Map(), labels = [], kindCodes = [];
let unlinked = 0;
for (const r of rows) {
  const slug = r.href?.match(/^\/zettel\/research\/([^/]+)\/$/)?.[1] ?? null;
  const href = slug ? null : r.href;            // a few records point at writer pages (/library/...)
  if (!slug && !href) { unlinked++; continue; }
  let k = KINDS.indexOf(r.kind); if (k < 0) { k = KINDS.length; KINDS.push(r.kind); }
  index.set(r.id, labels.length);
  kindCodes.push(k);
  const title = r.title.length > 160 ? r.title.slice(0, 157) + '…' : r.title;
  labels.push(href ? [title, slug, href] : [title, slug]);
}
const count = labels.length;
// Connections: distinct note pairs, with a bit per link type present.
const ORIGINS = ['wikilink', 'dmce', 'distiller', 'mesh', 'note-property'];
const pairBits = new Map();
const rel = db.prepare(`SELECT r.source,r.target,r.origin FROM relations r JOIN v a ON a.id=r.source JOIN v b ON b.id=r.target
  WHERE coalesce(r.predicate,'')!='none' AND coalesce(r.status,'') NOT IN ('none','rejected')`);
let otherOrigin = 0;
for (const r of rel.iterate()) {
  const s = index.get(r.source), d = index.get(r.target);
  if (s === undefined || d === undefined || s === d) continue;
  const o = ORIGINS.indexOf(r.origin); if (o < 0) { otherOrigin++; continue; }
  const key = s < d ? s * 1048576 + d : d * 1048576 + s;
  pairBits.set(key, (pairBits.get(key) || 0) | (1 << o));
}
const pairs = new Uint32Array(pairBits.size * 2), bits = new Uint8Array(pairBits.size);
let e = 0;
for (const [key, b] of pairBits) { pairs[e * 2] = Math.floor(key / 1048576); pairs[e * 2 + 1] = key % 1048576; bits[e] = b; e++; }
// Positions: precomputed map for claims; barycentre of placed neighbours for the rest.
const positions = new Float32Array(count * 2), placed = new Uint8Array(count), categories = new Uint8Array(count).fill(255);
const CAT = Object.fromEntries(CATEGORIES.map((c, i) => [c, i]));
rows.forEach(r => { const i = index.get(r.id); if (i === undefined) return; const g = graphNodes.get(r.id);
  if (g) { positions[i * 2] = g.x; positions[i * 2 + 1] = g.y; placed[i] = 1; if (g.category in CAT) categories[i] = CAT[g.category]; } });
const degree = new Uint32Array(count); for (let i = 0; i < pairs.length; i++) degree[pairs[i]]++;
const offsets = new Uint32Array(count + 1); for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + degree[i];
const adj = new Uint32Array(pairs.length), fill = offsets.slice(0, count);
for (let k = 0; k < pairs.length; k += 2) { const a = pairs[k], b = pairs[k + 1]; adj[fill[a]++] = b; adj[fill[b]++] = a; }
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (let i = 0; i < count; i++) if (placed[i]) { const x = positions[i * 2], y = positions[i * 2 + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const span = Math.max(maxX - minX, maxY - minY), rand = (i => () => ((i = Math.imul(i ^ (i >>> 15), 2246822519) >>> 0) / 4294967296))(12345);
for (let round = 0; round < 6; round++) {
  const next = [];
  for (let i = 0; i < count; i++) {
    if (placed[i]) continue;
    let sx = 0, sy = 0, n = 0;
    for (let k = offsets[i]; k < offsets[i + 1]; k++) { const j = adj[k]; if (placed[j] === 1) { sx += positions[j * 2]; sy += positions[j * 2 + 1]; n++; } }
    // Spread notes that share the same neighbours in a small disc (not a square).
    if (n) { const ang = rand() * Math.PI * 2, rad = span * 0.004 * Math.sqrt(rand()); next.push([i, sx / n + Math.cos(ang) * rad, sy / n + Math.sin(ang) * rad]); }
  }
  for (const [i, x, y] of next) { positions[i * 2] = x; positions[i * 2 + 1] = y; placed[i] = 1; }
  if (!next.length) break;
}
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, ring = span * 0.56;
let orphans = 0;
for (let i = 0; i < count; i++) if (!placed[i]) { const a = rand() * Math.PI * 2, r = ring * (1 + rand() * 0.03);
  positions[i * 2] = cx + Math.cos(a) * r; positions[i * 2 + 1] = cy + Math.sin(a) * r; placed[i] = 1; orphans++; }
for (let i = 0; i < count; i++) { const x = positions[i * 2], y = positions[i * 2 + 1]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
const version = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + 'Z';
const out = path.join(dir, 'constellation', version);
fs.mkdirSync(out, {recursive: true});
// Files are gzip-compressed (the browser inflates them with DecompressionStream).
// Connections are sorted and stored as varints: (source - previous source, target - source).
const zlib = require('node:zlib');
const write = (name, buf) => fs.writeFileSync(path.join(out, name + '.gz'), zlib.gzipSync(buf, {level: 9}));
const order = Array.from({length: bits.length}, (_, i) => i).sort((a, b) => pairs[2 * a] - pairs[2 * b] || pairs[2 * a + 1] - pairs[2 * b + 1]);
const varints = []; const push = v => { while (v >= 128) { varints.push((v & 127) | 128); v >>>= 7; } varints.push(v); };
let previous = 0;
for (const i of order) { const s = pairs[2 * i], d = pairs[2 * i + 1]; push(s - previous); push(d - s); previous = s; }
write('positions.bin', Buffer.from(positions.buffer));
write('categories.bin', Buffer.from(categories.buffer));
write('kinds.bin', Buffer.from(new Uint8Array(kindCodes).buffer));
write('edges.bin', Buffer.from(varints));
write('edge-types.bin', Buffer.from(order.map(i => bits[i])));
// Titles in 16 chunks, fetched for hover, labels and search after the map is drawn.
const CHUNK = Math.ceil(count / 16);
for (let c = 0; c * CHUNK < count; c++) write(`labels-${c}.json`, Buffer.from(JSON.stringify(labels.slice(c * CHUNK, (c + 1) * CHUNK))));
const typeCounts = ORIGINS.map((_, o) => bits.reduce((n, b) => n + ((b >> o) & 1), 0));
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({version, count, edges: bits.length, categories: CATEGORIES,
  categoryCounts: CATEGORIES.map((_, c) => categories.filter(x => x === c).length), kinds: KINDS,
  kindCounts: KINDS.map((_, k) => kindCodes.filter(x => x === k).length), edgeTypes: ORIGINS, edgeTypeCounts: typeCounts,
  labelChunk: CHUNK, orphans, bounds: [minX, minY, maxX, maxY]}));
console.log(`${version}: ${count} notes (${unlinked} without an address skipped), ${bits.length} connected pairs, ${orphans} unlinked notes on the outer ring, other-origin links ${otherOrigin} -> ${out}`);
