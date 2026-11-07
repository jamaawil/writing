// Serves research attachments from R2 by SHA-256 name. Every response is a
// download (never rendered inline), so untrusted HTML/SVG cannot run.
export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    const key = new URL(request.url).pathname.slice(1);
    // Research database pieces, read by byte range by the Netlify function.
    if (/^db\/\d{8}T\d{6}Z\/(\d{6}|manifest\.json)$/.test(key)) {
      const range = request.headers.get('Range');
      const object = await env.ASSETS.get(key, range ? {range: request.headers} : {});
      if (!object) return new Response('Not found', {status: 404});
      const headers = new Headers({'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'ETag': object.httpEtag});
      headers.set('Content-Type', key.endsWith('.json') ? 'application/json' : 'application/octet-stream');
      if (range && object.range) {
        const start = object.range.offset ?? 0, length = object.range.length ?? (object.size - start);
        headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
        return new Response(request.method === 'HEAD' ? null : object.body, {status: 206, headers});
      }
      headers.set('Content-Length', String(object.size));
      return new Response(request.method === 'HEAD' ? null : object.body, {headers});
    }
    if (!/^[0-9a-f]{64}$/.test(key)) return new Response('Not found', {status: 404});
    const object = request.method === 'HEAD' ? await env.ASSETS.head(key) : await env.ASSETS.get(key);
    if (!object) return new Response('Not found', {status: 404});
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!/^attachment/i.test(headers.get('Content-Disposition') || '')) headers.set('Content-Disposition', `attachment; filename="${key}"`);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('ETag', object.httpEtag);
    return new Response(request.method === 'HEAD' ? null : object.body, {headers});
  }
};
