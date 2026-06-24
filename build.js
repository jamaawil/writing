const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { unified } = require("unified");
const remarkParse = require("remark-parse").default || require("remark-parse");
const remarkGfm = require("remark-gfm").default || require("remark-gfm");
const remarkRehype = require("remark-rehype").default || require("remark-rehype");
const rehypeStringify = require("rehype-stringify").default || require("rehype-stringify");

const ROOT = __dirname;
const CONTENT = path.join(ROOT, "content");
const OUT = path.join(ROOT, "public");
const SITE_NAME = "Jamal Awil";
const SITE_EMAIL = "mawilinc@gmail.com";
const BIO =
  'I am a lifelong learner and professional business solutions developer with a desire to help and learn as much as I can. I now run <a href="https://funnelithic.com/" target="_blank" rel="noopener noreferrer">Funnelithic Business Solutions Agency</a> in MN.';
const CTA = { label: "Hire me", href: "https://funnelithic.com/" };
// Announcement banner shown at the top of the home page. Edit the text/href or set
// BANNER to null to hide it. (Reuses Jamal's existing tagline — no new editorial copy.)
const BANNER = {
  html: "Never tire of learning!",
};

const ICONS = {
  startHere: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  essays: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  favorites: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  index: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  library: '<path d="M4 4v16"/><path d="M8 6v14"/><path d="M12 5v15"/><path d="M16 6l4 14"/>',
  dictionary: '<text x="12" y="18" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-weight="700" fill="currentColor" stroke="none">Aa</text>',
  projects: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  bits: '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>',
  scholars: '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  ideas: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  plan: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  bibliography: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  zettel: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><line x1="6" y1="6" x2="12" y2="18"/><line x1="18" y1="6" x2="12" y2="18"/><line x1="6" y1="6" x2="18" y2="6"/>',
};

const NAV = [
  { title: "Start Here", href: "/start-here/", icon: ICONS.startHere },
  { title: "All Essays", href: "/", icon: ICONS.essays },
  { title: "Favorites", href: "/favorites/", icon: ICONS.favorites },
  { title: "Index", href: "/index-topics/", icon: ICONS.index },
  { title: "Library", href: "/library/", icon: ICONS.library },
  { title: "Dictionary", href: "/dictionary/", icon: ICONS.dictionary },
  { title: "Projects", href: "/projects/", icon: ICONS.projects },
  { title: "Bits", href: "/bits/", icon: ICONS.bits },
  { title: "Scholars", href: "/scholars/", icon: ICONS.scholars },
  { title: "Ideas", href: "/ideas/", icon: ICONS.ideas },
  { title: "Zettel", href: "/zettel/", icon: ICONS.zettel },
  { title: "Five-Year Plan", href: "/plan/", icon: ICONS.plan },
  { title: "Bibliography", href: "/bibliography/", icon: ICONS.bibliography },
];

const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;700&family=Cormorant+Garamond:wght@400;700&family=Crimson+Pro:wght@400;700&family=Merriweather:wght@400;700&family=Playfair+Display:wght@400;700&family=Source+Serif+4:wght@400;700&family=Lora:wght@400;700&display=swap" rel="stylesheet">';

// No-FOUC boot: apply stored theme / font-pair / prose-size before first paint.
const BOOT = `<script>(function(){try{var d=document.documentElement;
var t=parseInt(localStorage.getItem('theme-idx'),10);var T=[['light','#fafaf8'],['dark',null],['light','#f5f2e9'],['light','#eef5f1']];if(!(t>=0&&t<4))t=0;d.setAttribute('data-theme',T[t][0]);if(T[t][1])d.style.setProperty('--paper-bg',T[t][1]);
var f=parseInt(localStorage.getItem('font-pair-idx'),10);var F=[['"Cormorant Garamond", Georgia, serif','"EB Garamond", Georgia, serif','font-pair-cormorant'],['"Khmer MN","Khmer Sangam MN","Baskerville",serif','"Crimson Pro", Georgia, serif','font-pair-khmer'],['"Playfair Display", Georgia, serif','"Merriweather", Georgia, serif','font-pair-playfair']];if(!(f>=0&&f<3))f=0;d.style.setProperty('--font-display',F[f][0]);d.style.setProperty('--font-serif',F[f][1]);d.classList.add(F[f][2]);
var s=parseInt(localStorage.getItem('prose-size-idx'),10);var S=[1,0.875,1.125];if(!(s>=0&&s<3))s=0;d.style.setProperty('--prose-scale',String(S[s]));}catch(e){}})();</script>`;

const markdownPipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

function readMarkdownDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, content } = matter(raw);
      const html = markdownPipeline.processSync(content).toString();
      return { ...data, file: f, html };
    });
}

function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
function initials(name) {
  return (name || "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function d(date) {
  const x = date ? new Date(date) : null;
  return x && !isNaN(x) ? x : null;
}
function fmtShort(date) {
  const x = d(date);
  return x ? `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}` : "";
}
function fmtLong(date) {
  const x = d(date);
  return x ? `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}, ${x.getUTCFullYear()}` : "";
}

/* ============================ shared chrome ============================ */
let HOW_HREF = null; // set in build() once we know whether the page exists
function layout({ title, activeHref, body, banner }) {
  const bannerHtml = banner ? `<div class="site-banner" id="siteBanner"><p>${banner}</p></div>` : "";
  const ctrlBtn = (cls, onclick, label, inner) =>
    `<button class="ctrl-btn ${cls}" data-label="${label}" onclick="${onclick}" aria-label="${label}">${inner}<span class="tooltip">${label}</span></button>`;
  const sun = '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93 6.34 6.34"/><path d="M17.66 17.66 19.07 19.07"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M4.93 19.07 6.34 17.66"/><path d="M17.66 6.34 19.07 4.93"/></svg>';
  const moon = '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const aaGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" overflow="visible"><text x="12" y="18" text-anchor="middle" dominant-baseline="alphabetic" font-family="Georgia, serif" font-size="18" font-weight="700" fill="currentColor" stroke="none">Aa</text></svg>';
  const sizeGlyph = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="7 10 12 5 17 10"/><polyline points="7 14 12 19 17 14"/></svg>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${SITE_NAME}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONT_LINK}
<link rel="stylesheet" href="/css/style.css">
${BOOT}
</head>
<body>
<header class="mobile-bar">
  <h1 class="mobile-title">${SITE_NAME}</h1>
  <div class="mobile-icons-row">
    <nav class="mobile-nav" id="mobileNav" aria-label="Site navigation"></nav>
    <div class="mobile-right">
      <button class="mobile-theme" onclick="toggleTheme()" aria-label="Toggle light/dark">${sun}${moon}</button>
      <button class="hamburger" id="hamburger" aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
<div class="drawer-backdrop" id="drawerBackdrop" aria-hidden="true"></div>
<div class="layout">
<aside>
  <div class="aside-scroll-area">
    <div class="aside-top">
      <a class="pfp-wrap" href="/" aria-label="${SITE_NAME} — Home">
        <img class="pfp" src="/images/profile.jpg" alt="${SITE_NAME}">
        <div class="pfp-ring" aria-hidden="true"></div>
        <div class="pfp-peg-rotator" aria-hidden="true"><span class="pfp-peg"></span></div>
      </a>
      <div class="title-block">
        <h1>${SITE_NAME}</h1>
        <button type="button" class="email-link" onclick="copyEmail()" data-email="${SITE_EMAIL}" aria-label="Copy email address">
          <span class="email-text">${SITE_EMAIL}</span>
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span class="copied-tooltip">Copied</span>
        </button>
      </div>
      <p class="bio">${BIO}</p>
      <a class="club-button" href="${CTA.href}" target="_blank" rel="noopener noreferrer">${CTA.label} ↗</a>
    </div>
    <nav class="aside-nav">
      ${NAV.map((n) => `<a href="${n.href}"${n.href === activeHref ? ' class="active"' : ""}>${svgIcon(n.icon)}<span class="label">${n.title}</span></a>`).join("\n      ")}
    </nav>
    <div class="controls">
      ${HOW_HREF ? `<a class="how-link" href="${HOW_HREF}">How I built this</a>` : ""}
      <div class="ctrl-row">
        ${ctrlBtn("theme-toggle", "cycleTheme()", "Theme", sun + moon)}
        ${ctrlBtn("font-toggle", "cycleFontPair()", "Font", aaGlyph)}
        ${ctrlBtn("size-toggle", "cycleProseSize()", "Size", sizeGlyph)}
      </div>
    </div>
  </div>
  <div class="aside-scrollbar" aria-hidden="true">
    <div class="aside-thumb"><div class="aside-cap aside-cap-top"></div><div class="aside-rod"></div><div class="aside-cap aside-cap-bottom"></div></div>
  </div>
</aside>
<main>
${bannerHtml}
${body}
<footer class="site-footer"><p>Built with a custom markdown pipeline.</p></footer>
</main>
</div>
<script src="/js/main.js"></script>
<script src="/js/comments.js"></script>
<script src="/js/footnotes.js"></script>
<script src="/js/zettel-graph.js"></script>
</body>
</html>
`;
}

function writePage(relDir, html) {
  const dir = path.join(OUT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name), de = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, de);
    else fs.copyFileSync(s, de);
  }
}
function copyStatic() {
  for (const name of ["css", "js", "images"]) {
    const src = path.join(ROOT, "static", name);
    if (fs.existsSync(src)) copyDirRecursive(src, path.join(OUT, name));
  }
}

// Binary assets (e.g. images) can't be committed through the GitHub API, so they
// live in the repo as base64 text alongside a ".b64" suffix. At build time we
// decode every "<name>.b64" in the output back into the real binary "<name>" and
// drop the ".b64" copy. (Drop a normal binary file in instead and it just works.)
function decodeB64Tree(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) decodeB64Tree(p);
    else if (entry.name.endsWith(".b64")) {
      const out = p.slice(0, -4);
      fs.writeFileSync(out, Buffer.from(fs.readFileSync(p, "utf8"), "base64"));
      fs.rmSync(p);
    }
  }
}

function commentCue(pageSlug) {
  return `<div class="toolbar-meta">
    <span class="meta-cue" id="metaCommentCue" data-page="${esc(pageSlug)}" role="button" tabindex="0" aria-label="Leave a comment">
      <span class="cue-text"><span class="cue-long">Leave a comment</span><span class="cue-short">Comment</span></span>
      <span class="cue-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
      <span class="cue-count" id="metaComments">0</span>
    </span>
  </div>`;
}
function backLink(label, href) {
  return `<a class="back-link" href="${href}">← ${label}</a>`;
}
function commentable(slug, html) {
  return `<div class="body commentable" data-page="${esc(slug)}">${html}</div>`;
}

/* ============================ contribution graph ============================ */
function contribGraph(items) {
  const counts = new Map();
  let total = 0;
  for (const it of items) {
    const x = d(it.date);
    if (!x) continue;
    const key = x.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) || 0) + 1);
    total++;
  }
  const today = new Date("2026-06-24T00:00:00Z");
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7 * 52 - 6);
  const level = (n) => (n <= 0 ? 0 : n === 1 ? 2 : n === 2 ? 3 : 4);
  const cols = [];
  const monthLabels = [];
  const cur = new Date(start);
  let lastMonth = -1;
  while (cur <= end) {
    const cells = [];
    const colMonth = cur.getUTCMonth();
    for (let i = 0; i < 7; i++) {
      const key = cur.toISOString().slice(0, 10);
      const lvl = cur > today ? 0 : level(counts.get(key) || 0);
      cells.push(`<div class="contrib-cell" data-level="${lvl}"></div>`);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    cols.push(`<div class="contrib-col">${cells.join("")}</div>`);
    monthLabels.push(colMonth !== lastMonth ? MONTHS[colMonth] : "");
    lastMonth = colMonth;
  }
  const months = monthLabels.map((m) => `<span class="contrib-month">${m}</span>`).join("");
  const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""].map((dl) => `<span>${dl}</span>`).join("");
  return `<section class="contrib-graph">
  <div class="contrib-summary">${total} entr${total === 1 ? "y" : "ies"} in the last year</div>
  <div class="contrib-body">
    <div class="contrib-days"><div class="contrib-days-spacer"></div><div class="contrib-days-list">${dayLabels}</div></div>
    <div class="contrib-scroll" id="contribScroll">
      <div class="contrib-months">${months}</div>
      <div class="contrib-grid">${cols.join("")}</div>
    </div>
  </div>
</section>`;
}

/* ============================ build ============================ */
function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyStatic();
  decodeB64Tree(OUT);

  const essays = readMarkdownDir(path.join(CONTENT, "essays")).sort((a, b) => new Date(b.date) - new Date(a.date));
  const definitions = readMarkdownDir(path.join(CONTENT, "definitions")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const library = readMarkdownDir(path.join(CONTENT, "library")).sort((a, b) => (b.highlights || 0) - (a.highlights || 0));
  const topics = readMarkdownDir(path.join(CONTENT, "topics")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const scholars = readMarkdownDir(path.join(CONTENT, "scholars")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const ideas = readMarkdownDir(path.join(CONTENT, "ideas")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const zettels = readMarkdownDir(path.join(CONTENT, "zettel")).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const bits = readMarkdownDir(path.join(CONTENT, "bits")).sort((a, b) => new Date(b.date) - new Date(a.date));
  const semesters = readMarkdownDir(path.join(CONTENT, "semesters")).sort((a, b) => (a.order || 0) - (b.order || 0));
  const bibliography = readMarkdownDir(path.join(CONTENT, "bibliography")).sort((a, b) => (a.order || 0) - (b.order || 0));
  const pages = readMarkdownDir(path.join(CONTENT, "pages"));
  const pageBySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));
  HOW_HREF = pageBySlug["how-i-built-this"] ? "/how-i-built-this/" : null;

  /* ---------- home: all-posts (LATEST | LIST) + archive ---------- */
  const logArticle = (e) => `<article class="log" data-log="essay/${e.slug}">
  <header>
    <h2><a href="/essay/${e.slug}/">${esc(e.title)}</a></h2>
    ${e.subtitle ? `<p class="subtitle">${esc(e.subtitle)}</p>` : ""}
    <div class="meta"><time datetime="${e.date || ""}">${fmtLong(e.date)}</time>${e.words ? ` · ${e.words} words` : ""}</div>
  </header>
  <div class="body">${e.html}</div>
</article>`;
  const favoriteRow = (e) => `<li class="favorite-row">
  <a class="favorite-title" href="/essay/${e.slug}/">${e.favorite ? '<span class="favorite-star" title="Favorite">★</span> ' : ""}${esc(e.title)}</a>
  <div class="favorite-topics">${(e.topics || []).map((t) => `<a class="topic" href="/topic/${t}/">${esc(t)}</a>`).join("")}</div>
  <time class="favorite-date">${fmtShort(e.date)}</time>
</li>`;
  const monthGroups = [];
  const seenMonths = new Map();
  for (const e of essays) {
    const x = d(e.date);
    if (!x) continue;
    const key = `${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
    if (!seenMonths.has(key)) { seenMonths.set(key, { key, n: 0 }); monthGroups.push(seenMonths.get(key)); }
    seenMonths.get(key).n++;
  }
  const archive = monthGroups.length
    ? `<section class="archive-section"><h3 class="section-heading">Archive</h3><ul class="archive-list">${monthGroups
        .map((g, i) => `<li class="archive-row${i === 0 ? " current" : ""}"><span class="archive-name"><span>${g.key}</span>${i === 0 ? ' <span class="badge">current</span>' : ""}</span><span class="archive-count">${g.n} essay${g.n === 1 ? "" : "s"}</span></li>`)
        .join("")}</ul></section>`
    : "";
  const homeBody = `<section class="all-posts-section" data-active-view="latest" id="allPostsSection">
  <div class="all-posts-toolbar">
    <div class="view-toggle" id="allPostsToggle">
      <button data-view="latest" class="active">LATEST</button>
      <span class="sep">|</span>
      <button data-view="list">LIST</button>
    </div>
    ${commentCue("home")}
  </div>
  <div class="commentable" data-page="home">
    <div class="all-posts-stream view-latest">
      ${essays.length ? essays.map(logArticle).join("\n") : '<p class="empty-note">No essays published yet.</p>'}
    </div>
    <ul class="all-posts-list view-list favorites-list">
      ${essays.map(favoriteRow).join("\n")}
    </ul>
  </div>
  ${archive}
</section>`;
  writePage("", layout({ title: "Home", activeHref: "/", body: homeBody, banner: BANNER && BANNER.html }));

  /* ---------- essay detail pages ---------- */
  for (const e of essays) {
    writePage(`essay/${e.slug}`, layout({
      title: e.title,
      activeHref: "/",
      body: `${backLink("All Essays", "/")}
<article class="log detail" data-log="essay/${e.slug}">
  <header>
    <h2>${esc(e.title)}</h2>
    ${e.subtitle ? `<p class="subtitle">${esc(e.subtitle)}</p>` : ""}
    <div class="meta"><time datetime="${e.date || ""}">${fmtLong(e.date)}</time>${e.words ? ` · ${e.words} words` : ""}</div>
  </header>
  ${commentable(`essay/${e.slug}`, e.html)}
</article>`,
    }));
  }

  /* ---------- /essays/ year-grouped index ---------- */
  const byYear = new Map();
  for (const e of essays) {
    const yr = (d(e.date) || new Date()).getUTCFullYear();
    if (!byYear.has(yr)) byYear.set(yr, []);
    byYear.get(yr).push(e);
  }
  const yearSections = [...byYear.keys()].sort((a, b) => b - a).map((yr) => `<section class="essay-index-year">
  <h3 class="year-heading">${yr}</h3>
  <ul class="essay-index">
    ${byYear.get(yr).map((e) => `<li><a class="essay-index-row" href="/essay/${e.slug}/">
      <div class="row-top"><span class="t">${e.favorite ? "★ " : ""}${esc(e.title)}</span><span class="right"><time>${fmtShort(e.date)}</time><span class="arrow">↗</span></span></div>
      ${e.subtitle ? `<div class="row-subtitle">${esc(e.subtitle)}</div>` : ""}
      <div class="row-meta">${e.words ? e.words + " words" : ""}${(e.topics || []).length ? " · " + e.topics.join(", ") : ""}</div>
    </a></li>`).join("\n    ")}
  </ul>
</section>`).join("\n");
  writePage("essays", layout({ title: "All Essays", activeHref: "/", body: `<div class="page-head"><h1 class="page-title">All Essays</h1></div>${yearSections || '<p class="empty-note">No essays yet.</p>'}` }));

  /* ---------- favorites (featured: MAIN | LIST) ---------- */
  const favs = essays.filter((e) => e.favorite);
  const excerpt = (html) => esc((html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280));
  const featuredMain = (e) => `<a class="featured-main" href="/essay/${e.slug}/">
  <div class="featured-card main-left">
    <div class="card-body">
      <div class="card-meta">${fmtLong(e.date)}${e.words ? ` · ${e.words} words` : ""}</div>
      <h3 class="card-title">${esc(e.title)}</h3>
      ${e.subtitle ? `<p class="card-subtitle">${esc(e.subtitle)}</p>` : ""}
    </div>
  </div>
  <div class="main-right"><div class="main-right-inner"><p class="main-excerpt">${excerpt(e.html)}…</p><div class="main-foot">Read essay →</div></div></div>
</a>`;
  const favBody = `<section class="featured-section" data-active-view="main" id="featuredSection">
  <div class="featured-toolbar">
    <div class="page-head"><h1 class="page-title">Favorites</h1><p class="page-subtitle">A short, curated list of essays worth reading first.</p></div>
    <div class="view-toggle" id="featuredToggle"><button data-view="main" class="active">MAIN</button><span class="sep">|</span><button data-view="list">LIST</button></div>
  </div>
  <div class="featured-view view-main"><div class="featured-main-list">${favs.length ? favs.map(featuredMain).join("\n") : '<p class="empty-note">No favorites yet.</p>'}</div></div>
  <div class="featured-view view-list"><ul class="all-posts-list favorites-list">${favs.map(favoriteRow).join("\n")}</ul></div>
</section>`;
  writePage("favorites", layout({ title: "Favorites", activeHref: "/favorites/", body: favBody }));

  /* ---------- index (contribution graph + tag index) ---------- */
  const contribItems = [...essays, ...library.filter((l) => l.date), ...bits];
  const tagRows = topics.map((t) => {
    const inTopic = essays.filter((e) => (e.topics || []).includes(t.slug));
    return `<div class="tag-rows-row">
    <div class="tag-rows-name"><div class="tag-rows-name-label">${esc(t.title)}</div><div class="tag-rows-name-sub">${inTopic.length} <a class="tag-rows-viewall" href="/topic/${t.slug}/">(view all)</a></div></div>
    <div class="tag-rows-pills">${inTopic.map((e) => `<a class="cluster-tag" href="/essay/${e.slug}/"><span class="cluster-tag-name">${esc(e.title)}</span></a>`).join("")}</div>
  </div>`;
  }).join("\n");
  const indexBody = `${contribGraph(contribItems)}
<section class="tag-index-section" data-active-view="rows" id="tagIndexSection">
  <div class="tag-index-header">
    <h3 class="tag-index-heading">Topics</h3>
    <div class="topics-view-toggle" id="topicsViewToggle"><button data-view="rows" class="active">ROWS</button><span class="sep">|</span><button data-view="groups">GROUPS</button><span class="sep">|</span><button data-view="flat">A&gt;Z</button></div>
  </div>
  <div class="tag-index-rows">${tagRows || '<p class="empty-note">No topics yet.</p>'}</div>
  <div class="tag-index-grouped"><div class="tag-index-cluster"><div class="cluster-panels"><div class="cluster-panel" data-active="true">${topics.map((t) => `<a class="cluster-tag" href="/topic/${t.slug}/"><span class="cluster-tag-name">${esc(t.title)}</span><span class="cluster-tag-count">${essays.filter((e) => (e.topics || []).includes(t.slug)).length}</span></a>`).join("")}</div></div></div></div>
  <div class="tag-index">${topics.map((t) => `<a class="cluster-tag" href="/topic/${t.slug}/"><span class="cluster-tag-name">${esc(t.title)}</span></a>`).join("")}</div>
</section>`;
  writePage("index-topics", layout({ title: "Index", activeHref: "/index-topics/", body: indexBody }));

  for (const t of topics) {
    const inTopic = essays.filter((e) => (e.topics || []).includes(t.slug));
    writePage(`topic/${t.slug}`, layout({
      title: t.title, activeHref: "/index-topics/",
      body: `${backLink("Index", "/index-topics/")}<div class="page-head"><h1 class="page-title">${esc(t.title)}</h1><p class="page-subtitle">Essays tagged ${esc(t.title)}.</p></div>
<ul class="essay-index">${inTopic.map((e) => `<li><a class="essay-index-row" href="/essay/${e.slug}/"><div class="row-top"><span class="t">${esc(e.title)}</span><span class="right"><time>${fmtShort(e.date)}</time><span class="arrow">↗</span></span></div></a></li>`).join("")}</ul>${t.html || ""}`,
    }));
  }

  /* ---------- library (GALLERY | TABLE) + detail ---------- */
  const bookCard = (e) => `<a class="book-card" href="/library/${e.slug}/">
  <div class="cover-wrap">${e.cover ? `<img class="cover" src="${e.cover}" alt="${esc(e.title)} cover" loading="lazy">` : `<span class="cover-initials">${esc(e.title)}</span>`}</div>
  ${e.responses ? `<span class="response-badge" title="${e.responses} responses">${e.responses}</span>` : ""}
  <div class="title">${esc(e.title)}</div>
  <div class="author">${esc(e.author || "")}</div>
  <div class="count">${e.highlights || 0} highlights</div>
</a>`;
  const libBody = `<section class="library-section" data-active-view="gallery" id="librarySection">
  <div class="library-header">
    <div class="library-header-text"><h1 class="library-page-title">Library</h1><p class="library-subtitle">Highlights and responses, organized by source.</p></div>
    <div class="view-toggle library-view-toggle" id="libraryToggle"><button data-view="gallery" class="active">GALLERY</button><span class="sep">|</span><button data-view="table">TABLE</button></div>
  </div>
  <div class="library-grid">${library.map(bookCard).join("\n")}</div>
  <div class="library-table-view">
    <table class="library-table">
      <thead><tr><th data-col="title" data-type="text">Title</th><th data-col="author" data-type="text">Author</th><th data-col="highlights" data-type="num">Highlights</th><th data-col="responses" data-type="num">Responses</th></tr></thead>
      <tbody>${library.map((e) => `<tr><td><a href="/library/${e.slug}/">${esc(e.title)}</a></td><td>${esc(e.author || "")}</td><td data-sort="${e.highlights || 0}">${e.highlights || 0}</td><td data-sort="${e.responses || 0}">${e.responses || 0}</td></tr>`).join("")}</tbody>
    </table>
  </div>
</section>`;
  writePage("library", layout({ title: "Library", activeHref: "/library/", body: libBody }));
  for (const e of library) {
    writePage(`library/${e.slug}`, layout({
      title: e.title, activeHref: "/library/",
      body: `${backLink("Library", "/library/")}<article class="log detail"><header><h2>${esc(e.title)}</h2>${e.author ? `<p class="subtitle">${esc(e.author)}</p>` : ""}<div class="meta">${e.highlights || 0} highlights · ${e.responses || 0} responses</div></header>${commentable(`library/${e.slug}`, e.html)}</article>`,
    }));
  }

  /* ---------- dictionary ---------- */
  const groups = {};
  for (const def of definitions) {
    const L = (def.title || "?")[0].toUpperCase();
    (groups[L] = groups[L] || []).push(def);
  }
  const letters = Object.keys(groups).sort();
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const alphaBar = ALPHA.map((L) => (groups[L] ? `<a href="#letter-${L}">${L}</a>` : `<span class="inactive">${L}</span>`)).join("");
  const dictBody = `<div class="dictionary-header"><h1 class="library-page-title">Dictionary of Terms</h1><p class="library-subtitle">Definitions for terms used often in this writing.</p></div>
<nav class="alphabet-bar">${alphaBar}</nav>
<div class="dictionary commentable" data-page="dictionary">${letters.map((L) => `<section class="dict-letter-group" id="letter-${L}"><div class="letter-header">${L}</div><div class="entries">${groups[L].map((def) => `<div class="dict-entry c-region" id="word-${def.slug || ""}"><div class="c-body"><p><strong class="dict-word">${esc(def.title)}</strong>${def.tagline ? ` <span class="dict-particle">${esc(def.tagline)}</span>` : ""}</p>${def.html}</div></div>`).join("")}</div></section>`).join("\n") || '<p class="empty-note">No terms yet.</p>'}</div>`;
  writePage("dictionary", layout({ title: "Dictionary of Terms", activeHref: "/dictionary/", body: dictBody }));

  /* ---------- projects ---------- */
  const projPage = pageBySlug["projects"];
  writePage("projects", layout({
    title: (projPage && projPage.title) || "Projects", activeHref: "/projects/",
    body: `<section class="projects-section" id="projectsSection"><div class="projects-header"><h1 class="projects-page-title">Projects</h1></div><div class="commentable" data-page="projects">${projPage ? projPage.html : '<p class="empty-note">No projects yet.</p>'}</div></section>`,
  }));

  /* ---------- bits ---------- */
  const bitsBody = `<div class="page-head"><h1 class="page-title">Bits</h1><p class="page-subtitle">Short notes — somewhere between a tweet and an essay.</p></div>
<div class="commentable" data-page="bits"><div class="bits-feed">${bits.map((b) => `<div class="bit"><div class="bit-date">${fmtLong(b.date)}</div><div class="body">${b.html}</div></div>`).join("\n") || '<p class="empty-note">No bits yet.</p>'}</div></div>`;
  writePage("bits", layout({ title: "Bits", activeHref: "/bits/", body: bitsBody }));

  /* ---------- scholars ---------- */
  const scholarCard = (s) => `<a class="book-card scholar-card" href="/scholars/${s.slug}/"><div class="cover-wrap"><span class="cover-initials">${initials(s.title)}</span></div><div class="title">${esc(s.title)}</div><div class="author">${esc(s.field || "")}</div><div class="count">${esc(s.era || "")}</div></a>`;
  writePage("scholars", layout({ title: "Scholars", activeHref: "/scholars/", body: `<div class="page-head"><h1 class="page-title">Scholars</h1><p class="page-subtitle">Thinkers worth returning to.</p></div><div class="library-grid">${scholars.map(scholarCard).join("\n") || '<p class="empty-note">No scholars yet.</p>'}</div>` }));
  for (const s of scholars) {
    writePage(`scholars/${s.slug}`, layout({ title: s.title, activeHref: "/scholars/", body: `${backLink("Scholars", "/scholars/")}<article class="log detail"><header><h2>${esc(s.title)}</h2><div class="meta">${esc(s.field || "")}${s.era ? " · " + esc(s.era) : ""}</div></header>${commentable(`scholars/${s.slug}`, s.html)}</article>` }));
  }

  /* ---------- ideas ---------- */
  writePage("ideas", layout({ title: "Ideas", activeHref: "/ideas/", body: `<div class="page-head"><h1 class="page-title">Ideas</h1><p class="page-subtitle">Threads worth pulling on.</p></div><div class="commentable" data-page="ideas">${ideas.map((i) => `<div class="topic-group"><h2><a href="/ideas/${i.slug}/">${esc(i.title)}</a></h2>${i.html}</div>`).join("\n") || '<p class="empty-note">No ideas yet.</p>'}</div>` }));
  for (const i of ideas) {
    writePage(`ideas/${i.slug}`, layout({ title: i.title, activeHref: "/ideas/", body: `${backLink("Ideas", "/ideas/")}<article class="log detail"><header><h2>${esc(i.title)}</h2></header>${commentable(`ideas/${i.slug}`, i.html)}</article>` }));
  }

  /* ---------- zettel ---------- */
  const zettelBody = `<div class="page-head"><h1 class="page-title">Zettel</h1><p class="page-subtitle">Atomic notes, linked.</p></div><div id="zettel-graph"></div><div class="commentable" data-page="zettel">${zettels.map((z) => `<div class="topic-group"><h2><a href="/zettel/${z.slug}/">${esc(z.title)}</a></h2>${z.html}</div>`).join("\n") || '<p class="empty-note">No zettel notes yet.</p>'}</div>`;
  writePage("zettel", layout({ title: "Zettel", activeHref: "/zettel/", body: zettelBody }));
  for (const z of zettels) {
    writePage(`zettel/${z.slug}`, layout({ title: z.title, activeHref: "/zettel/", body: `${backLink("Zettel", "/zettel/")}<article class="log detail"><header><h2>${esc(z.title)}</h2></header>${commentable(`zettel/${z.slug}`, z.html)}</article>` }));
  }

  /* ---------- five-year plan ---------- */
  const planCard = (s) => `<a class="featured-main plan-card" href="/plan/${s.slug}/">
  <div class="featured-card main-left">
    ${s.image ? `<img class="card-image" src="${s.image}" alt="${esc(s.title)}" loading="lazy">` : ""}
    <div class="card-body"><div class="card-meta">${esc(s.dateRange || "")}</div><h3 class="card-title">${esc(s.title)}</h3>${s.intro ? `<p class="card-subtitle">${esc(s.intro)}</p>` : ""}<div class="tag-row">${(s.pillars || []).map((p) => `<span class="tag">${esc(p)}</span>`).join("")}</div></div>
  </div>
</a>`;
  writePage("plan", layout({
    title: "Five-Year Plan", activeHref: "/plan/",
    body: `<div class="page-head"><h1 class="page-title">Five-Year Plan</h1><p class="page-subtitle">The Braided Reading EPUB — a 5-year integrated MA+PhD curriculum across Communication, AI, IP Law, and Social Equity. See the <a href="/bibliography/">full 1,200-book bibliography</a>.</p></div>
<div class="featured-main-list">${semesters.map(planCard).join("\n") || '<p class="empty-note">No semesters yet.</p>'}</div>`,
  }));
  for (const s of semesters) {
    writePage(`plan/${s.slug}`, layout({ title: s.title, activeHref: "/plan/", body: `${backLink("Five-Year Plan", "/plan/")}<article class="log detail"><header><h2>${esc(s.title)}</h2><div class="meta">${esc(s.dateRange || "")}</div>${s.intro ? `<p class="subtitle">${esc(s.intro)}</p>` : ""}</header>${commentable(`plan/${s.slug}`, s.html)}</article>` }));
  }

  /* ---------- bibliography ---------- */
  const biblDir = path.join(ROOT, "static/images/bibliography");
  const biblCover = (b) => (fs.existsSync(path.join(biblDir, `${b.slug}.png`)) || fs.existsSync(path.join(biblDir, `${b.slug}.png.b64`)) ? `/images/bibliography/${b.slug}.png` : null);
  const biblCard = (b) => { const c = biblCover(b); return `<a class="book-card" href="/bibliography/${b.slug}/"><div class="cover-wrap">${c ? `<img class="cover" src="${c}" alt="${esc(b.title)} cover" loading="lazy">` : `<span class="cover-initials">${initials(b.title)}</span>`}</div><div class="title">${esc(b.title)}</div><div class="count">${esc(b.counts || "")}</div></a>`; };
  writePage("bibliography", layout({ title: "Bibliography", activeHref: "/bibliography/", body: `<div class="page-head"><h1 class="page-title">Bibliography</h1><p class="page-subtitle">The 1,200-book annotated bibliography behind the <a href="/plan/">Five-Year Plan</a>.</p></div><div class="library-grid">${bibliography.map(biblCard).join("\n") || '<p class="empty-note">No entries yet.</p>'}</div>` }));
  for (const b of bibliography) {
    writePage(`bibliography/${b.slug}`, layout({ title: b.title, activeHref: "/bibliography/", body: `${backLink("Bibliography", "/bibliography/")}<article class="log detail"><header><h2>${esc(b.title)}</h2><div class="meta">${esc(b.counts || "")}</div></header>${commentable(`bibliography/${b.slug}`, b.html)}</article>` }));
  }

  /* ---------- standalone pages: start-here, how-i-built-this ---------- */
  for (const slug of ["start-here", "how-i-built-this"]) {
    const p = pageBySlug[slug];
    if (!p) continue;
    const navMatch = NAV.find((n) => n.href.includes(slug));
    writePage(slug, layout({
      title: p.title, activeHref: navMatch ? navMatch.href : "",
      body: `${backLink("Home", "/")}<article class="log page detail" data-log="page-${slug}"><header><h2>${esc(p.title)}</h2></header>${commentable(slug, p.html)}</article>`,
    }));
  }

  /* ---------- 404 ---------- */
  fs.writeFileSync(path.join(OUT, "404.html"), layout({
    title: "Not found", activeHref: "",
    body: `<section class="not-found"><h1 class="not-found-code">404</h1><p class="not-found-text">That page wandered off.</p><p><a class="not-found-back" href="/">← Back home</a></p></section>`,
  }));

  console.log(`Built: ${essays.length} essays, ${library.length} library, ${definitions.length} terms, ${topics.length} topics, ${scholars.length} scholars, ${ideas.length} ideas, ${zettels.length} zettels, ${bits.length} bits, ${semesters.length} semesters, ${bibliography.length} bibliography.`);
}

build();
