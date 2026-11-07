// Read-only SQLite over HTTP range requests. The database lives in Cloudflare
// R2 as fixed-size pieces (manifest.json + 000000, 000001, ...). SQLite asks
// for pages; this reader fetches only the blocks it needs and keeps them in
// memory while the Netlify function stays warm.
//   - The search core (manifest.hot) is preloaded in large parallel requests.
//   - Sequential scans read ahead several blocks per request.
//   - Several SQLite engines share one block cache, so independent queries
//     (e.g. the 24 records on a search page) are fetched in parallel.
// The SQLite package is loaded with runtime import() so the Netlify bundler
// leaves it as a real ES module.
import { readFileSync } from 'node:fs';
const load = specifier => import(specifier);

const BLOCK = 256 * 1024;      // bytes per cached block
const READAHEAD = 8;           // blocks fetched at once during sequential scans
const CACHE_BLOCKS = 1024;     // ~256 MB of evictable blocks (preloaded core is kept separately)
const ENGINES = 6;             // parallel SQLite engines

class BlockCache {
  constructor(source) {
    this.source = source;      // {base, size, chunkSize, urls}
    this.pinned = new Map();   // preloaded search core, never evicted
    this.cache = new Map();    // block index -> Promise<Uint8Array>, LRU order
    this.requests = 0;
  }
  async fetchRange(first, count) {
    const {base, size, chunkSize} = this.source;
    const start = first * BLOCK, end = Math.min((first + count) * BLOCK, size) - 1;
    const chunk = Math.floor(start / chunkSize), offset = start - chunk * chunkSize;
    // chunkSize is a multiple of BLOCK; callers never cross a piece boundary.
    const url = this.source.urls[chunk];
    for (let attempt = 0; ; attempt++) {
      this.requests++;
      let status = 0;
      try {
        const res = await fetch(url, {headers: {Range: `bytes=${offset}-${offset + (end - start)}`}});
        status = res.status;
        if (status === 206 || status === 200) {
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.byteLength === end - start + 1) return buf;
        }
      } catch { /* network error: retry */ }
      if (attempt >= 3) throw new Error('Research data read failed (' + status + ')');
      await new Promise(r => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  // Fetch `count` blocks starting at `first` in one request; register each block.
  span(first, count, target) {
    const perPiece = this.source.chunkSize / BLOCK;
    const last = Math.min(first + count, Math.ceil(this.source.size / BLOCK), (Math.floor(first / perPiece) + 1) * perPiece);
    const whole = this.fetchRange(first, last - first);
    for (let i = first; i < last; i++) {
      const p = whole.then(buf => buf.subarray((i - first) * BLOCK, (i - first + 1) * BLOCK));
      p.catch(() => target.delete(i));
      target.set(i, p);
    }
    while (target === this.cache && this.cache.size > CACHE_BLOCKS) this.cache.delete(this.cache.keys().next().value);
  }
  block(index) {
    const pinned = this.pinned.get(index);
    if (pinned) return pinned;
    let entry = this.cache.get(index);
    if (entry) { this.cache.delete(index); this.cache.set(index, entry); return entry; }
    // Sequential pattern (previous two blocks cached): read ahead.
    const has = i => this.cache.has(i) || this.pinned.has(i);
    let count = 1;
    if (has(index - 1) && has(index - 2)) while (count < READAHEAD && !has(index + count)) count++;
    this.span(index, count, this.cache);
    return this.cache.get(index);
  }
  async preload(runs) {
    const jobs = [];
    for (const [a, b] of runs) for (let i = a; i <= b; i += 16) jobs.push([i, Math.min(16, b - i + 1)]);
    let next = 0;
    const worker = async () => { while (next < jobs.length) { const [i, n] = jobs[next++]; this.span(i, n, this.pinned); await this.pinned.get(i); } };
    await Promise.all(Array.from({length: 12}, worker));
  }
}

function defineHttpVFS(FacadeVFS, VFS) {
  return class HttpVFS extends FacadeVFS {
    constructor(name, module, blocks) { super(name, module); this.blocks = blocks; }
    jOpen(name, fileId, flags, pOutFlags) {
      if (!(flags & VFS.SQLITE_OPEN_MAIN_DB)) return VFS.SQLITE_CANTOPEN;
      pOutFlags.setInt32(0, VFS.SQLITE_OPEN_READONLY, true);
      return VFS.SQLITE_OK;
    }
    jClose() { return VFS.SQLITE_OK; }
    jAccess(name, flags, pResOut) { pResOut.setInt32(0, 0, true); return VFS.SQLITE_OK; }
    jFileSize(fileId, pSize64) { pSize64.setBigInt64(0, BigInt(this.blocks.source.size), true); return VFS.SQLITE_OK; }
    jLock() { return VFS.SQLITE_OK; }
    jUnlock() { return VFS.SQLITE_OK; }
    jCheckReservedLock(fileId, pResOut) { pResOut.setInt32(0, 0, true); return VFS.SQLITE_OK; }
    jWrite() { return VFS.SQLITE_READONLY; }
    jTruncate() { return VFS.SQLITE_READONLY; }
    jSync() { return VFS.SQLITE_OK; }
    jDeviceCharacteristics() { return VFS.SQLITE_IOCAP_IMMUTABLE; }
    async jRead(fileId, pData, iOffset) {
      try {
        const want = pData.byteLength, size = this.blocks.source.size, stop = Math.min(iOffset + want, size);
        const reads = [];
        for (let pos = iOffset; pos < stop; ) {
          const index = Math.floor(pos / BLOCK), inBlock = pos - index * BLOCK;
          const n = Math.min(BLOCK - inBlock, stop - pos), dst = pos - iOffset;
          reads.push(this.blocks.block(index).then(b => pData.set(b.subarray(inBlock, inBlock + n), dst)));
          pos += n;
        }
        await Promise.all(reads);
        const filled = Math.max(0, stop - iOffset);
        if (filled < want) { pData.fill(0, filled); return VFS.SQLITE_IOERR_SHORT_READ; }
        return VFS.SQLITE_OK;
      } catch (error) {
        console.error(error.message);
        return VFS.SQLITE_IOERR;
      }
    }
  };
}

export async function openHttpDatabase(base, wasmPath) {
  base = base.replace(/\/?$/, '/');
  const [manifest, {default: SQLiteESMFactory}, SQLite, {FacadeVFS}, VFS] = await Promise.all([
    fetch(base + 'manifest.json').then(r => { if (!r.ok) throw new Error('Research manifest unavailable (' + r.status + ')'); return r.json(); }),
    load('@journeyapps/wa-sqlite/dist/wa-sqlite-async.mjs'), load('@journeyapps/wa-sqlite'),
    load('@journeyapps/wa-sqlite/src/FacadeVFS.js'), load('@journeyapps/wa-sqlite/src/VFS.js')]);
  if (manifest.chunkSize % BLOCK) throw new Error('Piece size must be a multiple of ' + BLOCK);
  // A piece unchanged since an earlier version points at that copy ("key").
  const urls = manifest.pieces.map(p => new URL(p.key || p.name, base).href);
  const blocks = new BlockCache({base, size: manifest.size, chunkSize: manifest.chunkSize, urls});
  const preloading = blocks.preload(manifest.hot || []);
  const HttpVFS = defineHttpVFS(FacadeVFS, VFS);
  const wasmBinary = readFileSync(wasmPath);

  async function engine(n) {
    const module = await SQLiteESMFactory({wasmBinary});
    const sqlite3 = SQLite.Factory(module);
    sqlite3.vfs_register(new HttpVFS('http-research-' + n, module, blocks), false);
    const db = await sqlite3.open_v2('file:research.sqlite3?immutable=1', SQLite.SQLITE_OPEN_READONLY | SQLite.SQLITE_OPEN_URI, 'http-research-' + n);
    await sqlite3.exec(db, 'PRAGMA cache_size=-16384; PRAGMA temp_store=MEMORY;');
    // Each async SQLite engine runs one statement at a time.
    return {busy: false, async run(sql, args) {
      const rows = [];
      for await (const stmt of sqlite3.statements(db, sql)) {
        if (args.length) sqlite3.bind_collection(stmt, args.map(v => typeof v === 'boolean' ? Number(v) : v));
        const cols = sqlite3.column_names(stmt);
        while (await sqlite3.step(stmt) === SQLite.SQLITE_ROW) {
          const values = sqlite3.row(stmt), row = {};
          cols.forEach((c, i) => { row[c] = typeof values[i] === 'bigint' ? Number(values[i]) : values[i]; });
          rows.push(row);
        }
      }
      return rows;
    }};
  }
  const engines = await Promise.all(Array.from({length: ENGINES}, (_, n) => engine(n)));
  await preloading;
  const waiting = [];
  async function query(sql, args = []) {
    let e = engines.find(x => !x.busy);
    while (!e) { await new Promise(r => waiting.push(r)); e = engines.find(x => !x.busy); }
    e.busy = true;
    try { return await e.run(sql, args); }
    finally { e.busy = false; waiting.shift()?.(); }
  }
  return {manifest, blocks, query};
}
