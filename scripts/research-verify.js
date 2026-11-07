// Full collection checks, not a sampled graph or a success-only smoke test.
process.env.RESEARCH_LOCAL = '1';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {getStore}=require('../netlify/functions/lib/research-store');
const {service}=require('../netlify/functions/lib/research-service');
async function main(){
  const root=path.resolve(__dirname,'..');
  const pointer=JSON.parse(fs.readFileSync(path.join(root,'.research/current.json'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(pointer.manifest,'utf8'));
  const db=new DatabaseSync(pointer.database,{readOnly:true});
  const value=q=>db.prepare(q).get().n;
  const checks={};
  for(const [origin,source,table] of [['distiller','distiller','links'],['mesh','distiller','mesh_links'],['dmce','dmce','edges']]){
    const n=db.prepare('SELECT count(*) AS n FROM relations WHERE origin=?').get(origin).n;
    assert.equal(n,manifest.source_tables[source][table],origin+' count changed');checks[origin]=n;
  }
  assert.equal(value('SELECT count(*) AS n FROM relations r LEFT JOIN entities a ON a.id=r.source LEFT JOIN entities b ON b.id=r.target WHERE a.id IS NULL OR b.id IS NULL'),0,'Dangling relationship endpoint');
  assert.equal(value('SELECT count(*) AS n FROM aliases a LEFT JOIN entities e ON e.id=a.entity_id WHERE e.id IS NULL'),0,'Dangling alias');
  assert.equal(value('SELECT count(*) AS n FROM search'),value('SELECT count(*) AS n FROM entities WHERE published=1'),'Incomplete search index');
  assert.equal(value("SELECT count(*) AS n FROM relations WHERE origin='mesh' AND NOT (json_extract(raw,'$.direction') IS direction)"),0,'Mesh direction changed');
  assert.equal(value("SELECT count(*) AS n FROM relations WHERE origin='mesh' AND NOT (json_extract(raw,'$.why') IS rationale)"),0,'Mesh rationale changed');
  assert.equal(value("SELECT count(*) AS n FROM relations WHERE origin='distiller' AND NOT (json_extract(raw,'$.status') IS status)"),0,'Review decision changed');
  assert.equal(value("SELECT count(*) AS n FROM relations WHERE origin='dmce' AND NOT (json_extract(raw,'$.status') IS status)"),0,'DMCE status changed');
  assert.equal(value("SELECT count(*) AS n FROM entities WHERE id LIKE 'd:%'"),manifest.source_tables.distiller.nodes,'Distiller node identity missing');
  assert.equal(value('SELECT count(*) AS n FROM evidence'),manifest.source_tables.distiller.passages,'Evidence missing');
  const coverage=JSON.parse(fs.readFileSync(path.join(path.dirname(pointer.database),'vault-coverage.json'),'utf8'));
  assert.equal(coverage.length,manifest.coverage.total);
  assert.equal(coverage.filter(r=>!['included','private','operational'].includes(r.status)).length,0,'Unaccounted vault files');
  const fileRow=db.prepare('SELECT f.*,e.published FROM source_files f LEFT JOIN entities e ON e.id=f.entity_id WHERE f.path=?');
  for(const file of coverage){
    if(file.status==='operational'){assert.ok(file.reason);continue;}
    const row=fileRow.get(file.path);assert.ok(row?.entity_id,'No reading page: '+file.path);
    assert.equal(row.sha256,file.sha256);assert.equal(row.bytes,file.bytes);
    assert.equal(row.published,file.status==='included'?1:0,'Publication flag mismatch: '+file.path);
  }
  const projectionCounts=new Map(db.prepare("SELECT json_extract(metadata,'$.source_table') AS source,count(*) AS n FROM entities GROUP BY source").all().map(r=>[r.source,r.n]));
  for(const [table,count] of Object.entries(manifest.research_projections)){
    assert.equal(count,manifest.source_tables.distiller[table],'Incomplete research table: '+table);
    if(!['fiction_passages','entities'].includes(table)){
      const n=projectionCounts.get(table) || 0;
      assert.equal(n,count,'Research row has no reading page: '+table);
    }
  }
  assert.equal(value("SELECT count(*) AS n FROM entities WHERE kind='source-passage'"),manifest.source_tables.distiller.passages);
  assert.equal(value("SELECT count(*) AS n FROM relations WHERE origin='entity-mention'"),manifest.source_tables.distiller.entities);
  for(const asset of db.prepare('SELECT a.*,e.published FROM assets a JOIN entities e ON e.id=a.entity_id').iterate()){
    const file=path.join(path.dirname(pointer.database),'assets',asset.sha256);
    assert.equal(fs.statSync(file).size,asset.bytes,'Attachment size mismatch: '+asset.filename);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),asset.sha256,'Attachment changed: '+asset.filename);
  }
  checks.vaultFiles=manifest.coverage;checks.researchProjections=manifest.research_projections;
  // Every public entity has a real existing static page or a stable research route.
  const brokenRoutes=[];
  for(const row of db.prepare('SELECT id,href FROM entities WHERE published=1 AND href IS NOT NULL').iterate()){
    const url=new URL(row.href,'http://local');
    const file=path.join(root,'public',decodeURIComponent(url.pathname),'index.html');
    if(!fs.existsSync(file))brokenRoutes.push({id:row.id,href:row.href});
  }
  assert.deepEqual(brokenRoutes,[],'Public entities point to missing static pages');
  let store=getStore();
  for(const q of ['surveillance','Somali','communication','knowledge','" OR * NEAR (']){
    const results=await service(store,{action:'search',q});assert.ok(Array.isArray(results.results));
    for(const row of results.results){const record=await service(store,{action:'detail',id:row.id});assert.ok(!record.error,row.id);}
  }
  // Exercise local HTTP handlers in-process; no socket or browser permissions
  // are needed to verify routing, downloads, and returned bytes.
  const {Writable}=require('node:stream');
  const {finished}=require('node:stream/promises');
  const {handleRequest}=require('./research-preview');
  async function request(url,method='GET'){
    const chunks=[];
    const response=new Writable({write(chunk,encoding,next){chunks.push(Buffer.from(chunk));next();}});
    response.writeHead=(code,headers)=>{response.statusCode=code;response.headers=headers || {};return response;};
    await handleRequest({url,method},response);await finished(response);
    return {status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)};
  }
  const smallAsset=db.prepare('SELECT a.* FROM assets a JOIN entities e ON e.id=a.entity_id WHERE e.published=1 ORDER BY a.bytes LIMIT 1').get();
  const download=await request('/api/research-asset?id='+encodeURIComponent(smallAsset.entity_id));
  assert.equal(download.status,200);assert.equal(download.body.length,smallAsset.bytes);
  assert.equal(crypto.createHash('sha256').update(download.body).digest('hex'),smallAsset.sha256);
  assert.match(download.headers['content-disposition'],/^attachment;/);
  const shell=await request('/zettel/research/'+encodeURIComponent(smallAsset.entity_id)+'/');
  assert.equal(shell.status,200);assert.match(shell.body.toString(),/id="research-root"/);
  checks.localDownloadRoute='verified byte for byte';checks.localReadingRoute=200;
  store=require('../netlify/functions/lib/research-store').getStore();
  const overview=await service(store,{action:'overview'});
  const graph=await service(store,{action:'graph',id:overview.first.id});
  const ids=new Set(graph.nodes.map(n=>n.id));
  for(const edge of graph.edges){assert.ok(ids.has(edge.source));assert.ok(ids.has(edge.target));}
  for(const node of graph.nodes){assert.ok(!(await service(store,{action:'detail',id:node.id})).error);}
  const privateRow=db.prepare('SELECT id FROM entities WHERE published=0 LIMIT 1').get();
  if(privateRow)assert.equal((await service(store,{action:'detail',id:privateRow.id})).status,404,'Private content exposed');
  checks.publicEntities=value('SELECT count(*) AS n FROM entities WHERE published=1');
  checks.referenceRecords=value("SELECT count(*) AS n FROM entities WHERE kind='reference'");
  checks.evidence=value('SELECT count(*) AS n FROM evidence');
  checks.danglingEndpoints=0;checks.brokenEntityRoutes=0;
  // Hash every archived database and note archive against its manifest.
  for(const [name,record] of Object.entries(manifest.snapshots)){
    if(!record.sha256)continue;
    const file=path.join(path.dirname(pointer.manifest),name);const hash=crypto.createHash('sha256');
    for await(const chunk of fs.createReadStream(file))hash.update(chunk);
    assert.equal(hash.digest('hex'),record.sha256,'Snapshot checksum failed: '+name);
  }
  const report={checkedAt:new Date().toISOString(),snapshot:manifest.created_at,checks};
  fs.writeFileSync(path.join(root,'.research/verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));db.close();
}
main().catch(error=>{console.error(error);process.exitCode=1;});
