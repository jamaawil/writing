const zlib = require('node:zlib');
const {getStore} = require('./lib/research-store');
const {service} = require('./lib/research-service');
// Large notes (digests up to ~10 MB of HTML) exceed the 6 MB function response
// limit, so responses over 256 KB are sent gzip-compressed (about 4x smaller).
const reply = (event, statusCode, headers, body) => {
  const accepts = /\bgzip\b/.test((event.headers || {})['accept-encoding'] || '');
  if (!accepts || Buffer.byteLength(body) < 262144) return {statusCode, headers, body};
  return {statusCode, headers:{...headers,'content-encoding':'gzip','vary':'Accept-Encoding'}, isBase64Encoded:true, body:zlib.gzipSync(body,{level:6}).toString('base64')};
};
exports.handler = async event => {
  const headers = {'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60'};
  if (event.httpMethod !== 'GET') return {statusCode:405,headers,body:JSON.stringify({error:'Use GET.'})};
  try {
    const result = await service(getStore(),event.queryStringParameters || {});
    return reply(event, result.error && Number.isInteger(result.status) ? result.status : 200, headers, JSON.stringify(result));
  } catch (error) {
    console.error('Research query failed:',error.message);
    return {statusCode:503,headers:{...headers,'cache-control':'no-store'},body:JSON.stringify({error:'Research is temporarily unavailable. Please retry.'})};
  }
};
