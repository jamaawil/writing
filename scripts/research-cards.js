// Compact lookup tables for the remote (R2) database. In `entities`, each
// record's full text sits before its href and metadata, so reading those over
// HTTP ranges means reading the whole text first. These tables hold the same
// values without the text:
//   cards(id, title, kind, href, published, excerpt)  - every link, search hit, connection
//   details(entity_id, meta)                            - metadata + source_path, deflate JSON
// Values are copied from `entities`; the search excerpt is computed by the
// same function the research service uses.
// Usage: node scripts/research-cards.js [database]
const path = require('node:path'), zlib = require('node:zlib');
const {DatabaseSync} = require('node:sqlite');
const {excerptOf} = require('../netlify/functions/lib/research-service');
const pointer = require('../.research/current.json');
const DB = process.argv[2] || path.join(path.dirname(pointer.database), 'research-public.sqlite3');

const db = new DatabaseSync(DB);
db.exec(`DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS details;
  CREATE TABLE cards(id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, href TEXT, published INTEGER NOT NULL, excerpt TEXT NOT NULL) WITHOUT ROWID;
  CREATE TABLE details(entity_id TEXT PRIMARY KEY, meta BLOB NOT NULL);`);
const card = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?)'), detail = db.prepare('INSERT INTO details VALUES (?,?)');
let n = 0;
db.exec('BEGIN');
for (const r of db.prepare('SELECT id,title,kind,href,published,body,metadata,source_path FROM entities WHERE published=1 ORDER BY id').iterate()) {
  card.run(r.id, r.title, r.kind, r.href, r.published, excerptOf(r.body));
  detail.run(r.id, zlib.deflateRawSync(Buffer.from(JSON.stringify({metadata: r.metadata, source_path: r.source_path})), {level: 9}));
  n++;
}
db.exec('COMMIT');
db.close();
console.log(`cards and details written for ${n} records`);
