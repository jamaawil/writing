// Pre-renders every research record's body (links already resolved, exactly as
// the research function would) and stores it deflate-compressed in the
// `rendered` table, so the live site serves a ready page instead of resolving
// thousands of links over remote reads. External dead-link fixes are applied
// when the page is served, so they can change without re-rendering.
// Usage: node scripts/research-render.js [database]
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const path = require('node:path'), os = require('node:os'), fs = require('node:fs'), zlib = require('node:zlib');
const pointer = require('../.research/current.json');
const DB = process.argv[2] || path.join(path.dirname(pointer.database), 'research-public.sqlite3');

if (isMainThread) {
  const {DatabaseSync} = require('node:sqlite');
  const read = new DatabaseSync(DB, {readOnly: true});
  const ids = read.prepare('SELECT id FROM entities WHERE published=1 ORDER BY id').all().map(r => r.id);
  read.close();
  const staging = DB + '.rendered-staging';
  fs.rmSync(staging, {force: true});
  const out = new DatabaseSync(staging);
  out.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE rendered(entity_id TEXT PRIMARY KEY, html BLOB NOT NULL)');
  const insert = out.prepare('INSERT INTO rendered VALUES (?,?)');
  const n = Math.max(2, os.cpus().length - 1), size = Math.ceil(ids.length / n);
  let done = 0, bytes = 0, last = Date.now();
  out.exec('BEGIN');
  Promise.all(Array.from({length: n}, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(__filename, {workerData: {ids: ids.slice(i * size, (i + 1) * size), DB}});
    w.on('message', m => {
      if (m.done) return resolve();
      for (const [id, html] of m.batch) { insert.run(id, html); bytes += html.length; }
      done += m.batch.length;
      if (Date.now() - last > 30000) { last = Date.now(); console.log(`${done}/${ids.length} rendered`); }
    });
    w.on('error', reject);
  }))).then(() => {
    out.exec('COMMIT');
    out.close();
    const db = new DatabaseSync(DB);
    db.exec(`DROP TABLE IF EXISTS rendered;
      CREATE TABLE rendered(entity_id TEXT PRIMARY KEY, html BLOB NOT NULL);
      ATTACH '${staging.replace(/'/g, "''")}' AS s;
      INSERT INTO rendered SELECT * FROM s.rendered ORDER BY entity_id;
      DETACH s;`);
    const count = db.prepare('SELECT count(*) n FROM rendered').get().n;
    db.close();
    fs.rmSync(staging, {force: true});
    if (count !== ids.length) throw new Error(`Rendered ${count} of ${ids.length}`);
    console.log(`Rendered ${count} records (${(bytes / 1e6).toFixed(0)} MB compressed).`);
  });
} else {
  const {DatabaseSync} = require('node:sqlite');
  const {renderBody} = require('../netlify/functions/lib/research-service');
  const db = new DatabaseSync(workerData.DB, {readOnly: true});
  const store = {postgres: false, raw: true, query: async (q, a = []) => db.prepare(q).all(...a)};
  const row = db.prepare('SELECT body, source_path FROM entities WHERE id=?');
  (async () => {
    let batch = [];
    for (const id of workerData.ids) {
      const r = row.get(id);
      const html = await renderBody(r.body, store, r.source_path, {external: false});
      batch.push([id, zlib.deflateRawSync(Buffer.from(html), {level: 9})]);
      if (batch.length >= 500) { parentPort.postMessage({batch}); batch = []; }
    }
    if (batch.length) parentPort.postMessage({batch});
    parentPort.postMessage({done: true});
  })();
}
