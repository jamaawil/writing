// Gives every research record a readable, stable URL built from its title:
//   /zettel/research/a-colonial-language-attains-universality-only-when/
// Records that already point at a writer page (entities.href set, e.g.
// /library/...) keep that address. Old /zettel/research/<id>/ URLs keep
// working: the research function accepts an id or a slug.
// Usage: node scripts/research-slugs.js <database.sqlite3>   (or require it)
const {DatabaseSync} = require('node:sqlite');

const MAX = 80;
function slugify(title) {
  let s = String(title || '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase()
    .replace(/[’'`]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (s.length > MAX) { s = s.slice(0, MAX); const cut = s.lastIndexOf('-'); if (cut > 40) s = s.slice(0, cut); s = s.replace(/-+$/, ''); }
  return s;
}

// When titles collide, the record people mean gets the plain address; the
// supporting record gets its kind appended (…-reference, …-hypothesis-record).
const SECONDARY = ['reference','hypothesis-record','web-source','named-concept','canvas-node','source-passage',
  'reading-suggestion','booklab-reading','factcheck','chapter','attachment','view','archive','digest'];
const rank = kind => { const i = SECONDARY.indexOf(kind); return i < 0 ? 0 : i + 1; };

function applySlugs(db) {
  db.exec(`DROP TABLE IF EXISTS slugs;
    CREATE TABLE slugs(slug TEXT PRIMARY KEY, entity_id TEXT NOT NULL UNIQUE) WITHOUT ROWID;`);
  const rows = db.prepare('SELECT id,title,kind,href FROM entities ORDER BY id').all()
    .sort((a, b) => rank(a.kind) - rank(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const taken = new Set(), insert = db.prepare('INSERT INTO slugs VALUES (?,?)');
  const update = db.prepare('UPDATE entities SET href=? WHERE id=?');
  let readable = 0, kept = 0;
  db.exec('BEGIN');
  for (const row of rows) {
    if (row.href && !row.href.startsWith('/zettel/research/')) { kept++; continue; }
    const base = slugify(row.title) || slugify(row.kind) || 'record';
    let slug = base;
    if (taken.has(slug)) {
      const withKind = base + '-' + slugify(row.kind);
      let n = 2; slug = withKind;
      while (taken.has(slug)) slug = withKind + '-' + n++;
    }
    taken.add(slug);
    insert.run(slug, row.id);
    update.run('/zettel/research/' + slug + '/', row.id);
    readable++;
  }
  db.exec('COMMIT');
  return {readable, kept};
}

module.exports = {slugify, applySlugs};
if (require.main === module) {
  const db = new DatabaseSync(process.argv[2]);
  console.log(applySlugs(db));
  db.close();
}
