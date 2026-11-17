const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {service,renderBody}=require('../netlify/functions/lib/research-service');
const {applySlugs}=require('../scripts/research-slugs');
const {collectGraph}=require('../scripts/lib/constellation-graph');
test('Constellation includes derived and isolated public records and every connection origin',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE cards(id TEXT PRIMARY KEY,title TEXT,kind TEXT,href TEXT,published INTEGER);
    CREATE TABLE relations(source TEXT,target TEXT,origin TEXT,predicate TEXT,status TEXT);
    INSERT INTO cards VALUES('a','Claim','claim','/a/',1),('b','Evidence','source-passage','/b/',1),
      ('c','Isolated chapter','chapter','/c/',1),('p','Private','note','/p/',0);`);
  const origins=['wikilink','dmce','distiller','mesh','note-property','canvas','entity-mention',
    'mesh_book_pairs','mesh_debates','mesh_debates_v1','passage-source','research-record','source-evidence'];
  const insert=db.prepare('INSERT INTO relations VALUES(?,?,?,?,?)');
  origins.forEach(origin=>insert.run('a','b',origin,'links-to','accepted'));
  insert.run('b','a','wikilink','links-to','accepted');
  insert.run('a','c','wikilink','links-to','rejected');
  insert.run('a','c','wikilink','none','accepted');
  insert.run('a','p','wikilink','links-to','accepted');
  insert.run('a','a','wikilink','links-to','accepted');
  const graph=collectGraph(db);
  assert.deepEqual(graph.rows.map(row=>row.id),['a','b','c']);
  assert.equal(graph.origins.length,13);
  assert.deepEqual(Array.from(graph.pairs),[0,1]);
  assert.ok(graph.bits instanceof Uint16Array);
  assert.equal(graph.bits[0],(1<<13)-1);
  assert.equal(graph.relationCounts.reduce((a,b)=>a+b,0),14);
  db.close();
});
test('Published URLs survive renames and new duplicate titles',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec("CREATE TABLE entities(id TEXT PRIMARY KEY,title TEXT,kind TEXT,href TEXT); INSERT INTO entities VALUES('old','Original title','claim',NULL),('removed','Retired title','claim',NULL)");
  applySlugs(db);
  const previous=db.prepare('SELECT slug,entity_id FROM slugs').all();
  db.exec("UPDATE entities SET title='Renamed title' WHERE id='old'; DELETE FROM entities WHERE id='removed'; INSERT INTO entities VALUES('aaa','Original title','claim',NULL),('bbb','Retired title','claim',NULL)");
  applySlugs(db,previous);
  assert.equal(db.prepare("SELECT entity_id FROM slugs WHERE slug='original-title'").get().entity_id,'old');
  assert.notEqual(db.prepare("SELECT slug FROM slugs WHERE entity_id='aaa'").get().slug,'original-title');
  assert.notEqual(db.prepare("SELECT slug FROM slugs WHERE entity_id='bbb'").get().slug,'retired-title');
  db.close();
});
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
    CREATE INDEX entities_id_kind ON entities(id,published,kind);
    CREATE INDEX entities_title ON entities(published,title,id);
    CREATE INDEX entities_kind_title ON entities(published,kind,title,id);
    CREATE INDEX relations_source ON relations(source,origin,status);
    CREATE INDEX relations_target ON relations(target,origin,status);
    CREATE INDEX relations_source_rank ON relations(source,(CASE status WHEN 'accepted' THEN 0 WHEN 'authored' THEN 0 ELSE 1 END),(coalesce(strength,0)) DESC,id);
    CREATE INDEX relations_target_rank ON relations(target,(CASE status WHEN 'accepted' THEN 0 WHEN 'authored' THEN 0 ELSE 1 END),(coalesce(strength,0)) DESC,id);
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
test('Wikilinks target actual records, unresolved ones stay as text, and raw executable HTML is excluded',async()=>{
  const {db,store}=fixture();const html=await renderBody('[[A source claim]] and [[an uncertain source]]\n\n<script>alert(1)</script>',store);
  assert.match(html,/\/zettel\/research\/a\//);
  // A link to a note that is not in the collection stays as text, never a dead link.
  assert.match(html,/<span class="research-unresolved"[^>]*>an uncertain source<\/span>/);assert.doesNotMatch(html,/reference=/);assert.doesNotMatch(html,/<script>/);db.close();
});
test('Local Markdown links resolve to records or stay as text; script URLs do not execute',async()=>{
  const {db,store}=fixture();const html=await renderBody('[Source](../02-Sources/A%20source.md) and [unsafe](javascript:alert%281%29)',store);
  assert.match(html,/<span class="research-unresolved"[^>]*>Source<\/span>/);assert.doesNotMatch(html,/reference=/);assert.doesNotMatch(html,/href="javascript:/);db.close();
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
