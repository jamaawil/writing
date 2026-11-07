const path = require('node:path');
const crypto = require('node:crypto');
const { unified } = require('unified');
const remarkParse = require('remark-parse').default;
const remarkGfm = require('remark-gfm').default;
const remarkRehype = require('remark-rehype').default;
const rehypeStringify = require('rehype-stringify').default;
function anchor(value) {
  let text=String(value || '');
  try{text=decodeURIComponent(text);}catch{}
  if(text.startsWith('^'))return 'block-'+text.slice(1);
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'');
}
function researchAnchors() {
  return tree => {
    const used=new Set();
    function walk(node) {
      if(node.type==='element') {
        if(/^h[1-6]$/.test(node.tagName)) {
          const getText=n=>n.type==='text'?n.value:(n.children||[]).map(getText).join('');
          const base=anchor(getText(node)) || 'section';let id=base,n=1;
          while(used.has(id))id=base+'-'+n++;used.add(id);
          node.properties={...node.properties,id};
        } else if(node.tagName==='p' && node.children?.length) {
          const last=node.children[node.children.length-1];
          if(last.type==='text') {const m=last.value.match(/\s+\^([a-zA-Z0-9-]+)\s*$/);if(m){last.value=last.value.slice(0,m.index);node.properties={...node.properties,id:'block-'+m[1]};}}
        }
      }
      (node.children||[]).forEach(walk);
    }
    walk(tree);
  };
}
function safeResearchLinks(options = {}) {
  return tree => {
    function walk(node) {
      if ((node.type === 'link' || node.type === 'image') && node.url) {
        const url = node.url.trim();
        if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?|mailto):/i.test(url)) {
          node.type = 'text'; node.value = node.alt || (node.children || []).map(n => n.value || '').join('');
          delete node.children; delete node.url;
        } else if (!/^(https?:|mailto:|\/\/|#|\/zettel\/research\/)/i.test(url)) {
          const target = options.sourcePath && !url.startsWith('/') ? path.posix.normalize(path.posix.join(path.posix.dirname(options.sourcePath), url)) : url.replace(/^(\.\.\/|\.\/)+/, '');
          const [file,...fragment]=target.split('#');
          node.url = '/zettel/research/?reference=' + encodeURIComponent(file)+(fragment.length?'&anchor='+encodeURIComponent(anchor(fragment.join('#'))):'');
          if (node.type === 'image') {
            node.type = 'link'; node.children = [{type:'text',value:node.alt || target}]; delete node.alt;
          }
        }
      }
      (node.children || []).forEach(walk);
    }
    walk(tree);
  };
}
const pipeline = unified().use(remarkParse).use(remarkGfm).use(safeResearchLinks).use(remarkRehype).use(researchAnchors).use(rehypeStringify);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parse = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const href = id => '/zettel/research/' + encodeURIComponent(id) + '/';
function normalize(value) {
  try { value = decodeURIComponent(value); } catch { /* keep malformed source reference intact */ }
  return String(value).normalize('NFC').trim().replace(/\\/g, '/')
    .replace(/^https?:\/\/jamaawil\.github\.io\/Digitalmind\//i, '')
    .replace(/^\/?Digitalmind\//i, '').replace(/\/$/, '').replace(/\.(md|html)$/i, '')
    .toLowerCase().replace(/^\//, '');
}
function item(row) { return { id: row.id, title: row.title, kind: row.kind, href: row.href || href(row.id) }; }
function pageNumber(value, fallback, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
}

async function renderBody(body, store, sourcePath) {
  // Resolve Obsidian references before Markdown rendering. Unknown references
  // open the search/resolve surface; they never produce guessed destinations.
  const replacements = new Map();
  const matches = [...body.matchAll(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)];
  for (const m of matches.slice(0, 2000)) {
    const target = m[1].split('#')[0];
    const key = normalize(target);
    if (!replacements.has(key)) {
      const rows = await store.query(`SELECT DISTINCT e.id,e.title,e.kind,e.href FROM aliases a
        JOIN entities e ON e.id=a.entity_id WHERE a.alias=? AND e.published=1 LIMIT 3`, [key]);
      replacements.set(key, rows.length === 1 ? item(rows[0]).href : '/zettel/research/?reference=' + encodeURIComponent(target));
    }
  }
  body = body.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const [file,...fragment]=target.split('#');
    const suffix=fragment.length?'#'+encodeURIComponent(anchor(fragment.join('#'))):'';
    let url = file ? replacements.get(normalize(file)) || '/zettel/research/?reference=' + encodeURIComponent(file) : '';
    if(url.includes('?reference=') && suffix)url+='&anchor='+encodeURIComponent(anchor(fragment.join('#')));
    else url+=suffix;
    return '[' + (label || target).replace(/[\[\]\\]/g, '\\$&') + '](' + url + ')';
  });
  // Generated markers remain in the preserved Markdown, outside the rendered
  // page. Raw HTML is disabled by remark-rehype (including scripts/events).
  body = body.replace(/<!--[^]*?-->/g, '').replace(/<\/?cite>/g, '').replace(/^>\s*\[![^\]]+\][-+]?\s*/gm, '> ');
  // Legacy Digitalmind links resolve through the imported alias registry.
  body = body.replace(/https:\/\/jamaawil\.github\.io\/Digitalmind\/([^\s)"<>]+)/g,
    (_, target) => '/zettel/research/?reference=' + encodeURIComponent(target));
  const renderer = sourcePath ? unified().use(remarkParse).use(remarkGfm).use(safeResearchLinks,{sourcePath}).use(remarkRehype).use(researchAnchors).use(rehypeStringify) : pipeline;
  return String(renderer.processSync(body));
}

async function search(store, params) {
  const q = String(params.q || '').trim().slice(0, 250);
  const kind = String(params.kind || '');
  const limit = pageNumber(params.limit, 24, 100) || 24;
  const offset = pageNumber(params.offset, 0, 10000000);
  let rows;
  if (!q) {
    rows = await store.query(`SELECT id,title,kind,href,body FROM entities WHERE published=1
      ${kind ? 'AND kind=?' : ''} ORDER BY title,id LIMIT ? OFFSET ?`, [...(kind ? [kind] : []), limit + 1, offset]);
  } else if (store.postgres) {
    rows = await store.query(`SELECT e.id,e.title,e.kind,e.href,e.body FROM entities e WHERE e.published=1
      ${kind ? 'AND e.kind=?' : ''} AND (to_tsvector('english',e.title || ' ' || e.body || ' ' || coalesce((e.metadata::jsonb->'frontmatter')::text,'')) @@ websearch_to_tsquery('english',?)
      OR e.id IN (SELECT entity_id FROM evidence WHERE to_tsvector('english',text) @@ websearch_to_tsquery('english',?)))
      ORDER BY ts_rank(to_tsvector('english',e.title || ' ' || e.body || ' ' || coalesce((e.metadata::jsonb->'frontmatter')::text,'')),websearch_to_tsquery('english',?)) DESC,e.id LIMIT ? OFFSET ?`,
      [...(kind ? [kind] : []), q, q, q, limit + 1, offset]);
  } else {
    const terms = q.match(/[\p{L}\p{N}_]+/gu) || [];
    if (!terms.length) return { results: [], more: false, offset };
    const match = terms.slice(0, 20).map(t => '"' + t.replace(/"/g, '""') + '"*').join(' AND ');
    rows = await store.query(`WITH hits AS MATERIALIZED (
      SELECT entity_id,bm25(search,0,8,1) AS score FROM search WHERE search MATCH ?
      UNION ALL SELECT entity_id,bm25(evidence_search) AS score FROM evidence_search WHERE evidence_search MATCH ?
      ) SELECT e.id,e.title,e.kind,e.href,e.body,min(h.score) AS score FROM hits h
      JOIN entities e ON e.id=h.entity_id WHERE e.published=1 ${kind ? 'AND e.kind=?' : ''}
      GROUP BY e.id ORDER BY score,e.id LIMIT ? OFFSET ?`, [match, match, ...(kind ? [kind] : []), limit + 1, offset]);
  }
  return { results: rows.slice(0, limit).map(row => ({...item(row), excerpt: String(row.body || '')
    .replace(/<!--[^]*?-->/g, '').replace(/^#+[^\n]*$/gm, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_,a,b) => b || a)
    .replace(/<[^>]*>/g, '').replace(/[>*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0,190)})), more: rows.length > limit, offset, limit };
}

async function relationships(store, id, params) {
  const limit = pageNumber(params.limit, 30, 100) || 30;
  const offset = pageNumber(params.offset, 0, 10000000);
  const origin = String(params.origin || '');
  const predicate = String(params.predicate || '');
  const history = params.history === '1';
  const rows = await store.query(`SELECT r.*,a.title AS source_title,a.kind AS source_kind,a.href AS source_href,
    b.title AS target_title,b.kind AS target_kind,b.href AS target_href FROM relations r
    JOIN entities a ON a.id=r.source JOIN entities b ON b.id=r.target
    WHERE (r.source=? OR r.target=?) AND a.published=1 AND b.published=1
    ${history ? '' : "AND coalesce(r.predicate,'')!='none' AND coalesce(r.status,'') NOT IN ('none','rejected')"}
    ${origin ? 'AND r.origin=?' : ''} ${predicate ? 'AND r.predicate=?' : ''}
    ORDER BY CASE r.status WHEN 'accepted' THEN 0 WHEN 'authored' THEN 0 ELSE 1 END,
      coalesce(r.strength,0) DESC,r.id LIMIT ? OFFSET ?`,
    [id,id,...(origin ? [origin] : []),...(predicate ? [predicate] : []),limit + 1,offset]);
  return { results: rows.slice(0,limit).map(r => ({ id:r.id,origin:r.origin,predicate:r.predicate,
    direction:r.direction,status:r.status,strength:r.strength,rationale:r.rationale,raw:parse(r.raw),
    source:{id:r.source,title:r.source_title,kind:r.source_kind,href:r.source_href || href(r.source)},
    target:{id:r.target,title:r.target_title,kind:r.target_kind,href:r.target_href || href(r.target)} })),
    more:rows.length > limit,offset,limit };
}

async function service(store, params) {
  const action = params.action || 'search';
  if (action === 'search') return search(store,params);
  if (action === 'home') {
    const sections = [
      ['maps','Maps of content','map','A book’s argument, opened into its individual claims.'],
      ['themes','Themes','theme','Follow a question across authors, periods, and disciplines.'],
      ['garden','Garden of Claims','trail','Reading paths that bring several ideas into one conversation.'],
      ['sources','Sources','book','Return to the books and the arguments they make.'],
      ['passages','Passages','passage','Language, images, and moments worth keeping.'],
      ['source-passages','Source passages','source-passage','Every original highlight, with its annotation and source book.'],
      ['new-knowledge','New knowledge','hypothesis','Provisional syntheses to question, develop, and test.'],
      ['learn','Learn','learning','Book-by-book studies of argument, structure, and craft.'],
      ['booklab','Booklab','booklab','Literary works read alongside their criticism.'],
      ['mesh','Knowledge mesh','mesh','Connections and disagreements between books.'],
      ['glossary','Glossary','glossary','Recurring concepts, grounded in the collection.'],
      ['my-notes','My notes','note','Notes and reflections in my own words.'],
      ['digests','Research digests','digest','Collected summaries from the vault.'],
      ['archives','Archived notes','archive','Earlier notes preserved with their original links.'],
      ['manuscripts','Manuscripts','manuscript','Writing projects and their research.'],
      ['canvases','Canvases','canvas','Spatial notes with every node and connection preserved.'],
      ['views','Database views','view','Original Obsidian Base definitions.'],
      ['attachments','Attachments','attachment','Original documents, books, images, and audio.'],
      ['reading-suggestions','Reading suggestions','reading-suggestion','Suggested sources, their excerpts, and the reasoning behind them.'],
      ['booklab-readings','Booklab passages','booklab-reading','Passages and analyses from the literary research database.'],
      ['factchecks','Research fact checks','factcheck','Original verdicts, corrections, and supporting sources.'],
      ['concepts','Named concepts','named-concept','Follow mentions across the research.']
    ];
    const results = await Promise.all(sections.map(async ([id,title,kind,description]) => {
      const count = Number((await store.query('SELECT count(*) AS count FROM entities WHERE published=1 AND kind=?',[kind]))[0].count);
      const rows = await store.query('SELECT id,title,kind,href FROM entities WHERE published=1 AND kind=? ORDER BY title,id LIMIT 7',[kind]);
      return {id,title,kind,description,count,results:rows.map(item),href:'/zettel/?kind='+encodeURIComponent(kind)};
    }));
    return {sections:results.filter(section=>section.count>0)};
  }
  if (action === 'overview') {
    const counts = await store.query('SELECT kind,count(*) AS count FROM entities WHERE published=1 GROUP BY kind ORDER BY kind');
    const manifest = parse((await store.query("SELECT value FROM metadata WHERE key='manifest'"))[0]?.value);
    const first = await store.query("SELECT id,title,kind,href FROM entities WHERE published=1 AND kind='claim' AND length(body)>100 ORDER BY id LIMIT 1");
    return { counts,relations:manifest.relations || {},coverage:manifest.coverage || {},researchProjections:manifest.research_projections || {},created_at:manifest.created_at,first:first[0] && item(first[0]) };
  }
  if (action === 'resolve') {
    const reference = String(params.reference || '').slice(0,2000);
    let rows = await store.query(`SELECT DISTINCT e.id,e.title,e.kind,e.href FROM aliases a
      JOIN entities e ON e.id=a.entity_id WHERE a.alias=? AND e.published=1 ORDER BY e.kind,e.id`,[normalize(reference)]);
    if (!rows.length && reference.includes('/')) {
      rows = await store.query(`SELECT DISTINCT e.id,e.title,e.kind,e.href FROM aliases a
        JOIN entities e ON e.id=a.entity_id WHERE a.alias=? AND e.published=1 ORDER BY e.kind,e.id`,[normalize(reference).split('/').pop()]);
    }
    if(rows.some(r=>r.kind!=='reference'))rows=rows.filter(r=>r.kind!=='reference');
    return {reference,results:rows.map(item)};
  }
  const id = String(params.id || '').slice(0,300);
  const row = (await store.query('SELECT * FROM entities WHERE id=? AND published=1',[id]))[0];
  if (!row) return { error:'No public record matches this address.',status:404 };
  if (action === 'relations') return relationships(store,id,params);
  if (action === 'graph') {
    const related = await relationships(store,id,{...params,limit:80});
    const nodes = new Map([[id,item(row)]]);
    for (const edge of related.results) {nodes.set(edge.source.id,edge.source);nodes.set(edge.target.id,edge.target);}
    return { nodes:[...nodes.values()],edges:related.results.map(r => ({id:r.id,source:r.source.id,target:r.target.id,
      predicate:r.predicate,direction:r.direction,status:r.status,origin:r.origin})),more:related.more };
  }
  if (action === 'detail') {
    const metadata = parse(row.metadata);
    // Local paths, workflow prompts, API operational metadata stay in the
    // preservation snapshot rather than leaking through the public API.
    const fm = metadata.frontmatter || {};
    const evidence = await store.query(`SELECT e.id,e.text,e.location,b.id AS book_id,b.title AS book_title,b.href AS book_href
      FROM evidence e LEFT JOIN entities b ON b.id=e.book_id AND b.published=1
      WHERE e.entity_id=? ORDER BY e.id LIMIT 21`,[id]);
    const evidenceCount = (await store.query('SELECT count(*) AS count FROM evidence WHERE entity_id=?',[id]))[0].count;
    const referenceCandidates = [];
    if(row.kind==='reference' && metadata.reference){
      const resolved=await service(store,{action:'resolve',reference:metadata.reference});
      for(const candidate of resolved.results){if(candidate.id!==id && candidate.kind!=='reference')referenceCandidates.push(candidate);}
    }
    for (const candidate of (metadata.candidates || []).slice(0,100)) {
      const n = (await store.query('SELECT id,title,kind,href FROM entities WHERE id=? AND published=1',[candidate]))[0];
      if (n && !referenceCandidates.some(candidate=>candidate.id===n.id)) referenceCandidates.push(item(n));
    }
    const attachmentRows = await store.query('SELECT entity_id,filename,mime,bytes,sha256 FROM assets WHERE entity_id=?',[id]);
    const attachment = attachmentRows[0];
    return {...item(row),html:await renderBody(row.body,store,row.source_path),
      attachment:attachment ? {...attachment,href:'/api/research-asset?id='+encodeURIComponent(id)} : null,
      canvas:metadata.canvas ? {...metadata.canvas,nodes:(metadata.canvas.nodes || []).map(n => ({...n,href:href('canvas:'+crypto.createHash('sha256').update(id+'\0'+n.id).digest('hex').slice(0,32))}))} : null,
      sourcePassage:metadata.source_table==='passages'?metadata.record:null,
      claimProvenance:metadata.claim_record?{secondhand:metadata.claim_record.secondhand,evidenceCount:metadata.claim_record.evidence_count,recurrence:metadata.claim_record.recurrence,firstSeen:metadata.claim_record.first_seen,evidenceTier:metadata.evidence_tier,origin:metadata.origin}:null,
      properties:fm,tags:Array.isArray(fm.tags) ? fm.tags : [],status:fm.status || '',
      citation:{citekey:fm.citekey,location:fm.loc,sources:fm.sources || fm.source_books || [],
        source_url:/^https?:\/\//.test(fm.source_url || '') ? fm.source_url : undefined},
      referenceCandidates,evidence:evidence.slice(0,20).map(e => ({text:e.text,location:e.location,
        book:e.book_id ? {id:e.book_id,title:e.book_title,href:e.book_href || href(e.book_id)} : null})),
      evidenceCount,relations:await relationships(store,id,params)};
  }
  if (action === 'evidence') {
    const offset = pageNumber(params.offset,0,10000000);
    const rows = await store.query(`SELECT e.text,e.location,b.id AS book_id,b.title AS book_title FROM evidence e
      LEFT JOIN entities b ON b.id=e.book_id AND b.published=1 WHERE e.entity_id=? ORDER BY e.id LIMIT 21 OFFSET ?`,[id,offset]);
    return {results:rows.slice(0,20).map(e => ({text:e.text,location:e.location,book:e.book_id ? {title:e.book_title,href:href(e.book_id)} : null})),more:rows.length>20,offset,limit:20};
  }
  return {error:'Unknown research operation.',status:400};
}
module.exports = { service,href,normalize,esc,renderBody };
