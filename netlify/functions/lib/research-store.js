const fs = require('node:fs');
const path = require('node:path');

let cached;
function getStore() {
  if (cached) return cached;
  if (process.env.RESEARCH_DATA_URL) {
    // Research database served from Cloudflare R2 and read by byte range.
    const opened = import('./http-sqlite.mjs').then(m => m.openHttpDatabase(process.env.RESEARCH_DATA_URL, require.resolve('@journeyapps/wa-sqlite/dist/wa-sqlite-async.wasm')));
    opened.catch(() => { cached = undefined; });
    cached = { postgres: false, query: async (text, args = []) => (await opened).query(text, args) };
  } else if (process.env.RESEARCH_DATABASE_URL) {
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.RESEARCH_DATABASE_URL);
    const schema = process.env.RESEARCH_SCHEMA;
    if (!/^zettel_[a-z0-9_]+$/.test(schema || '')) throw new Error('RESEARCH_SCHEMA is not configured.');
    cached = { postgres: true, query: (text, args = []) => {
      let i = 0;
      text = text.replace(/\b(entities|aliases|relations|evidence|metadata|assets)\b/g, name => '"' + schema + '"."' + name + '"');
      return sql.query(text.replace(/\?/g, () => '$' + (++i)), args);
    }};
  } else if (process.env.RESEARCH_LOCAL === '1') {
    const { DatabaseSync } = require('node:sqlite');
    const pointer = JSON.parse(fs.readFileSync(path.join(__dirname, '../../..', '.research/current.json'), 'utf8'));
    const db = new DatabaseSync(pointer.database, { readOnly: true });
    cached = { postgres: false, close: () => db.close(), query: async (text, args = []) => db.prepare(text).all(...args) };
  } else {
    throw new Error('The research database has not been configured.');
  }
  return cached;
}
function closeStore() { if (cached?.close) cached.close(); cached = undefined; }
module.exports = { getStore, closeStore };
