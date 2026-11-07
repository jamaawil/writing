// Re-packs research-public.sqlite3 after an append-only change (e.g. new
// indexes) as a new version. Pieces identical to the previous version are not
// stored again: the manifest points at the existing R2 copy ("key").
// Usage: node scripts/research-repack.js <previous-version>
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const pointer = require('../.research/current.json');
const dir = path.dirname(pointer.database), target = path.join(dir, 'research-public.sqlite3');
const prevVersion = process.argv[2];
const prev = JSON.parse(fs.readFileSync(path.join(dir, 'r2', prevVersion, 'manifest.json'), 'utf8'));
const CHUNK = prev.chunkSize, HOT = ['sqlite_schema','search_idx','search_content','search_docsize','search_config',
  'evidence_search_idx','evidence_search_content','evidence_search_docsize','evidence_search_config','entities_id_kind',
  'sqlite_stat1','page_cache','sqlite_autoindex_page_cache_1','sqlite_autoindex_entities_1','metadata',
  'sqlite_autoindex_metadata_1','assets','sqlite_autoindex_assets_1'];
const db = new DatabaseSync(target, {readOnly: true});
const pageSize = db.prepare('PRAGMA page_size').get().page_size, B = 256 * 1024;
const pages = db.prepare(`SELECT pageno FROM dbstat WHERE name IN (${HOT.map(() => '?').join(',')}) ORDER BY pageno`).all(...HOT);
db.close();
const blocks = [...new Set(pages.map(p => Math.floor((p.pageno - 1) * pageSize / B)))].sort((a, b) => a - b), hot = [];
for (const b of blocks) { const r = hot[hot.length - 1]; if (r && b <= r[1] + 1) r[1] = b; else hot.push([b, b]); }
const version = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + 'Z';
const out = path.join(dir, 'r2', version); fs.mkdirSync(out, {recursive: true});
const size = fs.statSync(target).size, whole = crypto.createHash('sha256'), pieces = [], fd = fs.openSync(target, 'r');
let reused = 0;
for (let i = 0, pos = 0; pos < size; i++, pos += CHUNK) {
  const buf = Buffer.alloc(Math.min(CHUNK, size - pos)); fs.readSync(fd, buf, 0, buf.length, pos); whole.update(buf);
  const name = String(i).padStart(6, '0'), sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const old = prev.pieces[i];
  if (old && old.sha256 === sha256) { pieces.push({name, bytes: buf.length, sha256, key: '../' + (old.key ? old.key.split('/')[1] : prevVersion) + '/' + name}); reused++; }
  else { fs.writeFileSync(path.join(out, name), buf); pieces.push({name, bytes: buf.length, sha256}); }
}
fs.closeSync(fd);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({version, size, chunkSize: CHUNK, sha256: whole.digest('hex'), pieces, hot, previous: prevVersion, verification: prev.verification}, null, 1));
console.log(`Version ${version}: ${pieces.length} pieces, ${reused} reused from ${prevVersion}, ${pieces.length - reused} new`);
