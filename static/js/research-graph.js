(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (text != null) node.textContent = text;
    return node;
  }
  function seed(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0) / 4294967295;
  }
  function layout(nodes, edges, current) {
    var points = new Map();
    nodes.forEach(function (n) {
      points.set(n.id, {x: 100 + seed(n.id) * 500, y: 65 + seed(n.id + 'y') * 310});
    });
    // Settle once, deterministically. Points never move while reading or clicking.
    for (var step = 0; step < 150; step++) {
      var forces = new Map();
      nodes.forEach(function (n) { var p = points.get(n.id); forces.set(n.id, {x: (350-p.x)*.003, y: (220-p.y)*.003}); });
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = points.get(nodes[i].id), b = points.get(nodes[j].id);
          var dx = a.x-b.x, dy = a.y-b.y, dist = Math.sqrt(dx*dx+dy*dy) || 1;
          var force = 400 / (dist*dist+30);
          var fa = forces.get(nodes[i].id), fb = forces.get(nodes[j].id);
          fa.x += dx/dist*force; fa.y += dy/dist*force;
          fb.x -= dx/dist*force; fb.y -= dy/dist*force;
        }
      }
      edges.forEach(function (edge) {
        var a = points.get(edge.source), b = points.get(edge.target);
        if (!a || !b || edge.source === edge.target) return;
        var dx = b.x-a.x, dy = b.y-a.y, distance = Math.sqrt(dx*dx+dy*dy) || 1;
        var force = (distance-100)*.009;
        forces.get(edge.source).x += dx/distance*force;
        forces.get(edge.source).y += dy/distance*force;
        forces.get(edge.target).x -= dx/distance*force;
        forces.get(edge.target).y -= dy/distance*force;
      });
      nodes.forEach(function (node) {
        var p = points.get(node.id), force = forces.get(node.id);
        if (node.id === current) {p.x=350;p.y=220;return;}
        p.x = Math.max(40,Math.min(660,p.x+Math.max(-5,Math.min(5,force.x))));
        p.y = Math.max(40,Math.min(400,p.y+Math.max(-5,Math.min(5,force.y))));
      });
    }
    // Fit the settled constellation to a generous, balanced frame.
    var xs = Array.from(points.values()).map(function(p){return p.x;});
    var ys = Array.from(points.values()).map(function(p){return p.y;});
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    var scale=Math.min(540/Math.max(1,maxX-minX),310/Math.max(1,maxY-minY),2);
    var cx=(minX+maxX)/2,cy=(minY+maxY)/2;
    points.forEach(function(p){p.x=350+(p.x-cx)*scale;p.y=220+(p.y-cy)*scale;});
    return points;
  }
  function draw(container, graph, current) {
    container.replaceChildren();
    if (!graph.nodes || !graph.nodes.length) return;
    var nodes = graph.nodes.slice().sort(function(a,b){return a.id.localeCompare(b.id);});
    var byPair = new Map();
    (graph.edges || []).forEach(function(edge) {
      var key=[edge.source,edge.target].sort().join('|');
      if(!byPair.has(key)) byPair.set(key,edge);
    });
    var edges=Array.from(byPair.values()),points=layout(nodes,edges,current);
    var svg=el('svg',{viewBox:'0 0 700 440',role:'group','aria-label':'Ideas and their connections. Select a point to read.'});
    var viewport=el('g');svg.appendChild(viewport);
    edges.forEach(function(edge){
      var a=points.get(edge.source),b=points.get(edge.target);
      if(!a||!b)return;
      var line=el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,'class':'research-edge'});
      if(edge.origin==='dmce')line.setAttribute('stroke-dasharray','2 4');
      line.appendChild(el('title',{},[edge.predicate,edge.direction,edge.status].filter(Boolean).join(' · ')));
      viewport.appendChild(line);
    });
    nodes.forEach(function(node){
      var p=points.get(node.id);
      var anchor=el('a',{href:node.href,'aria-label':node.title,'class':'research-node'+(node.id===current?' is-current':''),tabindex:'0'});
      anchor.appendChild(el('title',{},node.title));
      anchor.appendChild(el('circle',{cx:p.x,cy:p.y,r:18,'class':'research-node-hit'}));
      anchor.appendChild(el('circle',{cx:p.x,cy:p.y,r:node.id===current?7:4.5,'class':'research-node-dot'}));
      anchor.appendChild(el('text',{x:p.x,y:p.y-16,'text-anchor':'middle','class':'research-node-label'},node.title.length>42?node.title.slice(0,39)+'…':node.title));
      viewport.appendChild(anchor);
    });
    var toolbar=document.createElement('div');toolbar.className='research-graph-tools';
    var zoom=1,dx=0,dy=0;
    function transform(){viewport.setAttribute('transform','translate('+dx+' '+dy+') translate(350 220) scale('+zoom+') translate(-350 -220)');}
    [
      ['Zoom in',1.25,'<path d="M6 1v10M1 6h10"/>'],
      ['Zoom out',.8,'<path d="M1 6h10"/>'],
      ['Reset view',0,'<path d="M1 4V1h3M8 1h3v3M11 8v3H8M4 11H1V8"/>']
    ].forEach(function(control){
      var button=document.createElement('button');button.type='button';button.setAttribute('aria-label',control[0]);button.title=control[0];
      button.innerHTML='<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">'+control[2]+'</svg>';
      button.onclick=function(){if(!control[1]){zoom=1;dx=dy=0;}else zoom=Math.max(.4,Math.min(4,zoom*control[1]));transform();};toolbar.appendChild(button);
    });
    var drag;
    svg.addEventListener('pointerdown',function(event){if(event.target.closest('a'))return;drag={x:event.clientX,y:event.clientY,dx:dx,dy:dy};svg.setPointerCapture(event.pointerId);});
    svg.addEventListener('pointermove',function(event){if(!drag)return;var rect=svg.getBoundingClientRect();dx=drag.dx+(event.clientX-drag.x)*700/rect.width;dy=drag.dy+(event.clientY-drag.y)*440/rect.height;transform();});
    svg.addEventListener('pointerup',function(){drag=null;});svg.addEventListener('pointercancel',function(){drag=null;});
    var details=document.createElement('details');details.className='research-graph-list';
    var summary=document.createElement('summary');summary.textContent='Browse these '+nodes.length+' connections';details.appendChild(summary);
    var list=document.createElement('ul');nodes.forEach(function(node){var li=document.createElement('li'),a=document.createElement('a');a.href=node.href;a.textContent=node.title;li.appendChild(a);list.appendChild(li);});details.appendChild(list);
    container.append(toolbar,svg,details);
  }
  window.ZettelGraph={draw:draw};
})();
