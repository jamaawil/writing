// Uploads the packed research database (from scripts/research-pack.js) to R2
// under db/<version>/. Each piece is checksummed before upload and read back
// by size afterwards; manifest.json goes last so a partial upload is never live.
// Run from _site: node cloudflare/research-assets/upload-db.js <version>
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const pointer = require('../../.research/current.json');
const version = process.argv[2];
if (!/^\d{8}T\d{6}Z$/.test(version || '')) throw new Error('Pass the packed version, e.g. 20261107T230000Z');
const dir = path.join(path.dirname(pointer.database), 'r2', version);
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const BASE = 'https://jamalawil-research-assets.jahmed01.workers.dev/db/' + version + '/';
const put = (file, key, type) => execFileSync('npx', ['--yes', 'wrangler', 'r2', 'object', 'put',
  'jamalawil-research-assets/db/' + version + '/' + key, '--remote', '--file', file, '--content-type', type],
  {stdio: ['ignore', 'ignore', 'inherit']});

(async () => {
  for (const piece of manifest.pieces) {
    if (piece.key) {
      // Reused from an earlier version: confirm that copy is on R2 and identical.
      const h = await fetch(new URL(piece.key, BASE), {method: 'HEAD'});
      const prevDir = path.join(dir, '..', piece.key.split('/')[1]);
      const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(prevDir, piece.name))).digest('hex');
      if (!h.ok || (h.headers.get('etag') || '').replace(/"/g, '') !== md5) throw new Error('Reused piece missing or different: ' + piece.key);
      console.log(piece.name + ' reused from ' + piece.key + ', fingerprint matches'); continue;
    }
    const file = path.join(dir, piece.name);
    const data = fs.readFileSync(file);
    const sum = crypto.createHash('sha256').update(data).digest('hex');
    if (sum !== piece.sha256) throw new Error('Checksum mismatch in ' + piece.name);
    const md5 = crypto.createHash('md5').update(data).digest('hex');
    const stored = async () => { const h = await fetch(BASE + piece.name, {method: 'HEAD'}); return h.ok ? (h.headers.get('etag') || '').replace(/"/g, '') : ''; };
    if (await stored() === md5) { console.log(piece.name + ' already uploaded, fingerprint matches'); continue; }
    for (let attempt = 1; ; attempt++) {
      try { put(file, piece.name, 'application/octet-stream'); break; }
      catch (e) { if (attempt >= 3) throw e; console.log('retrying ' + piece.name); }
    }
    if (await stored() !== md5) throw new Error('Fingerprint check failed for ' + piece.name);
    console.log(piece.name + ' uploaded and checked (' + (piece.bytes / 1e6).toFixed(0) + ' MB)');
  }
  put(path.join(dir, 'manifest.json'), 'manifest.json', 'application/json');
  console.log('All ' + manifest.pieces.length + ' pieces uploaded. RESEARCH_DATA_URL=' + BASE);
})().catch(e => { console.error('STOPPED:', e.message); process.exitCode = 1; });
