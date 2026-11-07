// Explicit, opt-in upload to a separate, versioned research schema. This script
// is never run by npm build or by the existing publish command.
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {neon} = require('@neondatabase/serverless');
async function main(){
  if(!process.env.RESEARCH_DATABASE_URL)throw new Error('Set RESEARCH_DATABASE_URL for the research database.');
  const schema=process.env.RESEARCH_SCHEMA;
  if(!/^zettel_[a-z0-9_]+$/.test(schema || ''))throw new Error('Set a new RESEARCH_SCHEMA, such as zettel_20261107. Existing schemas will not be overwritten.');
  const pointer=JSON.parse(fs.readFileSync(path.join(__dirname,'../.research/current.json'),'utf8'));
  const db=new DatabaseSync(pointer.database,{readOnly:true}),sql=neon(process.env.RESEARCH_DATABASE_URL);
  // CREATE SCHEMA deliberately fails if this name already exists.
  await sql.query('CREATE SCHEMA "'+schema+'"');
  const definitions={
    entities:'id text PRIMARY KEY,title text NOT NULL,kind text NOT NULL,body text NOT NULL,metadata text NOT NULL,source_path text,published integer NOT NULL,href text',
    aliases:'alias text NOT NULL,entity_id text NOT NULL,origin text NOT NULL,PRIMARY KEY(alias,entity_id,origin)',
    relations:'id text PRIMARY KEY,origin text NOT NULL,source text NOT NULL,target text NOT NULL,predicate text,direction text,status text,strength double precision,rationale text,raw text NOT NULL',
    evidence:'id text PRIMARY KEY,entity_id text,book_id text,text text,location text,raw text NOT NULL',
    assets:'entity_id text PRIMARY KEY,sha256 text NOT NULL,filename text NOT NULL,mime text NOT NULL,bytes bigint NOT NULL',
    metadata:'key text PRIMARY KEY,value text NOT NULL',
    source_files:'path text PRIMARY KEY,sha256 text NOT NULL,bytes bigint NOT NULL,entity_id text'
  };
  for(const [table,definition] of Object.entries(definitions)){
    const qualified='"'+schema+'"."'+table+'"';
    await sql.query('CREATE TABLE '+qualified+' ('+definition+')');
    const columns=db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
    let batch=[],bytes=0,uploaded=0;
    async function flush(){
      if(!batch.length)return;
      await sql.query('INSERT INTO '+qualified+' SELECT * FROM jsonb_populate_recordset(NULL::'+qualified+',$1::jsonb)',[JSON.stringify(batch)]);
      uploaded+=batch.length;batch=[];bytes=0;
    }
    for(const row of db.prepare('SELECT '+columns.map(c=>'"'+c+'"').join(',')+' FROM '+table).iterate()){
      const size=Buffer.byteLength(JSON.stringify(row));if(batch.length && (batch.length>=500 || bytes+size>750000))await flush();batch.push(row);bytes+=size;
    }
    await flush();
    const expected=db.prepare('SELECT count(*) AS n FROM '+table).get().n;
    const actual=(await sql.query('SELECT count(*) AS n FROM '+qualified))[0].n;
    if(Number(expected)!==Number(actual))throw new Error('Count mismatch for '+table);
    console.log(table+': '+uploaded+' records verified');
  }
  const q=t=>'"'+schema+'"."'+t+'"';
  for(const statement of [
    `CREATE INDEX ON ${q('relations')}(source,origin,status)`,
    `CREATE INDEX ON ${q('relations')}(target,origin,status)`,
    `CREATE INDEX ON ${q('entities')}(published,kind,title)`,
    `CREATE INDEX ON ${q('evidence')}(entity_id)`,
    `CREATE INDEX ON ${q('evidence')}(book_id)`,
    `CREATE INDEX ON ${q('entities')} USING gin(to_tsvector('english',title || ' ' || body || ' ' || coalesce((metadata::jsonb->'frontmatter')::text,'')))`,
    `CREATE INDEX ON ${q('evidence')} USING gin(to_tsvector('english',text))`
  ])await sql.query(statement);
  const dangling=(await sql.query(`SELECT count(*) AS n FROM ${q('relations')} r LEFT JOIN ${q('entities')} a ON a.id=r.source LEFT JOIN ${q('entities')} b ON b.id=r.target WHERE a.id IS NULL OR b.id IS NULL`))[0].n;
  if(Number(dangling))throw new Error('Uploaded relationships have unresolved endpoints.');
  db.close();console.log('Upload validated. To activate this publication, configure RESEARCH_SCHEMA='+schema+' in Netlify.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
