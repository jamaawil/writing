// Local preview uses the same API service and site assets as Netlify. Source
// vaults/databases are never opened by the website; only the publication copy.
process.env.RESEARCH_LOCAL = '1';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const apiModules = ['../netlify/functions/research', '../netlify/functions/lib/research-service', '../netlify/functions/lib/research-store'].map(name => require.resolve(name));
let handler, signature;
function currentHandler() {
  const next = [...apiModules, path.resolve(__dirname, '../.research/current.json')].map(file => fs.statSync(file).mtimeMs).join(':');
  if (next !== signature) {
    const previous = require.cache[apiModules[2]];
    if (previous?.exports.closeStore) previous.exports.closeStore();
    apiModules.forEach(file => { delete require.cache[file]; });
    handler = require(apiModules[0]).handler;
    signature = next;
  }
  return handler;
}
const root = path.resolve(__dirname,'../public');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
const handleRequest = async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if (url.pathname === '/api/research') {
    try {
      const response = await currentHandler()({httpMethod:req.method,queryStringParameters:Object.fromEntries(url.searchParams)});
      res.writeHead(response.statusCode,{...response.headers,'cache-control':'no-store'});res.end(response.body);
    } catch (error) { res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:'The local research publication is unavailable. Run npm run research:import.'})); }
    return;
  }
  if (url.pathname === '/api/research-asset') {
    try {
      if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
      currentHandler();
      const {getStore}=require('../netlify/functions/lib/research-store');
      const assets=await getStore().query('SELECT a.* FROM assets a JOIN entities e ON e.id=a.entity_id WHERE a.entity_id=? AND e.published=1',[url.searchParams.get('id') || '']);
      const asset=assets[0];
      if (!asset) {res.writeHead(404);res.end('No public attachment matches this address.');return;}
      const pointer=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.research/current.json'),'utf8'));
      if (!/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error('Invalid asset identifier');
      const file=path.join(path.dirname(pointer.database),'assets',asset.sha256);
      const size=fs.statSync(file).size;
      res.writeHead(200,{'content-type':asset.mime,'content-length':size,'content-disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(asset.filename),'x-content-type-options':'nosniff','cache-control':'no-store'});
      if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
    } catch {res.writeHead(503);res.end('The attachment publication is unavailable.');}
    return;
  }
  let relative;
  try {relative = decodeURIComponent(url.pathname);} catch {res.writeHead(400);res.end();return;}
  if (relative.startsWith('/zettel/research/')) relative = '/zettel/research/index.html';
  let file = path.resolve(root,'.' + relative);
  if (!file.startsWith(root + path.sep) && file !== root) {res.writeHead(403);res.end();return;}
  try {if (fs.statSync(file).isDirectory()) file = path.join(file,'index.html');} catch {}
  if (!fs.existsSync(file)) {res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'content-type':types[path.extname(file)] || 'application/octet-stream','cache-control':'no-store'});
  fs.createReadStream(file).pipe(res);
};
if (require.main === module) {
  const server=http.createServer(handleRequest);
  server.listen(Number(process.env.PORT || 4173),'127.0.0.1',() => console.log('Research preview: http://127.0.0.1:' + server.address().port + '/zettel/'));
}
module.exports={handleRequest};
