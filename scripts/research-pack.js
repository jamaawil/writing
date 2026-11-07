// Prepares the research database for Cloudflare R2:
//   1. proves research-public.sqlite3 holds every row of research.sqlite3
//      (every table, every column, every connection origin) and that search
//      returns the same records;
//   2. stores precomputed home/overview pages;
//   3. splits the file into fixed-size pieces plus manifest.json.
// Usage: node scripts/research-pack.js   (refuses to pack if anything differs)
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {service} = require('../netlify/functions/lib/research-service');

const pointer = require('../.research/current.json');
const dir = path.dirname(pointer.database);
const source = pointer.database, target = path.join(dir, 'research-public.sqlite3');
const CHUNK = 256 * 1024 * 1024;

// Blocks holding the search core, preloaded by netlify/functions/lib/http-sqlite.mjs.
const HOT = ['sqlite_schema','search_idx','search_content','search_docsize','search_config','evidence_search_idx',
  'evidence_search_content','evidence_search_docsize','evidence_search_config','entities_id_kind','sqlite_stat1',
  'page_cache','sqlite_autoindex_page_cache_1','sqlite_autoindex_entities_1','metadata','sqlite_autoindex_metadata_1',
  'assets','sqlite_autoindex_assets_1'];
function hotRuns(file) {
  const db = new DatabaseSync(file, {readOnly: true});
  const pageSize = db.prepare('PRAGMA page_size').get().page_size, B = 256 * 1024;
  const pages = db.prepare(`SELECT pageno FROM dbstat WHERE name IN (${HOT.map(() => '?').join(',')}) ORDER BY pageno`).all(...HOT);
  db.close();
  const blocks = [...new Set(pages.map(p => Math.floor((p.pageno - 1) * pageSize / B)))].sort((a, b) => a - b), runs = [];
  for (const b of blocks) { const r = runs[runs.length - 1]; if (r && b <= r[1] + 1) r[1] = b; else runs.push([b, b]); }
  return runs;
}

async function main() {
  const db = new DatabaseSync(target);
  db.exec(`ATTACH '${source.replace(/'/g, "''")}' AS src`);
  const report = {checkedAt: new Date().toISOString(), tables: {}, origins: {}, search: {}};
  for (const table of ['entities', 'aliases', 'relations', 'evidence', 'assets', 'source_files', 'metadata']) {
    const a = db.prepare(`SELECT count(*) n FROM src.${table}`).get().n;
    const b = db.prepare(`SELECT count(*) n FROM main.${table}`).get().n;
    const missing = db.prepare(`SELECT count(*) n FROM (SELECT * FROM src.${table} EXCEPT SELECT * FROM main.${table})`).get().n;
    const extra = db.prepare(`SELECT count(*) n FROM (SELECT * FROM main.${table} EXCEPT SELECT * FROM src.${table})`).get().n;
    report.tables[table] = {original: a, copy: b, missing, extra};
    console.log(`${table}: ${b}/${a} rows, ${missing} missing, ${extra} extra`);
    if (a !== b || missing || extra) throw new Error('Copy differs from the original in ' + table);
  }
  for (const {origin, n} of db.prepare('SELECT origin,count(*) n FROM src.relations GROUP BY origin').all()) {
    const copy = db.prepare('SELECT count(*) n FROM main.relations WHERE origin=?').get(origin).n;
    report.origins[origin] = {original: n, copy};
    if (copy !== n) throw new Error('Connection count differs for origin ' + origin);
  }
  console.log('connections by origin:', Object.keys(report.origins).length, 'origins identical');
  // Search must find the same records as the original full-text index.
  for (const term of ['memory', 'narrative', 'evidence', 'power', 'learning', 'mesh', 'freedom', 'attention', 'story', 'claim']) {
    const m = `"${term}"*`;
    for (const t of ['search', 'evidence_search']) {
      const a = db.prepare(`SELECT group_concat(entity_id) g FROM (SELECT entity_id FROM src.${t} WHERE ${t} MATCH ? ORDER BY rowid)`).get(m).g || '';
      const b = db.prepare(`SELECT group_concat(entity_id) g FROM (SELECT entity_id FROM main.${t} WHERE ${t} MATCH ? ORDER BY rowid)`).get(m).g || '';
      const same = crypto.createHash('sha256').update(a).digest('hex') === crypto.createHash('sha256').update(b).digest('hex');
      report.search[t + ':' + term] = {matches: a ? a.split(',').length : 0, identical: same};
      if (!same) throw new Error(`Search differs for ${term} in ${t}`);
    }
  }
  console.log('search: identical results for', Object.keys(report.search).length, 'checks');
  db.exec('DETACH src');

  db.exec('CREATE INDEX IF NOT EXISTS entities_id_kind ON entities(id,published,kind); ANALYZE;');
  const store = {postgres: false, query: async (sql, args = []) => db.prepare(sql).all(...args)};
  db.exec('CREATE TABLE IF NOT EXISTS page_cache(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  for (const key of ['home', 'overview']) {
    const value = JSON.stringify(await service(store, {action: key, fresh: '1'}));
    db.prepare('INSERT OR REPLACE INTO page_cache VALUES (?,?)').run(key, value);
  }
  db.exec('VACUUM');
  db.close();

  const version = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '') + 'Z';
  const out = path.join(dir, 'r2', version);
  fs.mkdirSync(out, {recursive: true});
  const size = fs.statSync(target).size, whole = crypto.createHash('sha256'), pieces = [];
  const fd = fs.openSync(target, 'r');
  for (let i = 0, pos = 0; pos < size; i++, pos += CHUNK) {
    const buf = Buffer.alloc(Math.min(CHUNK, size - pos));
    fs.readSync(fd, buf, 0, buf.length, pos);
    whole.update(buf);
    const name = String(i).padStart(6, '0');
    fs.writeFileSync(path.join(out, name), buf);
    pieces.push({name, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex')});
  }
  fs.closeSync(fd);
  const manifest = {version, size, chunkSize: CHUNK, sha256: whole.digest('hex'), pieces, hot: hotRuns(target), verification: report};
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`Packed ${pieces.length} pieces (${(size / 1e9).toFixed(2)} GB) into ${out}`);
}
main().catch(e => { console.error('STOPPED:', e.message); process.exitCode = 1; });
