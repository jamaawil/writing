const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {service,renderBody}=require('../netlify/functions/lib/research-service');
function fixture(){
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE entities(id TEXT PRIMARY KEY,title TEXT,kind TEXT,body TEXT,metadata TEXT,published INTEGER,href TEXT);
    CREATE TABLE aliases(alias TEXT,entity_id TEXT,origin TEXT);
    CREATE TABLE evidence(id TEXT,entity_id TEXT,book_id TEXT,text TEXT,location TEXT,raw TEXT);
    CREATE TABLE relations(id TEXT,origin TEXT,source TEXT,target TEXT,predicate TEXT,direction TEXT,status TEXT,strength REAL,rationale TEXT,raw TEXT);
    CREATE TABLE assets(entity_id TEXT PRIMARY KEY,filename TEXT,mime TEXT,bytes INTEGER,sha256 TEXT);
    CREATE TABLE metadata(key TEXT,value TEXT);
    CREATE VIRTUAL TABLE search USING fts5(entity_id UNINDEXED,title,body);
    CREATE VIRTUAL TABLE evidence_search USING fts5(entity_id UNINDEXED,text);
    INSERT INTO entities VALUES('a','A source claim','claim','The author argues a position.','{}',1,NULL),('b','A qualifying claim','claim','Conditions change the argument.','{}',1,NULL),('p','Private notebook','note','Private text.','{}',0,NULL);
    INSERT INTO aliases VALUES('a source claim','a','source'),('private notebook','p','source');
    INSERT INTO evidence VALUES('ev','a',NULL,'A passage about hippocampal consolidation.','42','{}');
    INSERT INTO search SELECT id,title,body FROM entities WHERE published=1;
    INSERT INTO evidence_search VALUES('a','A passage about hippocampal consolidation.');
    INSERT INTO relations VALUES('one','mesh','a','b','qualifies','b_to_a','unreviewed',.8,'B limits the scope of A.','{"direction":"b_to_a"}'),('two','dmce','a','b','similar','mutual','provisional',.9,NULL,'{}'),('three','distiller','a','b','none','a_to_b','rejected',.1,NULL,'{}');`);
  return {db,store:{postgres:false,query:async(sql,args=[])=>db.prepare(sql).all(...args)}};
}
test('Search includes evidence-only terms and tolerates FTS syntax as plain input',async()=>{
  const {db,store}=fixture();
  assert.deepEqual((await service(store,{q:'hippocampal'})).results.map(r=>r.id),['a']);
  assert.deepEqual((await service(store,{q:'private'})).results,[]);
  assert.ok(Array.isArray((await service(store,{q:'" OR * NEAR ('})).results));db.close();
});
test('Parallel assessments, mutuality and review decisions survive graph and history views',async()=>{
  const {db,store}=fixture();
  const normal=await service(store,{action:'relations',id:'a'});assert.equal(normal.results.length,2);
  assert.equal(normal.results.find(r=>r.id==='one').direction,'b_to_a');
  assert.equal(normal.results.find(r=>r.id==='two').direction,'mutual');
  const history=await service(store,{action:'relations',id:'a',history:'1'});assert.equal(history.results.length,3);
  const graph=await service(store,{action:'graph',id:'a'});assert.equal(graph.nodes.length,2);assert.equal(graph.edges.length,2);
  assert.equal((await service(store,{action:'detail',id:'p'})).status,404);db.close();
});
test('Wikilinks target actual records, and raw executable HTML is excluded',async()=>{
  const {db,store}=fixture();const html=await renderBody('[[A source claim]] and [[an uncertain source]]\n\n<script>alert(1)</script>',store);
  assert.match(html,/\/zettel\/research\/a\//);assert.match(html,/reference=an%20uncertain%20source/);assert.doesNotMatch(html,/<script>/);db.close();
});
test('Local Markdown links are resolved instead of guessing file URLs; script URLs do not execute',async()=>{
  const {db,store}=fixture();const html=await renderBody('[Source](../02-Sources/A%20source.md) and [unsafe](javascript:alert%281%29)',store);
  assert.match(html,/\/zettel\/research\/\?reference=/);assert.doesNotMatch(html,/href="javascript:/);db.close();
});

test('Attachments retain their download address and canvases expose stable node links',async()=>{
  const {db,store}=fixture();
  db.prepare('UPDATE entities SET metadata=? WHERE id=?').run(JSON.stringify({canvas:{nodes:[{id:'one',text:'An original idea',x:10,y:20}],edges:[]}}),'a');
  db.prepare('INSERT INTO assets VALUES(?,?,?,?,?)').run('a','Original.canvas','application/json',123,'a'.repeat(64));
  const detail=await service(store,{action:'detail',id:'a'});
  assert.equal(detail.attachment.href,'/api/research-asset?id=a');
  assert.equal(detail.attachment.filename,'Original.canvas');
  assert.match(detail.canvas.nodes[0].href,/^\/zettel\/research\/canvas%3A[a-f0-9]{32}\/$/);
  db.close();
});

test('Obsidian heading and block references keep usable anchors',async()=>{
  const {db,store}=fixture();
  const html=await renderBody('[[A source claim#My Heading]] and [[#^passage-one]]\n\n## My Heading\n\nAn exact passage. ^passage-one',store);
  assert.match(html,/href="\/zettel\/research\/a\/#my-heading"/);
  assert.match(html,/href="#block-passage-one"/);
  assert.match(html,/id="my-heading"/);
  assert.match(html,/id="block-passage-one"/);
  db.close();
});
test('A recovered source takes precedence over an old unresolved reference',async()=>{
  const {db,store}=fixture();
  db.prepare('INSERT INTO entities VALUES(?,?,?,?,?,?,?)').run('r','A source claim','reference','',JSON.stringify({reference:'A source claim',candidates:[]}),1,null);
  db.prepare('INSERT INTO aliases VALUES(?,?,?)').run('a source claim','r','reference');
  const resolved=await service(store,{action:'resolve',reference:'A source claim'});
  assert.deepEqual(resolved.results.map(r=>r.id),['a']);
  const oldAddress=await service(store,{action:'detail',id:'r'});
  assert.deepEqual(oldAddress.referenceCandidates.map(r=>r.id),['a']);
  db.close();
});
