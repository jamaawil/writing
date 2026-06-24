/* Site UI behaviors — ported to match the reference site's controls and chrome.
 * Comments (comments.js), footnotes (footnotes.js) and the zettel graph
 * (zettel-graph.js) remain separate modules; this file owns theme/font/size,
 * the announcement banner, the sidebar scrollbar + pfp ring, view toggles,
 * filters, the mobile drawer, and the comment cue.
 */
(function () {
  var root = document.documentElement;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---- announcement banner: keep --banner-h equal to its real height ---- */
  (function sizeBanner() {
    var b = document.getElementById("siteBanner");
    if (!b) { root.style.setProperty("--banner-h", "0px"); return; }
    var set = function () { root.style.setProperty("--banner-h", b.offsetHeight + "px"); };
    set();
    window.addEventListener("resize", set);
    if (window.ResizeObserver) new ResizeObserver(set).observe(b);
  })();

  /* ---- theme: light "papers" + dark in one cycler ---- */
  var THEMES = [
    { name: "Off-white", mode: "light", paper: "#fafaf8" },
    { name: "Dark", mode: "dark", paper: null },
    { name: "Ivory", mode: "light", paper: "#f5f2e9" },
    { name: "Mint-paper", mode: "light", paper: "#eef5f1" },
  ];
  function getThemeIdx() {
    var s = parseInt(localStorage.getItem("theme-idx"), 10);
    return Number.isInteger(s) && s >= 0 && s < THEMES.length ? s : 0;
  }
  function setThemeIdx(idx) {
    var t = THEMES[idx];
    root.setAttribute("data-theme", t.mode);
    if (t.paper) root.style.setProperty("--paper-bg", t.paper);
    else root.style.removeProperty("--paper-bg");
    try { localStorage.setItem("theme-idx", String(idx)); } catch (e) {}
  }
  window.cycleTheme = function () {
    var idx = (getThemeIdx() + 1) % THEMES.length;
    setThemeIdx(idx);
    flashTooltip($(".theme-toggle"), THEMES[idx].name);
  };
  window.toggleTheme = function () {
    var cur = getThemeIdx();
    setThemeIdx(THEMES[cur].mode === "dark" ? 0 : 1);
  };
  setThemeIdx(getThemeIdx());

  /* ---- copy email, flash "Copied" ---- */
  window.copyEmail = function () {
    var btn = $(".email-link");
    var email = (btn && btn.dataset.email) || "";
    if (!email) return;
    var done = function () {
      if (!btn) return;
      btn.classList.add("copied");
      clearTimeout(btn._copyTimer);
      btn._copyTimer = setTimeout(function () { btn.classList.remove("copied"); }, 1000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(done).catch(function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = email; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  };

  function flashTooltip(btn, valueName) {
    if (!btn) return;
    var tip = btn.querySelector(".tooltip");
    var label = btn.dataset.label;
    if (tip && valueName) tip.textContent = valueName;
    btn.classList.add("show-tooltip");
    clearTimeout(btn._tipTimer);
    btn._tipTimer = setTimeout(function () {
      btn.classList.remove("show-tooltip");
      if (tip && label) tip.textContent = label;
    }, 1000);
  }

  /* ---- font pairs: display + body together ---- */
  var FONT_PAIRS = [
    { name: "Cormorant / Garamond", display: '"Cormorant Garamond", Georgia, serif', body: '"EB Garamond", Georgia, serif', cls: "font-pair-cormorant" },
    { name: "Khmer / Crimson", display: '"Khmer MN", "Khmer Sangam MN", "Baskerville", serif', body: '"Crimson Pro", Georgia, serif', cls: "font-pair-khmer" },
    { name: "Playfair / Merriweather", display: '"Playfair Display", Georgia, serif', body: '"Merriweather", Georgia, serif', cls: "font-pair-playfair" },
  ];
  function getFontPairIdx() {
    var s = parseInt(localStorage.getItem("font-pair-idx"), 10);
    return Number.isInteger(s) && s >= 0 && s < FONT_PAIRS.length ? s : 0;
  }
  function setFontPairIdx(idx) {
    var p = FONT_PAIRS[idx];
    root.style.setProperty("--font-display", p.display);
    root.style.setProperty("--font-serif", p.body);
    root.classList.remove("font-pair-cormorant", "font-pair-khmer", "font-pair-playfair");
    root.classList.add(p.cls);
    try { localStorage.setItem("font-pair-idx", String(idx)); } catch (e) {}
  }
  window.cycleFontPair = function () {
    var idx = (getFontPairIdx() + 1) % FONT_PAIRS.length;
    setFontPairIdx(idx);
    flashTooltip($(".font-toggle"), FONT_PAIRS[idx].name);
  };
  setFontPairIdx(getFontPairIdx());

  /* ---- reading prose size ---- */
  var PROSE_SIZES = [
    { name: "Default", scale: 1 },
    { name: "Small", scale: 0.875 },
    { name: "Large", scale: 1.125 },
  ];
  function getProseSizeIdx() {
    var s = parseInt(localStorage.getItem("prose-size-idx"), 10);
    return Number.isInteger(s) && s >= 0 && s < PROSE_SIZES.length ? s : 0;
  }
  function setProseSizeIdx(idx) {
    root.style.setProperty("--prose-scale", String(PROSE_SIZES[idx].scale));
    try { localStorage.setItem("prose-size-idx", String(idx)); } catch (e) {}
  }
  window.cycleProseSize = function () {
    var idx = (getProseSizeIdx() + 1) % PROSE_SIZES.length;
    setProseSizeIdx(idx);
    flashTooltip($(".size-toggle"), PROSE_SIZES[idx].name);
  };
  setProseSizeIdx(getProseSizeIdx());

  /* ---- aside custom scrollbar ---- */
  (function setupAsideScrollbar() {
    var aside = $("aside");
    var scrollArea = aside && $(".aside-scroll-area", aside);
    var thumb = aside && $(".aside-thumb", aside);
    var bar = aside && $(".aside-scrollbar", aside);
    if (!aside || !scrollArea || !thumb || !bar) return;
    function update() {
      var visible = scrollArea.clientHeight;
      var total = scrollArea.scrollHeight;
      if (total <= visible + 2) { bar.style.display = "none"; return; }
      bar.style.display = "";
      var thumbH = Math.max(28, Math.floor((visible / total) * visible));
      thumb.style.height = thumbH + "px";
      var trackH = visible - thumbH;
      var ratio = scrollArea.scrollTop / (total - visible);
      thumb.style.top = Math.round(ratio * trackH) + "px";
    }
    var t;
    scrollArea.addEventListener("scroll", function () {
      aside.classList.add("is-scrolling");
      update();
      clearTimeout(t);
      t = setTimeout(function () { aside.classList.remove("is-scrolling"); }, 900);
    }, { passive: true });
    window.addEventListener("resize", update);
    requestAnimationFrame(update);
    setTimeout(update, 200);
  })();

  /* ---- generic view toggle ---- */
  function setupViewToggle(toggleId, sectionId, storageKey, validViews, defaultView, persist) {
    if (persist === undefined) persist = true;
    var section = document.getElementById(sectionId);
    var toggle = document.getElementById(toggleId);
    if (!section || !toggle) return;
    var buttons = $$("button", toggle);
    function setView(view) {
      if (validViews.indexOf(view) === -1) view = defaultView;
      section.setAttribute("data-active-view", view);
      buttons.forEach(function (b) { b.classList.toggle("active", b.dataset.view === view); });
      if (persist) { try { localStorage.setItem(storageKey, view); } catch (e) {} }
    }
    var stored = null;
    if (persist) { try { stored = localStorage.getItem(storageKey); } catch (e) {} }
    setView(stored || defaultView);
    buttons.forEach(function (b) { b.addEventListener("click", function () { setView(b.dataset.view); }); });
  }
  setupViewToggle("topicsViewToggle", "tagIndexSection", "topics-view", ["rows", "groups", "flat"], "rows", true);
  try { localStorage.removeItem("all-posts-view"); } catch (e) {}
  setupViewToggle("allPostsToggle", "allPostsSection", "all-posts-view", ["latest", "list"], "latest", false);
  try { localStorage.removeItem("featured-view"); } catch (e) {}
  setupViewToggle("featuredToggle", "featuredSection", "featured-view", ["main", "list"], "main", false);
  setupViewToggle("libraryToggle", "librarySection", "library-view", ["gallery", "table"], "gallery", true);

  /* ---- tag-index cluster groups ---- */
  $$("#tagIndexSection .tag-index-cluster").forEach(function (cluster) {
    var btns = $$(".cluster-group-btn", cluster);
    var panels = $$(".cluster-panel", cluster);
    btns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = btn.dataset.group;
        btns.forEach(function (b) { b.setAttribute("data-active", b === btn ? "true" : "false"); });
        panels.forEach(function (p) { p.setAttribute("data-active", p.dataset.group === target ? "true" : "false"); });
      });
    });
  });

  /* ---- library table sort ---- */
  (function setupLibraryTable() {
    var table = $(".library-table");
    if (!table) return;
    var tbody = $("tbody", table);
    var ths = $$("th", table);
    function sortBy(th, dir) {
      var idx = ths.indexOf(th);
      var isText = th.dataset.type === "text";
      var rows = $$("tr", tbody);
      rows.sort(function (a, b) {
        var ca = a.children[idx], cb = b.children[idx];
        if (isText) {
          var va = ca.textContent.trim().toLowerCase(), vb = cb.textContent.trim().toLowerCase();
          return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        var na = parseFloat(ca.dataset.sort) || 0, nb = parseFloat(cb.dataset.sort) || 0;
        return dir === "asc" ? na - nb : nb - na;
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
      ths.forEach(function (t) { t.setAttribute("aria-sort", "none"); });
      th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
    }
    var startDir = function (th) { return th.dataset.type === "text" ? "asc" : "desc"; };
    ths.forEach(function (th) {
      th.addEventListener("click", function () {
        var cur = th.getAttribute("aria-sort");
        var dir = cur === "ascending" ? "desc" : cur === "descending" ? "asc" : startDir(th);
        sortBy(th, dir);
      });
    });
    var titleTh = ths.find(function (t) { return t.dataset.col === "title"; });
    if (titleTh) sortBy(titleTh, "asc");
  })();

  /* ---- projects: tag + year filters ---- */
  (function setupProjectsFilter() {
    var section = document.getElementById("projectsSection");
    var tagToggle = document.getElementById("projectsFilter");
    var yearToggle = document.getElementById("projectsYearFilter");
    if (!section || !tagToggle) return;
    var tagButtons = $$("button", tagToggle);
    var yearButtons = yearToggle ? $$("button", yearToggle) : [];
    var activeTag = "all", activeYear = "all";
    function apply() {
      tagButtons.forEach(function (b) { b.classList.toggle("active", b.dataset.filter === activeTag); });
      yearButtons.forEach(function (b) { b.classList.toggle("active", b.dataset.yearFilter === activeYear); });
      $$(".timeline-item", section).forEach(function (it) {
        var tags = (it.dataset.tags || "").split(/\s+/).filter(Boolean);
        var year = it.dataset.year || "";
        var tagOk = activeTag === "all" || tags.indexOf(activeTag) !== -1;
        var yearOk = activeYear === "all" || year === activeYear;
        it.style.display = tagOk && yearOk ? "" : "none";
      });
    }
    tagButtons.forEach(function (b) { b.addEventListener("click", function () { activeTag = b.dataset.filter; apply(); }); });
    yearButtons.forEach(function (b) { b.addEventListener("click", function () { activeYear = b.dataset.yearFilter; apply(); }); });
    apply();
  })();

  /* ---- mobile nav: clone the aside nav into the drawer's top row ---- */
  (function buildMobileNav() {
    var asideNav = $(".aside-nav");
    var mobile = document.getElementById("mobileNav");
    if (!asideNav || !mobile) return;
    $$("a", asideNav).forEach(function (src) {
      var svg = src.querySelector("svg");
      if (!svg) return;
      var a = document.createElement("a");
      a.href = src.getAttribute("href");
      var label = src.querySelector(".label");
      a.setAttribute("aria-label", (label ? label.textContent : "").trim());
      if (src.classList.contains("active")) a.classList.add("active");
      a.appendChild(svg.cloneNode(true));
      mobile.appendChild(a);
    });
  })();

  /* ---- mobile drawer ---- */
  var hamburger = document.getElementById("hamburger");
  var drawerBackdrop = document.getElementById("drawerBackdrop");
  var asideEl = $("aside");
  function openDrawer() {
    if (!asideEl) return;
    asideEl.classList.add("open");
    if (hamburger) { hamburger.classList.add("open"); hamburger.setAttribute("aria-expanded", "true"); }
    if (drawerBackdrop) drawerBackdrop.classList.add("visible");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    if (!asideEl) return;
    asideEl.classList.remove("open");
    if (hamburger) { hamburger.classList.remove("open"); hamburger.setAttribute("aria-expanded", "false"); }
    if (drawerBackdrop) drawerBackdrop.classList.remove("visible");
    document.body.style.overflow = "";
  }
  if (hamburger) hamburger.addEventListener("click", function () {
    if (asideEl && asideEl.classList.contains("open")) closeDrawer(); else openDrawer();
  });
  if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && asideEl && asideEl.classList.contains("open")) closeDrawer();
  });
  $$(".aside-nav a").forEach(function (link) { link.addEventListener("click", closeDrawer); });

  /* ---- related-section topic filter (dropdown) ---- */
  (function setupRelatedFilters() {
    $$(".related-section").forEach(function (section) {
      var filter = $("[data-related-filter]", section);
      var list = $(".related-list", section);
      if (!filter || !list) return;
      var trigger = $(".rf-trigger", filter);
      var menu = $(".rf-menu", filter);
      var opts = $$('[role="option"]', menu);
      var LIMIT = 16, current = "all";
      function apply() {
        var shown = 0;
        Array.prototype.forEach.call(list.children, function (li) {
          var tags = (li.dataset.tags || "").split(/\s+/).filter(Boolean);
          var matches = current === "all" || tags.indexOf(current) !== -1;
          if (matches && shown < LIMIT) { li.style.display = ""; shown++; } else { li.style.display = "none"; }
        });
      }
      function setOpen(open) { menu.hidden = !open; trigger.setAttribute("aria-expanded", open ? "true" : "false"); }
      trigger.addEventListener("click", function (e) { e.stopPropagation(); setOpen(menu.hidden); });
      opts.forEach(function (opt) {
        opt.addEventListener("click", function () {
          current = opt.dataset.value;
          opts.forEach(function (o) { o.setAttribute("aria-selected", o === opt ? "true" : "false"); });
          apply(); setOpen(false);
        });
      });
      document.addEventListener("click", function (e) { if (!filter.contains(e.target)) setOpen(false); });
      apply();
    });
  })();

  /* ---- comment cue: count via the existing comments API, click → comments ---- */
  (function setupCommentCue() {
    var cue = document.getElementById("metaCommentCue");
    if (!cue) return;
    var countEl = document.getElementById("metaComments");
    var page = cue.dataset.page;
    function countThread(list) {
      var n = 0;
      (list || []).forEach(function (c) { n += 1 + ((c.replies && c.replies.length) || 0); });
      return n;
    }
    if (countEl && page) {
      fetch("/api/comments?page=" + encodeURIComponent(page))
        .then(function (r) { return r.ok ? r.json() : { comments: [] }; })
        .then(function (d) { countEl.textContent = String(countThread(d.comments)); })
        .catch(function () {});
    }
    function goToComments() {
      var target = $(".commentable");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    cue.addEventListener("click", goToComments);
    cue.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToComments(); }
    });
  })();

  /* ---- pfp peg: orbits 0°→360° as a reading-progress indicator ---- */
  (function setupPfpRing() {
    var ring = $("aside .pfp-peg-rotator");
    if (!ring) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var ticking = false;
    function update() {
      var y = window.scrollY || window.pageYOffset || 0;
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      var progress = Math.min(1, Math.max(0, y / max));
      ring.style.transform = "rotate(" + (progress * 360).toFixed(2) + "deg)";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    window.addEventListener("resize", update);
    update();
  })();
})();
