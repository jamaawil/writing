(function () {
  'use strict';
  var root=document.getElementById('research-root');if(!root)return;
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  var form=root.querySelector('form'),input=form.elements.q,kind=form.elements.kind;
  var results=root.querySelector('[data-results]'),status=root.querySelector('[data-status]'),detail=root.querySelector('[data-detail]'),graph=root.querySelector('[data-graph]'),graphLabel=root.querySelector('[data-graph-label]');
  var generation=0,searchOffset=0,current=null;
  var initial=new URLSearchParams(location.search),segment=location.pathname.match(/^\/zettel\/research\/([^/]+)\/?$/);
  if(segment){try{current=decodeURIComponent(segment[1]);}catch{}}
  if(root.dataset.entity)current=root.dataset.entity;
  if(current)root.classList.add('is-detail');
  else if(initial.has('q')||initial.has('kind'))root.classList.add('is-browsing');
  input.value=initial.get('q')||'';
  async function api(params){var response=await fetch('/api/research?'+new URLSearchParams(params)),data=await response.json();if(!response.ok)throw new Error(data.error||'Research could not be loaded.');return data;}
  function link(r){return '<a href="'+esc(r.href)+'">'+esc(r.title)+'</a>';}
  var names={'claim':'Source claim','book':'Book & source','passage':'Passage','hypothesis':'Hypothesis','web-claim':'Web evidence','book-conversation':'Book conversation','debate-history':'Earlier debate','booklab':'Book study','mesh':'Research mesh','library':'Reading note','note':'Note','map':'Map of content','glossary':'Glossary entry','wikilink':'Authored connection','unreviewed':'Not yet reviewed','provisional':'Suggested','accepted':'Reviewed'};
  function label(t){return names[t] || String(t).replace(/[_-]/g,' ').replace(/^./,function(c){return c.toUpperCase();});}
  function badge(t){return '<span class="research-badge">'+esc(label(t))+'</span>';}
  function buildToc(container){
    var seen=new Set(),headings=Array.from(container.querySelectorAll('h2,h3'));
    root.querySelector('[data-toc]').innerHTML='<ul>'+headings.map(function(heading,i){
      var id=heading.id||heading.textContent.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'')||'section-'+i;
      if(seen.has(id))id+='-'+i;seen.add(id);heading.id=id;
      return '<li'+(heading.tagName==='H3'?' class="is-subheading"':'')+'><a href="#'+encodeURIComponent(id)+'">'+esc(heading.textContent)+'</a></li>';
    }).join('')+'</ul>';
  }
  async function showHome(){
    var target=root.querySelector('[data-home]');
    try{var data=await api({action:'home'});
      target.innerHTML='<section class="research-home-section" id="start-here"><h2>Start here</h2><p>Enter through a book, follow a theme, or trace an idea through the collection. Each claim keeps its evidence and the connections that help place it.</p><nav class="research-start-links" aria-label="Ways into the collection"><a href="/zettel/?kind=glossary">Browse the glossary</a><a href="/zettel/?kind=map">Open a book map</a><a href="/zettel/?kind=theme">Follow a theme</a></nav></section>'+data.sections.map(function(section){
        return '<section class="research-home-section" id="'+esc(section.id)+'"><h2>'+esc(section.title)+'</h2><p>'+esc(section.description)+'</p><ul>'+section.results.map(function(record){return '<li>'+link(record)+'</li>';}).join('')+'</ul><a class="research-view-all" href="'+esc(section.href)+'">Browse all '+Number(section.count).toLocaleString()+' '+esc(section.title.toLowerCase())+' <span aria-hidden="true">→</span></a></section>';
      }).join('');buildToc(target);
    }catch(error){errorInto(target,error,showHome);}
  }
  function provenance(r){var fields=[['Source',label(r.origin)],['Review',label(r.status||'unreviewed')],['Model',r.raw.model],['Discovered through',r.raw.sources],['Recorded',r.raw.created_at],['Original direction',r.direction]];return '<details><summary>About this connection</summary><dl class="research-provenance">'+fields.filter(function(f){return f[1]!=null&&f[1]!=='';}).map(function(f){return '<div><dt>'+esc(f[0])+'</dt><dd>'+esc(f[1])+'</dd></div>';}).join('')+'</dl></details>';}
  function errorInto(target,error,retry){target.replaceChildren();var p=document.createElement('p'),b=document.createElement('button');p.textContent=error.message;b.type='button';b.textContent='Retry';b.onclick=retry;target.append(p,b);}
  function pager(target,offset,more,limit,callback,count){var controls=document.createElement('div');controls.className='research-pagination';if(offset){var p=document.createElement('button');p.type='button';p.textContent='Previous';p.onclick=function(){callback(Math.max(0,offset-limit));};controls.appendChild(p);}var text=document.createElement('span');text.textContent='Results '+(offset+1)+'–'+(offset+(count||limit));controls.appendChild(text);if(more){var n=document.createElement('button');n.type='button';n.textContent='Next';n.onclick=function(){callback(offset+limit);};controls.appendChild(n);}target.appendChild(controls);}
  async function showSearch(offset){
    root.classList.add('is-browsing');
    searchOffset=offset||0;var token=++generation;status.textContent='Searching…';
    try{var data=await api({action:'search',q:input.value,kind:kind.value,offset:searchOffset,limit:12});if(token!==generation)return;
      root.querySelector('[data-results-heading]').textContent=input.value?'In this thread':'From the collection';
      results.innerHTML=data.results.length?'<ol class="research-results">'+data.results.map(function(r,i){return '<li><a class="research-result-link" href="'+esc(r.href)+'"><span class="research-result-number" aria-hidden="true">'+String(data.offset+i+1).padStart(2,'0')+'</span><span><span class="research-result-kind">'+esc(label(r.kind))+'</span><span class="research-result-title">'+esc(r.title)+'</span>'+(r.excerpt?'<span class="research-result-excerpt">'+esc(r.excerpt)+'</span>':'')+'</span><span class="research-result-arrow" aria-hidden="true">↗</span></a></li>';}).join('')+'</ol>':'<p class="research-empty">Nothing here yet. Try a different word or open the search to all research.</p>';
      status.textContent=data.results.length?'Showing '+(data.offset+1)+'–'+(data.offset+data.results.length)+(input.value?' for “'+input.value+'”':''):'';if(data.results.length)pager(results,data.offset,data.more,data.limit,showSearch,data.results.length);
      if(!current&&data.results.length)showGraph(data.results[0].id);
      root.querySelector('[data-toc]').innerHTML='<ul><li><a href="#research-query">Search the collection</a></li></ul>';
    }catch(error){if(token===generation){status.textContent='';errorInto(results,error,function(){showSearch(searchOffset);});}}
  }
  async function showGraph(id){graphLabel.textContent='Finding the thread…';try{var data=await api({action:'graph',id:id});window.ZettelGraph.draw(graph,data,id);var focus=data.nodes.find(function(n){return n.id===id;});graphLabel.textContent=focus?focus.title:'';}catch(error){graphLabel.textContent='';errorInto(graph,error,function(){showGraph(id);});}}
  function evidenceMarkup(rows){return rows.map(function(e){return '<figure class="research-evidence"><blockquote>'+esc(e.text)+'</blockquote><figcaption>'+(e.book?link(e.book):'Source passage')+(e.location?' · location '+esc(e.location):'')+'</figcaption></figure>';}).join('');}
  async function loadEvidence(offset){var target=detail.querySelector('[data-evidence]');try{var data=await api({action:'evidence',id:current,offset:offset});target.innerHTML=evidenceMarkup(data.results);if(data.results.length)pager(target,data.offset,data.more,data.limit,loadEvidence,data.results.length);}catch(error){errorInto(target,error,function(){loadEvidence(offset);});}}
  async function loadRelations(offset){
    var target=detail.querySelector('[data-relations]'),filters=detail.querySelector('[data-relation-form]');
    try{var data=await api({action:'relations',id:current,offset:offset,origin:filters.elements.origin.value,predicate:filters.elements.predicate.value,history:filters.elements.history.checked?'1':'0'});
      target.innerHTML=data.results.length?'<ol class="research-relations">'+data.results.map(function(r){var a=r.source,b=r.target;if(r.direction==='b_to_a'){a=r.target;b=r.source;}var direction=r.direction==='mutual'?' · both directions':r.direction==='undirected'?' · undirected':r.direction!=='a_to_b'&&r.direction!=='b_to_a'?' · direction not yet resolved':'';var who=r.origin==='dmce'?'Similarity suggestion':r.origin==='mesh'?'Mesh · machine assessed':r.origin;return '<li>'+badge(who)+badge(r.status)+'<p>'+link(a)+' <strong>'+esc(r.predicate||'related')+'</strong> '+link(b)+esc(direction)+'</p>'+(r.rationale?'<p>'+esc(r.rationale)+'</p>':'')+provenance(r)+'</li>';}).join('')+'</ol>':'<p class="research-empty">No connections match this selection.</p>';
      if(data.results.length)pager(target,data.offset,data.more,data.limit,loadRelations,data.results.length);
    }catch(error){errorInto(target,error,function(){loadRelations(offset);});}
  }
  function canvasMarkup(canvas){
    if(!canvas || !canvas.nodes || !canvas.nodes.length)return '';
    var nodes=new Map(canvas.nodes.map(function(n){return [n.id,n];})),xs=canvas.nodes.map(function(n){return n.x||0;}),ys=canvas.nodes.map(function(n){return n.y||0;});
    var minX=Math.min.apply(null,xs)-40,minY=Math.min.apply(null,ys)-40,maxX=Math.max.apply(null,canvas.nodes.map(function(n){return (n.x||0)+(n.width||250);}))+40,maxY=Math.max.apply(null,canvas.nodes.map(function(n){return (n.y||0)+(n.height||100);}))+40;
    var lines=(canvas.edges||[]).map(function(e){var a=nodes.get(e.fromNode),b=nodes.get(e.toNode);if(!a||!b)return '';var x1=(a.x||0)+(a.width||250)/2,y1=(a.y||0)+(a.height||100)/2,x2=(b.x||0)+(b.width||250)/2,y2=(b.y||0)+(b.height||100)/2;return '<g><line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"/><text x="'+((x1+x2)/2)+'" y="'+((y1+y2)/2)+'">'+esc(e.label||'')+'</text></g>';}).join('');
    return '<section class="research-canvas"><h2>Original canvas</h2><p>Open a node to read it and follow its connections. The original file is available below.</p><svg role="img" aria-label="Canvas with its original node positions" viewBox="'+[minX,minY,maxX-minX,maxY-minY].join(' ')+'">'+lines+canvas.nodes.map(function(n){return '<a href="'+esc(n.href)+'"><rect x="'+(n.x||0)+'" y="'+(n.y||0)+'" width="'+(n.width||250)+'" height="'+(n.height||100)+'" rx="8"/><text x="'+((n.x||0)+12)+'" y="'+((n.y||0)+28)+'">'+esc((n.label||n.text||n.file||n.url||n.id).slice(0,65))+'</text><title>'+esc(n.label||n.text||n.file||n.id)+'</title></a>';}).join('')+'</svg><ul>'+canvas.nodes.map(function(n){return '<li><a href="'+esc(n.href)+'">'+esc((n.label||n.text||n.file||n.url||n.id).slice(0,160))+'</a></li>';}).join('')+'</ul></section>';
  }
  async function showDetail(id){
    root.classList.add('is-detail');
    detail.innerHTML='<p>Loading record…</p>';
    try{var data=await api({action:'detail',id:id});if(data.kind==='reference'&&data.referenceCandidates.length===1){location.replace(data.referenceCandidates[0].href);return;}document.title=data.title+' — Jamal Awil';var c=data.citation||{};
      detail.innerHTML='<article><header>'+badge(data.kind)+(data.status?badge(data.status):'')+'<h1>'+esc(data.title)+'</h1><p><a href="/zettel/">← All research</a></p></header>'+(c.citekey?'<p class="research-citation">'+esc(c.citekey)+(c.location?' · location '+esc(c.location):'')+'</p>':'')+(c.source_url?'<p><a href="'+esc(c.source_url)+'" rel="noopener noreferrer">Original source ↗</a></p>':'')+(data.attachment?'<p class="research-download"><a href="'+esc(data.attachment.href)+'">Download original · '+esc(data.attachment.filename)+'</a> <span>'+Number(data.attachment.bytes/1024/1024).toFixed(2)+' MB</span></p>':'')+canvasMarkup(data.canvas)+'<div class="research-prose">'+data.html+'</div>'+(data.sourcePassage?'<details class="research-properties"><summary>Original passage record</summary><pre>'+esc(JSON.stringify(data.sourcePassage,null,2))+'</pre></details>':'')+(data.claimProvenance?'<details class="research-properties"><summary>Claim provenance</summary><pre>'+esc(JSON.stringify(data.claimProvenance,null,2))+'</pre></details>':'')+(data.properties&&Object.keys(data.properties).length?'<details class="research-properties"><summary>Note properties</summary><pre>'+esc(JSON.stringify(data.properties,null,2))+'</pre></details>':'')+(data.referenceCandidates.length?'<p>This reference has several possible matches:</p><ul>'+data.referenceCandidates.map(function(r){return '<li>'+link(r)+'</li>';}).join('')+'</ul>':'')+(data.kind==='reference'?'<p class="research-citation">Original reference retained for reconciliation. Search the collection to identify its source.</p>':'')+(data.evidenceCount?'<section><h2>Source passages ('+data.evidenceCount+')</h2><div data-evidence>'+evidenceMarkup(data.evidence)+'</div></section>':'')+'<section><h2>Relationships</h2><form data-relation-form class="research-filters"><label>Source <select name="origin"><option value="">All sources</option><option value="distiller">Distiller</option><option value="mesh">Knowledge mesh</option><option value="dmce">Similarity connections</option><option value="wikilink">Authored links</option><option value="canvas">Canvas connections</option><option value="note-property">Note properties</option><option value="source-evidence">Source evidence</option><option value="research-record">Research records</option><option value="entity-mention">Concept mentions</option><option value="passage-source">Passage sources</option></select></label><label>Relationship <select name="predicate"><option value="">All relationships</option>'+['corroborates','contradicts','qualifies','complicates','extends','expands','illuminates','demonstrates','exemplifies','responds_to','responds-to','similar','links-to','none'].map(function(p){return '<option>'+esc(p)+'</option>';}).join('')+'</select></label><label><input type="checkbox" name="history"> Include rejected and unrelated assessments</label><button>Apply</button></form><div data-relations></div></section></article>';
      detail.querySelector('[data-relation-form]').onsubmit=function(e){e.preventDefault();loadRelations(0);};
      buildToc(detail);
      if(location.hash){try{var destination=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(destination)destination.scrollIntoView();}catch{}}
      var connected=new Map();data.relations.results.forEach(function(r){var other=r.source.id===id?r.target:r.source;if(other.id!==id)connected.set(other.id,other);});
      root.querySelector('[data-backlinks]').innerHTML=connected.size?'<ul>'+Array.from(connected.values()).slice(0,10).map(function(r){return '<li>'+link(r)+'</li>';}).join('')+'</ul>':'<p>No connections have been recorded for this note yet.</p>';
      if(data.evidenceCount>20)pager(detail.querySelector('[data-evidence]'),0,true,20,loadEvidence,20);
      await Promise.all([showGraph(id),loadRelations(0)]);
    }catch(error){errorInto(detail,error,function(){showDetail(id);});}
  }
  form.onsubmit=function(e){e.preventDefault();var params=new URLSearchParams();if(input.value)params.set('q',input.value);if(kind.value)params.set('kind',kind.value);if(current){location.href='/zettel/?'+params;return;}history.replaceState(null,'',location.pathname+(params.size?'?'+params:''));showSearch(0);};
  async function start(){
    try{var overview=await api({action:'overview'}),total=overview.counts.reduce(function(n,r){return n+Number(r.count);},0);root.querySelector('[data-counts]').innerHTML='<span><strong>'+total.toLocaleString()+'</strong> entries in the collection</span><span>'+Number(overview.coverage && overview.coverage.searchable_files || 0).toLocaleString()+' vault files indexed · '+Number(overview.coverage && overview.coverage.downloadable_files || 0).toLocaleString()+' originals available</span>';kind.replaceChildren();var all=document.createElement('option');all.value='';all.textContent='All research';kind.appendChild(all);overview.counts.forEach(function(r){var o=document.createElement('option');o.value=r.kind;o.textContent=label(r.kind)+' · '+Number(r.count).toLocaleString();kind.appendChild(o);var badge=document.querySelector('[data-kind-count="'+r.kind+'"]');if(badge)badge.textContent=Number(r.count).toLocaleString();});kind.value=initial.get('kind')||'';
      document.querySelectorAll('[data-browse-kind]').forEach(function(anchor){if(anchor.dataset.browseKind===kind.value)anchor.setAttribute('aria-current','page');});
      if(current)await showDetail(current);
      else if(initial.has('reference')){var reference=initial.get('reference'),resolved=await api({action:'resolve',reference:reference});if(resolved.results.length===1){location.replace(resolved.results[0].href+(initial.get('anchor')?'#'+encodeURIComponent(initial.get('anchor')):''));return;}input.value=reference;detail.innerHTML='<h2>'+esc(reference)+'</h2>'+(resolved.results.length?'<ul>'+resolved.results.map(function(r){return '<li>'+link(r)+'</li>';}).join('')+'</ul>':'<p>Search the collection for this source reference.</p>');}
      if(!current){if(initial.has('q')||initial.has('kind')||initial.has('reference'))await showSearch(0);else{await showHome();if(overview.first)showGraph(overview.first.id);}}
    }catch(error){errorInto(root.querySelector('[data-counts]'),error,start);}
  }
  start();
})();
