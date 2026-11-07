// Checks external links and records how dead ones are handled, in
// data/link-fixes.json:  { "<url>": { "status": ..., "replacement": "<archive url>" | null } }
//   dead (404/410, unknown host, DOI that does not exist) -> Internet Archive copy if one exists, else null
//   null means build.js and the research function keep the text but drop the link.
// Sites that refuse automated checks (401/403/429/999) are treated as live.
// Usage: node scripts/check-external-links.js <links.json> [...]   (each file: [[url, fromPage], ...])
const fs = require('node:fs'), path = require('node:path');
const OUT = path.join(__dirname, '..', 'data', 'link-fixes.json');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const fixes = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const unescape = v => v.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const urls = [...new Set(process.argv.slice(2).flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')).map(x => unescape(x[0]))))];

async function get(url, method) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
  try { return (await fetch(url, {method, redirect: 'follow', signal: c.signal, headers: {'user-agent': UA, accept: 'text/html,*/*'}})).status; }
  catch (e) { return 'ERR:' + (e.cause?.code || e.name); }
  finally { clearTimeout(t); }
}
async function status(url) {
  const doi = url.match(/^https?:\/\/(?:dx\.)?doi\.org\/(10\..+)$/i);
  if (doi) {
    try { const j = await (await fetch('https://doi.org/api/handles/' + doi[1])).json(); return j.responseCode === 1 ? 200 : 'DOI-MISSING'; }
    catch { return 'ERR:doi-api'; }
  }
  let s = await get(url, 'HEAD');
  if (typeof s !== 'number' || s >= 400) s = await get(url, 'GET');
  if (typeof s === 'string' && /TIMEOUT|AbortError/.test(s)) s = await get(url, 'GET');
  return s;
}
const isDead = s => s === 404 || s === 410 || s === 'DOI-MISSING' || (typeof s === 'string' && /ENOTFOUND|ERR_INVALID_URL|EAI_AGAIN|Invalid URL/.test(s));
async function archived(url) {
  // Newest snapshot the Internet Archive captured with a 200 response.
  const q = 'https://web.archive.org/cdx/search/cdx?output=json&fl=timestamp,original&filter=statuscode:200&limit=-1&url=' + encodeURIComponent(url);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(q);
      if (r.status === 429) { await new Promise(res => setTimeout(res, 5000 * (attempt + 1))); continue; }
      if (r.ok) { const rows = await r.json(); const last = rows[rows.length - 1]; return rows.length > 1 ? `https://web.archive.org/web/${last[0]}/${last[1]}` : null; }
    } catch { /* retry */ }
    await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
  }
  return undefined;   // archive unreachable: decide next run
}

(async () => {
  const todo = urls.filter(u => !(u in fixes) || process.env.RECHECK);
  let i = 0, dead = 0, live = 0, unknown = 0;
  await Promise.all(Array.from({length: 12}, async () => {
    while (i < todo.length) {
      const url = todo[i++];
      let s;
      let host = '';
      try { host = new URL(url).hostname; } catch { /* invalid */ }
      // A truncated address (no real domain, e.g. "https://www") cannot be archived or repaired.
      if (!host.includes('.')) { dead++; fixes[url] = {status: 'malformed', replacement: null, noArchive: true}; continue; }
      s = await status(url);
      if (isDead(s)) { dead++; fixes[url] = {status: s, replacement: null}; }
      else if (typeof s === 'number' && s < 500) { live++; delete fixes[url]; }
      else { unknown++; }   // server errors / timeouts: left alone, rechecked next run
    }
  }));
  // Archive lookups run gently (the Internet Archive rate-limits); entries
  // without a copy are looked up again on later runs.
  const pending = Object.entries(fixes).filter(([, f]) => !f.replacement && !f.noArchive);
  let j = 0;
  await Promise.all(Array.from({length: 2}, async () => {
    while (j < pending.length) {
      const [url, fix] = pending[j++];
      const copy = await archived(url);
      if (copy) fix.replacement = copy; else if (copy === null) fix.noArchive = true;
    }
  }));
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(fixes).sort()), null, 1) + '\n');
  const archivedCount = Object.values(fixes).filter(f => f.replacement).length;
  console.log(`checked ${todo.length}: live ${live}, dead ${dead}, unreachable-now ${unknown}. Fix list: ${Object.keys(fixes).length} (${archivedCount} archived copies, ${Object.keys(fixes).length - archivedCount} unlinked)`);
})();
