(function () {
  var container = document.getElementById("zettel-graph");
  if (!container) return;

  var dataEl = document.getElementById("zettel-graph-data");
  if (!dataEl) return;

  var graph;
  try { graph = JSON.parse(dataEl.textContent); } catch (e) { return; }
  if (!graph || !graph.nodes || !graph.nodes.length) return;

  var W = container.offsetWidth || 220;
  var H = container.offsetHeight || 220;
  var dpr = window.devicePixelRatio || 1;
  var currentId = container.dataset.current || null;

  var canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  container.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Build node map and connectivity counts
  var nodeById = {};
  var connectivity = {};
  graph.nodes.forEach(function (n) { nodeById[n.id] = n; });
  graph.edges.forEach(function (e) {
    connectivity[e.source] = (connectivity[e.source] || 0) + 1;
    connectivity[e.target] = (connectivity[e.target] || 0) + 1;
  });

  // Filter edges to only valid (both nodes exist)
  var edges = graph.edges.filter(function (e) { return nodeById[e.source] && nodeById[e.target]; });

  // Initialise nodes with random positions near center
  var nodes = graph.nodes.map(function (n) {
    var angle = Math.random() * Math.PI * 2;
    var r = 30 + Math.random() * 30;
    return {
      id: n.id,
      title: n.title,
      href: n.href,
      x: W / 2 + Math.cos(angle) * r,
      y: H / 2 + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      current: n.id === currentId,
    };
  });
  var simNodes = {};
  nodes.forEach(function (n) { simNodes[n.id] = n; });

  // Force-directed simulation constants
  var REPULSION   = 1800;
  var SPRING_LEN  = Math.min(W, H) * 0.32;
  var SPRING_K    = 0.055;
  var GRAVITY     = 0.025;
  var DAMPING     = 0.82;
  var PADDING     = 18;
  var frame       = 0;
  var MAX_FRAMES  = 220;
  var rafId       = null;

  function tick() {
    // Reset forces
    nodes.forEach(function (n) { n.fx = 0; n.fy = 0; });

    // Gravity toward center
    nodes.forEach(function (n) {
      n.fx += (W / 2 - n.x) * GRAVITY;
      n.fy += (H / 2 - n.y) * GRAVITY;
    });

    // Node repulsion (O(n²), fine for small graphs)
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j];
        var dx = a.x - b.x, dy = a.y - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        var force = REPULSION / (dist * dist);
        var fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.fx += fx; a.fy += fy;
        b.fx -= fx; b.fy -= fy;
      }
    }

    // Spring attraction along edges
    edges.forEach(function (e) {
      var a = simNodes[e.source], b = simNodes[e.target];
      if (!a || !b) return;
      var dx = b.x - a.x, dy = b.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      var force = (dist - SPRING_LEN) * SPRING_K;
      var fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.fx += fx; a.fy += fy;
      b.fx -= fx; b.fy -= fy;
    });

    // Integrate + bound
    nodes.forEach(function (n) {
      n.vx = (n.vx + n.fx) * DAMPING;
      n.vy = (n.vy + n.fy) * DAMPING;
      n.x = Math.max(PADDING, Math.min(W - PADDING, n.x + n.vx));
      n.y = Math.max(PADDING, Math.min(H - PADDING, n.y + n.vy));
    });

    draw();
    frame++;
    if (frame < MAX_FRAMES) {
      rafId = requestAnimationFrame(tick);
    }
  }

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
           getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  var hovered = null;

  function draw() {
    var accent = css("--contrib-3") || "#3f9b85";
    var accentDim = css("--contrib-2") || "#8fd3bc";
    var border = css("--border") || "#e5e5e0";
    var fg = css("--fg") || "#1a1a1a";
    var bg = css("--bg") || "#fafaf8";

    ctx.clearRect(0, 0, W, H);

    // Edges
    edges.forEach(function (e) {
      var a = simNodes[e.source], b = simNodes[e.target];
      if (!a || !b) return;
      var hot = hovered === e.source || hovered === e.target;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = hot ? accent : accentDim;
      ctx.globalAlpha = hot ? 0.7 : 0.35;
      ctx.lineWidth = hot ? 1.5 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Nodes
    nodes.forEach(function (n) {
      var isHov = hovered === n.id;
      var conn  = connectivity[n.id] || 0;
      var r     = n.current ? 6 : (conn >= 3 ? 5.5 : conn >= 2 ? 5 : 4);
      if (isHov) r += 1.5;

      // Glow ring
      if (n.current || isHov) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Node fill
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      if (n.current || isHov) {
        ctx.fillStyle = accent;
        ctx.fill();
      } else {
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Hover label
      if (isHov) {
        var label = n.title.length > 34 ? n.title.slice(0, 34) + "…" : n.title;
        var fs = 10;
        ctx.font = "600 " + fs + "px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
        var tw = ctx.measureText(label).width;
        var lx = Math.max(tw / 2 + 6, Math.min(W - tw / 2 - 6, n.x));
        var ly = n.y - r - 8;
        if (ly < fs + 8) ly = n.y + r + fs + 8;

        // Pill background
        var px = 6, py = 3;
        var bx = lx - tw / 2 - px, bw = tw + px * 2;
        var by = ly - fs, bh = fs + py * 2;
        var rad = 4;
        ctx.beginPath();
        ctx.moveTo(bx + rad, by);
        ctx.lineTo(bx + bw - rad, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + rad);
        ctx.lineTo(bx + bw, by + bh - rad);
        ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - rad, by + bh);
        ctx.lineTo(bx + rad, by + bh);
        ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - rad);
        ctx.lineTo(bx, by + rad);
        ctx.quadraticCurveTo(bx, by, bx + rad, by);
        ctx.closePath();
        ctx.fillStyle = fg;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = bg;
        ctx.textAlign = "center";
        ctx.fillText(label, lx, ly + py - 1);
        ctx.textAlign = "left";
      }
    });
  }

  function nodeAt(x, y) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var dx = n.x - x, dy = n.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= 10) return n.id;
    }
    return null;
  }

  canvas.addEventListener("mousemove", function (ev) {
    var r = canvas.getBoundingClientRect();
    var hit = nodeAt(ev.clientX - r.left, ev.clientY - r.top);
    canvas.style.cursor = hit ? "pointer" : "default";
    if (hit !== hovered) {
      hovered = hit;
      draw();
    }
  });

  canvas.addEventListener("mouseleave", function () {
    if (hovered !== null) { hovered = null; draw(); }
  });

  canvas.addEventListener("click", function (ev) {
    var r = canvas.getBoundingClientRect();
    var hit = nodeAt(ev.clientX - r.left, ev.clientY - r.top);
    if (hit && simNodes[hit] && simNodes[hit].href) {
      window.location.href = simNodes[hit].href;
    }
  });

  // Restart simulation on theme change and redraw
  document.addEventListener("themechange", function () {
    if (rafId) cancelAnimationFrame(rafId);
    frame = 0;
    tick();
  });

  tick();
})();
