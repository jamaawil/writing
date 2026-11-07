// Uploads each unique attachment to R2 under its SHA-256 name, after checking
// the local file's hash. Run from _site: node cloudflare/research-assets/upload.js
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const {DatabaseSync} = require('node:sqlite');
const root = path.join(__dirname, '../..');
const pointer = require(path.join(root, '.research/current.json'));
const dir = path.join(path.dirname(pointer.database), 'assets');
const db = new DatabaseSync(pointer.database, {readOnly: true});
const rows = db.prepare('SELECT sha256, min(filename) AS filename, min(mime) AS mime FROM assets GROUP BY sha256').all();
let done = 0;
for (const {sha256, filename, mime} of rows) {
  const file = path.join(dir, sha256);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== sha256) throw new Error('Checksum mismatch: ' + sha256);
  const safe = String(filename).replace(/[^\w.\- ]+/g, '_');
  execFileSync('npx', ['--yes', 'wrangler', 'r2', 'object', 'put', 'jamalawil-research-assets/' + sha256,
    '--remote', '--file', file, '--content-type', mime, '--content-disposition', `attachment; filename="${safe}"`],
    {stdio: ['ignore', 'ignore', 'inherit']});
  console.log(++done + '/' + rows.length + ' ' + sha256.slice(0, 12) + ' ' + safe);
}
console.log('All ' + rows.length + ' attachments uploaded with verified checksums.');
