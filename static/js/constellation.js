/* Constellation: the whole vault as one map (every note a point, every
   connection a line), drawn with WebGL. Positions are precomputed
   (scripts/research-constellation.js); data is served gzip-compressed from
   the research asset host. Hover a point to see its note and light up its
   connections; click to open it. */
(function () {
  'use strict';
  var CATEGORY_NAMES = ['Causal relationships', 'Factual claims', 'Contrarian or surprising', 'Definitional content',
    'Craft and method', 'Connection points', 'Inspiration and speculation'];
  // Validated (dataviz validate_palette.js): same hue per category in both themes.
  var PALETTE = {
    light: ['#138f71', '#4673dd', '#ac6808', '#be478c', '#7a820e', '#935ac7', '#ca4553'],
    dark: ['#32a888', '#4874d8', '#cb7e19', '#bb4b8b', '#7a821c', '#ab75df', '#e3636c']
  };
  var EDGE_NAMES = {wikilink: 'Wikilinks', dmce: 'DMCE', distiller: 'Distiller', mesh: 'Mesh', 'note-property': 'Properties'};
  var KIND_LABEL = function (k) { return k.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); };

  function inflate(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Map data unavailable (' + r.status + ')');
      return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    });
  }
  function hex(c) { var v = parseInt(c.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function cssVar(name, fallback) { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  function toRgb(css) { var d = document.createElement('span'); d.style.color = css; document.body.appendChild(d); var m = getComputedStyle(d).color.match(/\d+(\.\d+)?/g); d.remove(); return m ? [+m[0], +m[1], +m[2]] : [26, 26, 26]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }

  function shader(gl, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(gl, vs, fs) { var p = gl.createProgram(); gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

  var VS_POINT = '#version 300 es\nin vec2 a_pos;in vec4 a_color;in float a_size;in float a_state;uniform vec2 u_center;uniform float u_scale;uniform vec2 u_view;uniform float u_dpr;uniform float u_zoomSize;uniform float u_focus;out vec4 v_color;out float v_state;' +
    'void main(){vec2 p=(a_pos-u_center)*u_scale*2.0/u_view;gl_Position=vec4(p.x,-p.y,0.0,1.0);v_state=a_state;float s=a_size*u_zoomSize;if(a_state>1.5)s*=1.35;gl_PointSize=max(1.0,s*u_dpr);v_color=a_color;}';
  var FS_POINT = '#version 300 es\nprecision mediump float;in vec4 v_color;in float v_state;uniform float u_focus;out vec4 o;' +
    'void main(){vec2 c=gl_PointCoord-0.5;float d=length(c);if(d>0.5)discard;float a=v_color.a*smoothstep(0.5,0.38,d);if(v_state<0.5)discard;if(u_focus>0.5&&v_state<1.5)a*=0.14;o=vec4(v_color.rgb*a,a);}';
  // Lines with an end on screen draw at full weight; lines only passing through fade (u_far).
  var VS_LINE = '#version 300 es\nin vec2 a_pos;uniform vec2 u_center;uniform float u_scale;uniform vec2 u_view;out float v_in;void main(){vec2 p=(a_pos-u_center)*u_scale*2.0/u_view;gl_Position=vec4(p.x,-p.y,0.0,1.0);v_in=(abs(p.x)<1.02&&abs(p.y)<1.02)?1.0:0.0;}';
  var FS_LINE = '#version 300 es\nprecision mediump float;uniform vec4 u_color;uniform float u_far;in float v_in;out vec4 o;void main(){float a=u_color.a*mix(u_far,1.0,clamp(v_in,0.0,1.0));o=vec4(u_color.rgb*a,a);}';

  function mount(root, base) {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    base = base.replace(/\/?$/, '/');
    root.innerHTML =
      '<div class="cg-search"><input type="search" placeholder="Find a note…" autocomplete="off" aria-label="Find a note on the map"><div class="cg-results" role="listbox"></div></div>' +
      '<div class="cg-controls"><label class="cg-depth"><span>Depth <b>2</b></span><input type="range" min="1" max="4" step="1" value="2" aria-label="Neighbourhood depth"></label>' +
      '<button type="button" class="cg-reset" title="Show the whole map">Reset</button><button type="button" class="cg-expand" title="Open the map full screen" aria-pressed="false">Expand</button></div>' +
      '<div class="cg-stage"><canvas role="img" aria-label="Map of every note in the vault and how they connect"></canvas><div class="cg-labels" aria-hidden="true"></div><div class="cg-tip" hidden></div><p class="cg-loading">Drawing the vault…</p></div>' +
      '<p class="cg-status" aria-live="polite"></p>' +
      '<details class="cg-key"><summary>Key &amp; filters</summary><div class="cg-legend"></div><p class="cg-key-title">Connections</p><div class="cg-edges"></div></details>' +
      '<p class="cg-links"><a href="/zettel/?kind=book">Browse by book →</a> <a href="/zettel/?kind=theme">Browse by theme →</a></p>';
    var stage = root.querySelector('.cg-stage'), canvas = root.querySelector('canvas'), tip = root.querySelector('.cg-tip'),
      status = root.querySelector('.cg-status'), labelsEl = root.querySelector('.cg-labels'), loading = root.querySelector('.cg-loading');
    var gl = canvas.getContext('webgl2', {antialias: true, premultipliedAlpha: true, alpha: true});
    if (!gl || typeof DecompressionStream === 'undefined') {
      loading.textContent = 'This browser cannot draw the map. Browse the research with the links below.';
      return;
    }
    status.textContent = 'Loading the map…';
    var F = ['positions.bin', 'categories.bin', 'kinds.bin', 'edges.bin', 'edge-types.bin'];
    Promise.all([fetch(base + 'meta.json').then(function (r) { return r.json(); })].concat(F.map(function (f) { return inflate(base + f + '.gz'); })))
      .then(function (d) { start(d[0], new Float32Array(d[1]), new Uint8Array(d[2]), new Uint8Array(d[3]), new Uint8Array(d[4]), new Uint8Array(d[5])); })
      .catch(function (e) { loading.textContent = 'The map could not be loaded. ' + e.message; status.textContent = ''; });

    function start(meta, pos, cats, kinds, edgeBytes, edgeTypes) {
      var n = meta.count, m = meta.edges;
      // Decode connections (varints: source delta, target - source).
      var edges = new Uint32Array(m * 2), p = 0, src = 0;
      function varint() { var v = 0, shift = 0, b; do { b = edgeBytes[p++]; v += (b & 127) * Math.pow(2, shift); shift += 7; } while (b & 128); return v; }
      for (var e = 0; e < m; e++) { src += varint(); edges[e * 2] = src; edges[e * 2 + 1] = src + varint(); }
      // Adjacency (for hover highlights and depth) and degree (for size).
      var degree = new Uint32Array(n); for (e = 0; e < m * 2; e++) degree[edges[e]]++;
      var offsets = new Uint32Array(n + 1); for (var i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
      var adj = new Uint32Array(m * 2), adjEdge = new Uint32Array(m * 2), fill = offsets.slice(0, n);
      for (e = 0; e < m; e++) { var a = edges[e * 2], b = edges[e * 2 + 1]; adjEdge[fill[a]] = e; adj[fill[a]++] = b; adjEdge[fill[b]] = e; adj[fill[b]++] = a; }
      var size = new Float32Array(n);
      for (i = 0; i < n; i++) size[i] = (kinds[i] === 0 ? 1.5 : 2.1) * (1 + 0.2 * Math.log2(1 + degree[i])) * (degree[i] ? 1 : 0.7);
      // Spatial grid for hit-testing.
      var bx0 = meta.bounds[0], by0 = meta.bounds[1], bw = meta.bounds[2] - bx0, bh = meta.bounds[3] - by0, G = 384;
      var cellOf = function (x, y) { var cx = Math.min(G - 1, Math.max(0, Math.floor((x - bx0) / bw * G))), cy = Math.min(G - 1, Math.max(0, Math.floor((y - by0) / bh * G))); return cy * G + cx; };
      var cellCount = new Uint32Array(G * G + 1); for (i = 0; i < n; i++) cellCount[cellOf(pos[i * 2], pos[i * 2 + 1]) + 1]++;
      for (i = 0; i < G * G; i++) cellCount[i + 1] += cellCount[i];
      var cellItems = new Uint32Array(n), cellFill = cellCount.slice(0, G * G);
      for (i = 0; i < n; i++) cellItems[cellFill[cellOf(pos[i * 2], pos[i * 2 + 1])]++] = i;

      // State: visible categories/kinds and connection types; focus set.
      var showCat = new Array(9).fill(true);          // 0-6 categories, 7 uncategorized claims, 8 other notes
      var showEdge = meta.edgeTypes.map(function () { return true; });
      var group = new Uint8Array(n);
      for (i = 0; i < n; i++) group[i] = kinds[i] !== 0 ? 8 : (cats[i] === 255 ? 7 : cats[i]);
      var state = new Uint8Array(n).fill(1);          // 0 hidden, 1 normal, 2 focused
      var focusOn = false, hover = -1, selected = -1, depth = 2;

      // GL buffers.
      var pp = program(gl, VS_POINT, FS_POINT), lp = program(gl, VS_LINE, FS_LINE);
      var vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      function attr(prog, name, data, sizeN, type, norm, usage) {
        var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, name); if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, sizeN, type, norm, 0, 0); }
        return buf;
      }
      attr(pp, 'a_pos', pos, 2, gl.FLOAT, false);
      var colors = new Uint8Array(n * 4), colorBuf = attr(pp, 'a_color', colors, 4, gl.UNSIGNED_BYTE, true, gl.DYNAMIC_DRAW);
      attr(pp, 'a_size', size, 1, gl.FLOAT, false);
      var stateF = new Float32Array(n), stateBuf = attr(pp, 'a_state', stateF, 1, gl.FLOAT, false, gl.DYNAMIC_DRAW);
      var lvao = gl.createVertexArray(); gl.bindVertexArray(lvao); attr(lp, 'a_pos', pos, 2, gl.FLOAT, false);
      var lineBuf = gl.createBuffer(), lineCount = 0, focusBuf = gl.createBuffer(), focusCount = 0;
      gl.bindVertexArray(null);

      var theme, ink, lineRgb, accent;
      function applyTheme() {
        theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        ink = toRgb(cssVar('--fg', theme === 'dark' ? '#e8e8e3' : '#1a1a1a'));
        accent = toRgb(cssVar('--accent', '#3f9b85'));
        lineRgb = ink;
        var pal = PALETTE[theme].map(hex), gray = theme === 'dark' ? [138, 138, 133] : [150, 148, 140];
        for (var i = 0; i < n; i++) {
          var g = group[i], c = g === 8 ? ink : g === 7 ? gray : pal[g];
          colors[i * 4] = c[0]; colors[i * 4 + 1] = c[1]; colors[i * 4 + 2] = c[2]; colors[i * 4 + 3] = g === 8 ? 235 : 215;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf); gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
        legend(); draw();
      }

      function rebuildLines() {
        var mask = 0; showEdge.forEach(function (on, t) { if (on) mask |= 1 << t; });
        var idx = new Uint32Array(m * 2), k = 0;
        for (var e = 0; e < m; e++) { var a = edges[e * 2], b = edges[e * 2 + 1]; if ((edgeTypes[e] & mask) && state[a] && state[b]) { idx[k++] = a; idx[k++] = b; } }
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.subarray(0, k), gl.STATIC_DRAW); lineCount = k;
      }
      function visibleNode(i) { return showCat[group[i]]; }
      function setFocus(nodes) {
        // nodes: array of indices to light up (or null for none)
        focusOn = !!nodes;
        for (var i = 0; i < n; i++) state[i] = visibleNode(i) ? 1 : 0;
        var idx = [];
        if (nodes) {
          var inSet = new Uint8Array(n); nodes.forEach(function (i) { if (state[i]) { state[i] = 2; inSet[i] = 1; } });
          var mask = 0; showEdge.forEach(function (on, t) { if (on) mask |= 1 << t; });
          nodes.forEach(function (i) { for (var k = offsets[i]; k < offsets[i + 1]; k++) { var j = adj[k]; if (inSet[j] && i < j && (edgeTypes[adjEdge[k]] & mask)) idx.push(i, j); } });
        }
        for (i = 0; i < n; i++) stateF[i] = state[i];
        gl.bindBuffer(gl.ARRAY_BUFFER, stateBuf); gl.bufferData(gl.ARRAY_BUFFER, stateF, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, focusBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.DYNAMIC_DRAW); focusCount = idx.length;
        draw();
      }
      function neighbourhood(start, depthN) {
        var seen = new Map([[start, 0]]), frontier = [start], mask = 0;
        showEdge.forEach(function (on, t) { if (on) mask |= 1 << t; });
        for (var d = 1; d <= depthN && frontier.length; d++) { var next = [];
          frontier.forEach(function (i) { for (var k = offsets[i]; k < offsets[i + 1]; k++) { var j = adj[k];
            if (!seen.has(j) && visibleNode(j) && (edgeTypes[adjEdge[k]] & mask)) { seen.set(j, d); next.push(j); } } });
          frontier = next; if (seen.size > 60000) break; }
        return Array.from(seen.keys());
      }
      function refocus() {
        if (hover >= 0) setFocus(neighbourhood(hover, 1));
        else if (selected >= 0) setFocus(neighbourhood(selected, depth));
        else setFocus(null);
      }

      // Camera.
      var view = {cx: bx0 + bw / 2, cy: by0 + bh / 2, scale: 1}, W = 1, H = 1, dpr = 1;
      function fit() { view.cx = bx0 + bw / 2; view.cy = by0 + bh / 2; view.scale = Math.min(W / bw, H / bh) * 0.92; }
      function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2); W = stage.clientWidth; H = stage.clientHeight;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
        draw();
      }
      var pending = false;
      function draw() { if (!pending) { pending = true; requestAnimationFrame(render); } }
      function render() {
        pending = false;
        gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        var fitScale = Math.min(W / bw, H / bh) * 0.92, zoom = view.scale / fitScale;
        // Lines: faint at the whole-map view, clearer as you zoom in; focused lines drawn on top.
        gl.useProgram(lp); gl.bindVertexArray(lvao);
        gl.uniform2f(gl.getUniformLocation(lp, 'u_center'), view.cx, view.cy); gl.uniform1f(gl.getUniformLocation(lp, 'u_scale'), view.scale);
        gl.uniform2f(gl.getUniformLocation(lp, 'u_view'), W, H);
        var base = (theme === 'dark' ? 0.034 : 0.026) * Math.min(3, Math.pow(Math.max(1, zoom), 0.35)) * (focusOn ? 0.45 : 1);
        gl.uniform1f(gl.getUniformLocation(lp, 'u_far'), zoom < 2 ? 1 : Math.max(0.06, 1 / zoom));
        gl.uniform4f(gl.getUniformLocation(lp, 'u_color'), lineRgb[0] / 255, lineRgb[1] / 255, lineRgb[2] / 255, base);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, lineBuf); gl.drawElements(gl.LINES, lineCount, gl.UNSIGNED_INT, 0);
        if (focusOn && focusCount) {
          gl.uniform1f(gl.getUniformLocation(lp, 'u_far'), 1);
          gl.uniform4f(gl.getUniformLocation(lp, 'u_color'), accent[0] / 255, accent[1] / 255, accent[2] / 255, Math.min(0.9, 0.35 + 0.1 * Math.sqrt(zoom)));
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, focusBuf); gl.drawElements(gl.LINES, focusCount, gl.UNSIGNED_INT, 0);
        }
        gl.useProgram(pp); gl.bindVertexArray(vao);
        gl.uniform2f(gl.getUniformLocation(pp, 'u_center'), view.cx, view.cy); gl.uniform1f(gl.getUniformLocation(pp, 'u_scale'), view.scale);
        gl.uniform2f(gl.getUniformLocation(pp, 'u_view'), W, H); gl.uniform1f(gl.getUniformLocation(pp, 'u_dpr'), dpr);
        gl.uniform1f(gl.getUniformLocation(pp, 'u_zoomSize'), Math.min(5, 0.6 + 0.3 * Math.sqrt(zoom)));
        gl.uniform1f(gl.getUniformLocation(pp, 'u_focus'), focusOn ? 1 : 0);
        gl.drawArrays(gl.POINTS, 0, n);
        placeLabels(zoom);
      }

      // Titles (16 chunks, fetched in the background; a hovered note's chunk first).
      var chunk = meta.labelChunk, labels = new Array(n), chunkState = [];
      function loadChunk(c) {
        if (chunkState[c]) return chunkState[c];
        chunkState[c] = inflate(base + 'labels-' + c + '.json.gz').then(function (buf) {
          var rows = JSON.parse(new TextDecoder().decode(buf)); for (var i = 0; i < rows.length; i++) labels[c * chunk + i] = rows[i];
        }).catch(function () { chunkState[c] = null; });
        return chunkState[c];
      }
      function loadAll() { var all = []; for (var c = 0; c * chunk < n; c++) all.push(loadChunk(c)); return Promise.all(all); }
      function label(i) { return labels[i] ? labels[i][0] : null; }
      function hrefOf(i) { var l = labels[i]; return l ? (l[2] || '/zettel/research/' + l[1] + '/') : null; }
      function withLabel(i, fn) { if (labels[i]) fn(); else loadChunk(Math.floor(i / chunk)).then(fn); }

      function describe(i) {
        return (kinds[i] === 0 ? (cats[i] === 255 ? 'Claim' : CATEGORY_NAMES[cats[i]]) : KIND_LABEL(meta.kinds[kinds[i]])) +
          ' · ' + degree[i].toLocaleString() + ' connection' + (degree[i] === 1 ? '' : 's');
      }
      var labelPool = [];
      function placeLabels(zoom) {
        var shown = 0;
        if (zoom > 4) {
          var x0 = view.cx - W / 2 / view.scale, x1 = view.cx + W / 2 / view.scale, y0 = view.cy - H / 2 / view.scale, y1 = view.cy + H / 2 / view.scale;
          var c0 = cellOf(x0, y0), c1 = cellOf(x1, y1), gx0 = c0 % G, gy0 = Math.floor(c0 / G), gx1 = c1 % G, gy1 = Math.floor(c1 / G), list = [];
          for (var gy = gy0; gy <= gy1 && list.length <= 4000; gy++) for (var gx = gx0; gx <= gx1 && list.length <= 4000; gx++) {
            var cell = gy * G + gx; for (var k = cellCount[cell]; k < cellCount[cell + 1]; k++) { var i = cellItems[k]; if (state[i] && pos[i * 2] >= x0 && pos[i * 2] <= x1 && pos[i * 2 + 1] >= y0 && pos[i * 2 + 1] <= y1) list.push(i); }
          }
          if (list.length <= 4000) {
            list.sort(function (a, b) { return (state[b] === 2) - (state[a] === 2) || degree[b] - degree[a]; });
            list = list.slice(0, 30); if (hover >= 0 && list.indexOf(hover) < 0) list.push(hover);
            list.forEach(function (i) {
              var t = label(i); if (!t) { loadChunk(Math.floor(i / chunk)).then(draw); return; }
              var el = labelPool[shown] || (labelPool[shown] = labelsEl.appendChild(document.createElement('span')));
              el.textContent = t.length > 60 ? t.slice(0, 58) + '…' : t; el.hidden = false;
              el.style.transform = 'translate(' + Math.round((pos[i * 2] - view.cx) * view.scale + W / 2 + 6) + 'px,' + Math.round((pos[i * 2 + 1] - view.cy) * view.scale + H / 2 - 7) + 'px)';
              el.className = state[i] === 2 || !focusOn ? '' : 'is-dim'; shown++;
            });
          }
        }
        for (var j = shown; j < labelPool.length; j++) labelPool[j].hidden = true;
      }

      function pick(clientX, clientY) {
        var r = canvas.getBoundingClientRect(), x = view.cx + (clientX - r.left - W / 2) / view.scale, y = view.cy + (clientY - r.top - H / 2) / view.scale;
        var radius = Math.max(6, 4 * Math.min(4, 0.55 + 0.35 * Math.sqrt(view.scale / (Math.min(W / bw, H / bh) * 0.92)))) / view.scale;
        var c0 = cellOf(x - radius, y - radius), c1 = cellOf(x + radius, y + radius), best = -1, bestD = radius * radius;
        for (var gy = Math.floor(c0 / G); gy <= Math.floor(c1 / G); gy++) for (var gx = c0 % G; gx <= c1 % G; gx++) {
          var cell = gy * G + gx; for (var k = cellCount[cell]; k < cellCount[cell + 1]; k++) { var i = cellItems[k]; if (!state[i]) continue;
            var dx = pos[i * 2] - x, dy = pos[i * 2 + 1] - y, d = dx * dx + dy * dy; if (d < bestD || (d === bestD && kinds[i] !== 0)) { bestD = d; best = i; } }
        }
        return best;
      }
      function showTip(i, clientX, clientY) {
        var r = stage.getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = Math.min(clientX - r.left + 14, r.width - 230) + 'px'; tip.style.top = (clientY - r.top + 14) + 'px';
        withLabel(i, function () { if (hover !== i) return; tip.innerHTML = '<strong>' + esc(label(i) || 'Untitled') + '</strong><span>' + esc(describe(i)) + '</span><em>Click to open</em>'; });
        if (!labels[i]) tip.innerHTML = '<span>' + esc(describe(i)) + '</span>';
        status.textContent = describe(i);
      }

      // Pointer: drag to pan, wheel/pinch to zoom, hover to highlight, click to open.
      var drag = null, moved = false, touches = new Map();
      canvas.addEventListener('pointerdown', function (ev) { canvas.setPointerCapture(ev.pointerId); touches.set(ev.pointerId, [ev.clientX, ev.clientY]); drag = {x: ev.clientX, y: ev.clientY, cx: view.cx, cy: view.cy}; moved = false; });
      canvas.addEventListener('pointermove', function (ev) {
        if (touches.size === 2 && touches.has(ev.pointerId)) {
          var pts = Array.from(touches.values()), before = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
          touches.set(ev.pointerId, [ev.clientX, ev.clientY]); pts = Array.from(touches.values());
          var after = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]); if (before > 0) zoomAt((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2, after / before); moved = true; return;
        }
        if (drag && touches.has(ev.pointerId)) {
          var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          if (moved) { view.cx = drag.cx - dx / view.scale; view.cy = drag.cy - dy / view.scale; tip.hidden = true; draw(); return; }
        }
        var i = pick(ev.clientX, ev.clientY);
        if (i !== hover) { hover = i; canvas.style.cursor = i >= 0 ? 'pointer' : 'grab'; refocus(); if (i < 0) { tip.hidden = true; status.textContent = summary; } }
        if (i >= 0) showTip(i, ev.clientX, ev.clientY);
      });
      function release(ev) { touches.delete(ev.pointerId); if (!touches.size) { var wasDrag = moved; drag = null;
        if (!wasDrag && ev.type === 'pointerup') { var i = pick(ev.clientX, ev.clientY); if (i >= 0) withLabel(i, function () { var h = hrefOf(i); if (h) location.href = h; }); } } }
      canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
      canvas.addEventListener('pointerleave', function () { if (hover >= 0) { hover = -1; refocus(); } tip.hidden = true; status.textContent = summary; });
      function zoomAt(clientX, clientY, factor) {
        var r = canvas.getBoundingClientRect(), fitScale = Math.min(W / bw, H / bh) * 0.92;
        var mx = clientX - r.left - W / 2, my = clientY - r.top - H / 2, wx = view.cx + mx / view.scale, wy = view.cy + my / view.scale;
        view.scale = Math.min(fitScale * 4000, Math.max(fitScale * 0.5, view.scale * factor));
        view.cx = wx - mx / view.scale; view.cy = wy - my / view.scale; draw();
      }
      canvas.addEventListener('wheel', function (ev) { ev.preventDefault(); zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0015))); }, {passive: false});
      function flyTo(i) {
        var fitScale = Math.min(W / bw, H / bh) * 0.92, from = {cx: view.cx, cy: view.cy, scale: view.scale}, to = {cx: pos[i * 2], cy: pos[i * 2 + 1], scale: Math.max(view.scale, fitScale * 60)}, t0 = performance.now();
        (function step(t) { var k = Math.min(1, (t - t0) / 700), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          view.cx = from.cx + (to.cx - from.cx) * e; view.cy = from.cy + (to.cy - from.cy) * e; view.scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * e); draw(); if (k < 1) requestAnimationFrame(step); })(t0);
      }

      // Controls.
      var depthInput = root.querySelector('.cg-depth input'), depthOut = root.querySelector('.cg-depth b');
      depthInput.addEventListener('input', function () { depth = +depthInput.value; depthOut.textContent = depth; refocus(); });
      root.querySelector('.cg-reset').addEventListener('click', function () { selected = -1; input.value = ''; fit(); refocus(); });
      var expand = root.querySelector('.cg-expand');
      function setExpanded(on) { root.classList.toggle('is-expanded', on); expand.setAttribute('aria-pressed', String(on)); expand.textContent = on ? 'Close' : 'Expand'; root.querySelector('.cg-key').open = on; document.documentElement.classList.toggle('cg-open', on); requestAnimationFrame(function () { var s = view.scale / (Math.min(W / bw, H / bh) || 1); resize(); view.scale = s * Math.min(W / bw, H / bh); draw(); }); }
      expand.addEventListener('click', function () { setExpanded(!root.classList.contains('is-expanded')); });
      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && root.classList.contains('is-expanded')) setExpanded(false); });
      var input = root.querySelector('.cg-search input'), results = root.querySelector('.cg-results');
      input.addEventListener('focus', loadAll);
      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase(); results.innerHTML = '';
        if (q.length < 3) return;
        loadAll().then(function () {
          if (input.value.trim().toLowerCase() !== q) return;
          var hits = [];
          for (var i = 0; i < n && hits.length < 12; i++) { var t = label(i); if (t && t.toLowerCase().indexOf(q) >= 0) hits.push(i); }
          results.innerHTML = hits.length ? '' : '<p class="cg-none">No note with that title.</p>';
          hits.forEach(function (i) {
            var b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'option');
            b.innerHTML = '<span>' + esc(label(i)) + '</span><small>' + esc(describe(i)) + '</small>';
            b.addEventListener('click', function () { selected = i; results.innerHTML = ''; input.value = label(i); flyTo(i); refocus(); status.textContent = label(i); });
            results.appendChild(b);
          });
        });
      });

      function legend() {
        var pal = PALETTE[theme], el = root.querySelector('.cg-legend'), rows = '';
        meta.categoryCounts.forEach(function (count, c) { rows += chip(c, pal[c], CATEGORY_NAMES[c] + ' claims', count); });
        rows += chip(7, theme === 'dark' ? '#8a8a85' : '#96948c', 'Uncategorized claims', meta.categoryCounts.length ? meta.kindCounts[0] - meta.categoryCounts.reduce(function (a, b) { return a + b; }, 0) : 0);
        rows += chip(8, 'rgb(' + ink.join(',') + ')', 'Books, maps, themes & other notes', n - meta.kindCounts[0], true);
        el.innerHTML = rows;
        el.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { var g = +b.dataset.g; showCat[g] = !showCat[g]; b.setAttribute('aria-pressed', String(showCat[g])); refocus(); rebuildLines(); draw(); }); });
        var ed = root.querySelector('.cg-edges'); ed.innerHTML = meta.edgeTypes.map(function (t, k) {
          return '<button type="button" data-e="' + k + '" aria-pressed="' + showEdge[k] + '"><i class="cg-line"></i>' + esc(EDGE_NAMES[t] || t) + ' <small>' + meta.edgeTypeCounts[k].toLocaleString() + '</small></button>'; }).join('');
        ed.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { var k = +b.dataset.e; showEdge[k] = !showEdge[k]; b.setAttribute('aria-pressed', String(showEdge[k])); rebuildLines(); refocus(); }); });
      }
      function chip(g, color, name, count, big) {
        return '<button type="button" data-g="' + g + '" aria-pressed="' + showCat[g] + '"><i style="background:' + color + (big ? ';width:.7rem;height:.7rem' : '') + '"></i>' + esc(name) + ' <small>' + count.toLocaleString() + '</small></button>';
      }

      var summary = n.toLocaleString() + ' notes · ' + m.toLocaleString() + ' connections';
      status.textContent = summary; loading.remove();
      new ResizeObserver(resize).observe(stage);
      new MutationObserver(applyTheme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
      resize(); fit(); applyTheme(); rebuildLines(); setFocus(null);
      // Fetch titles in the background so hover, labels and search are instant.
      (function next(c) { if (c * chunk < n) loadChunk(c).then(function () { setTimeout(function () { next(c + 1); }, 150); }); })(0);
    }
  }
  window.Constellation = {mount: mount};
})();
