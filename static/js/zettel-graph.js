(function () {
  var container = document.getElementById("zettel-graph");
  if (!container) return;

  var dataEl = document.getElementById("zettel-graph-data");
  if (!dataEl) return;

  var graph;
  try {
    graph = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }
  if (!graph || !graph.nodes || !graph.nodes.length) return;

  var SIZE = 220;
  var currentId = container.dataset.current || null;

  var canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  container.appendChild(canvas);
  var ctx = canvas.getContext("2d");

  function colorVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
      getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  // Deterministic radial layout — no physics simulation. If we have a "current" node
  // (a zettel detail page), center it and ring its direct connections evenly around it.
  // Otherwise (the /zettel/ index, with no single current node) lay every node out
  // evenly around a circle and draw edges as chords.
  function computeLayout() {
    var cx = SIZE / 2,
      cy = SIZE / 2;
    var positions = {};
    var nodesById = {};
    graph.nodes.forEach(function (n) {
      nodesById[n.id] = n;
    });

    if (currentId && nodesById[currentId]) {
      var neighborIds = [];
      var seen = {};
      graph.edges.forEach(function (e) {
        if (e.source === currentId && !seen[e.target]) {
          seen[e.target] = true;
          neighborIds.push(e.target);
        }
        if (e.target === currentId && !seen[e.source]) {
          seen[e.source] = true;
          neighborIds.push(e.source);
        }
      });
      positions[currentId] = { x: cx, y: cy, node: nodesById[currentId], current: true };
      var r = SIZE * 0.38;
      neighborIds.forEach(function (id, i) {
        var angle = (i / Math.max(neighborIds.length, 1)) * Math.PI * 2 - Math.PI / 2;
        positions[id] = {
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          node: nodesById[id],
        };
      });
      var visibleIds = [currentId].concat(neighborIds);
      var visibleEdges = graph.edges.filter(function (e) {
        return positions[e.source] && positions[e.target];
      });
      return { positions: positions, edges: visibleEdges, nodeIds: visibleIds };
    }

    var ids = graph.nodes.map(function (n) {
      return n.id;
    });
    var r2 = SIZE * 0.4;
    ids.forEach(function (id, i) {
      var angle = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
      positions[id] = {
        x: cx + r2 * Math.cos(angle),
        y: cy + r2 * Math.sin(angle),
        node: nodesById[id],
      };
    });
    return { positions: positions, edges: graph.edges, nodeIds: ids };
  }

  var layout = computeLayout();
  var hovered = null;

  function draw() {
    var border = colorVar("--border") || "#e5e5e0";
    var accent = colorVar("--accent") || "#3f9b85";
    var fg = colorVar("--fg") || "#1a1a1a";

    ctx.clearRect(0, 0, SIZE, SIZE);

    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    layout.edges.forEach(function (e) {
      var a = layout.positions[e.source],
        b = layout.positions[e.target];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    layout.nodeIds.forEach(function (id) {
      var p = layout.positions[id];
      if (!p) return;
      var radius = p.current ? 6 : hovered === id ? 5 : 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      if (p.current || hovered === id) {
        ctx.fillStyle = accent;
        ctx.fill();
      } else {
        ctx.fillStyle = "transparent";
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = accent;
        ctx.fill();
        ctx.stroke();
      }
      if (hovered === id) {
        ctx.fillStyle = fg;
        ctx.font = "11px " + getComputedStyle(document.body).fontFamily;
        ctx.textAlign = p.x > SIZE / 2 ? "right" : "left";
        ctx.fillText(p.node.title, p.x + (p.x > SIZE / 2 ? -8 : 8), p.y - 8);
      }
    });
  }

  function nodeAt(x, y) {
    for (var i = 0; i < layout.nodeIds.length; i++) {
      var id = layout.nodeIds[i];
      var p = layout.positions[id];
      if (!p) continue;
      var dx = p.x - x,
        dy = p.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= 8) return id;
    }
    return null;
  }

  canvas.addEventListener("mousemove", function (ev) {
    var rect = canvas.getBoundingClientRect();
    var x = ((ev.clientX - rect.left) / rect.width) * SIZE;
    var y = ((ev.clientY - rect.top) / rect.height) * SIZE;
    var hit = nodeAt(x, y);
    canvas.style.cursor = hit ? "pointer" : "default";
    if (hit !== hovered) {
      hovered = hit;
      draw();
    }
  });

  canvas.addEventListener("mouseleave", function () {
    if (hovered !== null) {
      hovered = null;
      draw();
    }
  });

  canvas.addEventListener("click", function (ev) {
    var rect = canvas.getBoundingClientRect();
    var x = ((ev.clientX - rect.left) / rect.width) * SIZE;
    var y = ((ev.clientY - rect.top) / rect.height) * SIZE;
    var hit = nodeAt(x, y);
    if (hit && layout.positions[hit] && layout.positions[hit].node) {
      window.location.href = layout.positions[hit].node.href;
    }
  });

  draw();
  document.addEventListener("themechange", draw);
})();
