// Opens every research record the way the live site does and checks every
// link it produces. Nothing may lead nowhere.
// Usage: node scripts/research-audit.js [database] [public-dir]
const {Worker, isMainThread, parentPort, workerData} = require('node:worker_threads');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const pointer = require('../.research/current.json');
const DB = process.argv[2] || path.join(path.dirname(pointer.database), 'research-public.sqlite3');
const PUBLIC = process.argv[3] || path.join(__dirname, '..', 'public');

if (isMainThread) {
  const {DatabaseSync} = require('node:sqlite');
  const db = new DatabaseSync(DB, {readOnly: true});
  const ids = db.prepare('SELECT id FROM entities WHERE published=1 ORDER BY id').all().map(r => r.id);
  db.close();
  const n = Math.max(2, os.cpus().length - 1), size = Math.ceil(ids.length / n);
  const totals = {records: 0, links: 0, external: new Map(), broken: [], anchorsUnchecked: 0, unresolved: []};
  let done = 0, last = Date.now();
  const workers = Array.from({length: n}, (_, i) => new Promise((resolve, reject) => {
    const w = new Worker(__filename, {workerData: {ids: ids.slice(i * size, (i + 1) * size), DB, PUBLIC}});
    w.on('message', m => {
      if (m.progress) { done += m.progress; if (Date.now() - last > 30000) { last = Date.now(); console.log(`${done}/${ids.length} records checked`); } return; }
      totals.records += m.records; totals.links += m.links; totals.anchorsUnchecked += m.anchorsUnchecked;
      totals.broken.push(...m.broken); totals.unresolved.push(...m.unresolved);
      for (const [u, from] of m.external) if (!totals.external.has(u)) totals.external.set(u, from);
      resolve();
    });
    w.on('error', reject);
  }));
  Promise.all(workers).then(() => {
    const byKind = {};
    for (const b of totals.broken) byKind[b.kind] = (byKind[b.kind] || 0) + 1;
    console.log(`records: ${totals.records}  links checked: ${totals.links}  broken: ${totals.broken.length}`, byKind);
    for (const b of totals.broken.slice(0, 25)) console.log('BROKEN', JSON.stringify(b));
    const out = path.join(path.dirname(DB), 'audit');
    fs.mkdirSync(out, {recursive: true});
    fs.writeFileSync(path.join(out, 'research-broken.json'), JSON.stringify(totals.broken, null, 1));
    fs.writeFileSync(path.join(out, 'research-external.json'), JSON.stringify([...totals.external], null, 1));
    fs.writeFileSync(path.join(out, 'research-unresolved.json'), JSON.stringify(totals.unresolved, null, 1));
    console.log('links shown as text because nothing in the collection matches:', totals.unresolved.length, '(' + new Set(totals.unresolved.map(u => u.text)).size + ' distinct)');
    console.log('external links (unique):', totals.external.size, '→', out);
  });
} else {
  const {DatabaseSync} = require('node:sqlite');
  const {service} = require('../netlify/functions/lib/research-service');
  const db = new DatabaseSync(workerData.DB, {readOnly: true});
  const store = {postgres: false, query: async (q, a = []) => db.prepare(q).all(...a)};
  const isRecord = seg => !!(db.prepare('SELECT 1 FROM entities WHERE id=? AND published=1').get(seg) ||
    db.prepare('SELECT 1 FROM slugs s JOIN entities e ON e.id=s.entity_id WHERE s.slug=? AND e.published=1').get(seg));
  const staticOk = new Map();
  const isStatic = p => {
    if (!staticOk.has(p)) {
      const f = path.join(workerData.PUBLIC, decodeURIComponent(p));
      staticOk.set(p, fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html'))) || fs.existsSync(f + '.html'));
    }
    return staticOk.get(p);
  };
  const resolveCache = new Map();
  (async () => {
    const broken = [], external = new Map(), unresolved = [];
    let links = 0, anchorsUnchecked = 0, count = 0;
    const check = async (from, href, where) => {
      links++;
      const bad = kind => broken.push({from, href, where, kind});
      if (!href) return bad('empty');
      if (/^(mailto|tel):/i.test(href)) return;
      if (/^https?:\/\//i.test(href)) { if (!external.has(href)) external.set(href, from); return; }
      if (href.startsWith('#')) { anchorsUnchecked++; return; }
      const u = new URL(href, 'https://writing.jamalawil.com/zettel/research/x/');
      if (u.hash) anchorsUnchecked++;
      if (u.pathname === '/zettel/research/' && u.searchParams.has('reference')) {
        const ref = u.searchParams.get('reference');
        if (!resolveCache.has(ref)) resolveCache.set(ref, (await service(store, {action: 'resolve', reference: ref})).results.length);
        if (!resolveCache.get(ref)) bad('reference-no-match');
        return;
      }
      const m = u.pathname.match(/^\/zettel\/research\/([^/]+)\/$/);
      if (m) { let seg = m[1]; try { seg = decodeURIComponent(seg); } catch {} if (!isRecord(seg)) bad('missing-record'); return; }
      if (u.pathname === '/api/research-asset') {
        const ok = db.prepare('SELECT 1 FROM assets a JOIN entities e ON e.id=a.entity_id WHERE a.entity_id=? AND e.published=1').get(u.searchParams.get('id'));
        if (!ok) bad('missing-attachment'); return;
      }
      if (u.pathname === '/zettel/' || u.pathname === '/zettel/research/') return;
      if (!isStatic(u.pathname)) bad('missing-page');
    };
    for (const id of workerData.ids) {
      let data;
      try { data = await service(store, {action: 'detail', id}); }
      catch (e) { broken.push({from: id, kind: 'record-error', error: e.message}); continue; }
      if (data.error) { broken.push({from: id, kind: 'record-error', error: data.error}); continue; }
      if (data.status !== undefined && typeof data.status !== 'string') broken.push({from: id, kind: 'status-field', error: String(data.status)});
      await check(id, data.href, 'self');
      for (const m of String(data.html).matchAll(/<a\s[^>]*href="([^"]*)"/g)) await check(id, m[1].replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&quot;/g, '"').replace(/&amp;/g, '&'), 'body');
      for (const m of String(data.html).matchAll(/<span class="research-unresolved"[^>]*>([^]*?)<\/span>/g)) unresolved.push({from: id, text: m[1].replace(/<[^>]*>/g, '')});
      if (data.attachment) await check(id, data.attachment.href, 'attachment');
      for (const n of data.canvas?.nodes || []) await check(id, n.href, 'canvas');
      for (const c of data.referenceCandidates || []) await check(id, c.href, 'candidate');
      for (const e of data.evidence || []) if (e.book) await check(id, e.book.href, 'evidence-book');
      for (const r of data.relations?.results || []) { await check(id, r.source.href, 'connection'); await check(id, r.target.href, 'connection'); }
      if (data.citation?.source_url) await check(id, data.citation.source_url, 'source-url');
      if (++count % 2000 === 0) parentPort.postMessage({progress: 2000});
    }
    parentPort.postMessage({records: count, links, broken, external: [...external], anchorsUnchecked, unresolved});
  })();
}
