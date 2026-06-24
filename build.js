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

// Filled in once Discussions + the giscus GitHub App are enabled on the repo
// and https://giscus.app's config tool has generated real IDs for it.
const GISCUS = {
  repo: "jamaawil/writing",
  repoId: "REPLACE_ME",
  category: "Comments",
  categoryId: "REPLACE_ME",
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
  { title: "All Essays", href: "/essays/", icon: ICONS.essays },
  { title: "Favorites", href: "/favorites/", icon: ICONS.favorites },
  { title: "Index", href: "/index-topics/", icon: ICONS.index },
  { title: "Library", href: "/library/", icon: ICONS.library },
  { title: "Dictionary of Terms", href: "/dictionary/", icon: ICONS.dictionary },
  { title: "Projects", href: "/projects/", icon: ICONS.projects },
  { title: "Bits", href: "/bits/", icon: ICONS.bits },
  { title: "Scholars", href: "/scholars/", icon: ICONS.scholars },
  { title: "Ideas", href: "/ideas/", icon: ICONS.ideas },
  { title: "Zettel", href: "/zettel/", icon: ICONS.zettel },
  { title: "Five-Year Plan", href: "/plan/", icon: ICONS.plan },
  { title: "Bibliography", href: "/bibliography/", icon: ICONS.bibliography },
];

const markdownPipeline = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeStringify);

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
  return (name || "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function layout({ title, activeHref, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${SITE_NAME}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;700&family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
<div class="layout">
<aside>
  <div class="aside-top">
    <div class="pfp-wrap"><img class="pfp" src="/images/profile.jpg" alt="${SITE_NAME}"></div>
    <h1>${SITE_NAME}</h1>
    <p class="bio">Architect-turned-writer. Building pattern languages, software, anthologies, and community for essayists.</p>
    <nav class="aside-nav">
      ${NAV.map(
        (n) =>
          `<a href="${n.href}"${n.href === activeHref ? ' class="active"' : ""}>${svgIcon(
            n.icon
          )}<span class="label">${n.title}</span></a>`
      ).join("\n      ")}
    </nav>
  </div>
  <div class="controls">
    <div class="ctrl-row">
      <button class="ctrl-btn" id="theme-toggle" title="Toggle theme">&#9680;</button>
      <button class="ctrl-btn" id="size-toggle" title="Adjust text size">Aa</button>
    </div>
  </div>
</aside>
<main>
${body}
<footer class="site-footer">
  <p>Built with a custom markdown pipeline.</p>
</footer>
</main>
</div>
<script src="/js/main.js"></script>
<script src="/js/zettel-graph.js"></script>
<script src="/js/comments.js"></script>
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
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function copyStatic() {
  for (const name of ["css", "js", "images"]) {
    const src = path.join(ROOT, "static", name);
    if (!fs.existsSync(src)) continue;
    copyDirRecursive(src, path.join(OUT, name));
  }
}

function bookCard(href, title, author, highlights, responses, cover) {
  return `<a class="card" href="${href}">
  <div class="cover-wrap">${cover ? `<img src="${cover}" alt="${title} cover" loading="lazy">` : title}</div>
  ${responses ? `<span class="badge" title="${responses} responses">${responses}</span>` : ""}
  <div class="title">${title}</div>
  <div class="subtitle">${author}</div>
  <div class="meta">${highlights} highlights</div>
</a>`;
}

function breadcrumb(label, href, all = true) {
  return `<p class="breadcrumb"><a href="${href}">← ${all ? "All " : ""}${label}</a></p>`;
}

function giscusEmbed(extraClass = "") {
  return `<div class="comment-box${extraClass ? " " + extraClass : ""}">
  <script src="https://giscus.app/client.js"
    data-repo="${GISCUS.repo}"
    data-repo-id="${GISCUS.repoId}"
    data-category="${GISCUS.category}"
    data-category-id="${GISCUS.categoryId}"
    data-mapping="pathname"
    data-strict="0"
    data-reactions-enabled="1"
    data-emit-metadata="0"
    data-input-position="top"
    data-theme="light"
    data-lang="en"
    crossorigin="anonymous"
    async>
  </script>
</div>`;
}

function planCardImg(s) {
  return s.image
    ? `<div class="plan-card-img"><img src="${s.image}" alt="${s.title}" loading="lazy"></div>`
    : `<div class="plan-card-img placeholder-img" aria-hidden="true"><span>Image placeholder</span></div>`;
}

// Resolves each zettel's `links` (slugs, from extractWikilinks in the sync script)
// against the full zettel set, mutating each entry with .outLinks/.inLinks (arrays of
// zettel objects) and .brokenLinks (slugs with no matching note yet — a normal forward
// reference in Zettelkasten use, not an error).
function resolveZettelGraph(zettels) {
  const bySlug = new Map(zettels.map((z) => [z.slug, z]));
  const backlinks = new Map(zettels.map((z) => [z.slug, []]));
  for (const z of zettels) {
    z.outLinks = [];
    z.brokenLinks = [];
    for (const targetSlug of z.links || []) {
      const target = bySlug.get(targetSlug);
      if (target) {
        z.outLinks.push(target);
        backlinks.get(targetSlug).push(z);
      } else {
        z.brokenLinks.push(targetSlug);
      }
    }
  }
  for (const z of zettels) z.inLinks = backlinks.get(z.slug) || [];
  return zettels;
}

function renderConnections(z) {
  const out = z.outLinks.length
    ? `<div class="zettel-links"><h3>Links to</h3><ul>${z.outLinks
        .map((t) => `<li><a href="/zettel/${t.slug}/">${t.title}</a></li>`)
        .join("")}</ul></div>`
    : "";
  const inb = z.inLinks.length
    ? `<div class="zettel-links zettel-backlinks"><h3>Linked from</h3><ul>${z.inLinks
        .map((t) => `<li><a href="/zettel/${t.slug}/">${t.title}</a></li>`)
        .join("")}</ul></div>`
    : "";
  return out + inb;
}

function scholarCard(href, name, era, field) {
  return `<a class="card" href="${href}">
  <div class="cover-wrap">${initials(name)}</div>
  <div class="title">${name}</div>
  <div class="subtitle">${field}</div>
  <div class="meta">${era}</div>
</a>`;
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyStatic();

  const essays = readMarkdownDir(path.join(CONTENT, "essays")).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const definitions = readMarkdownDir(path.join(CONTENT, "definitions")).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const library = readMarkdownDir(path.join(CONTENT, "library")).sort(
    (a, b) => (b.highlights || 0) - (a.highlights || 0)
  );
  const topics = readMarkdownDir(path.join(CONTENT, "topics")).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const scholars = readMarkdownDir(path.join(CONTENT, "scholars")).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const ideas = readMarkdownDir(path.join(CONTENT, "ideas")).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const zettels = resolveZettelGraph(
    readMarkdownDir(path.join(CONTENT, "zettel")).sort((a, b) => a.title.localeCompare(b.title))
  );
  const zettelGraph = {
    nodes: zettels.map((z) => ({ id: z.slug, title: z.title, href: `/zettel/${z.slug}/` })),
    edges: zettels.flatMap((z) => z.outLinks.map((t) => ({ source: z.slug, target: t.slug }))),
  };
  const zettelGraphScript = `<script type="application/json" id="zettel-graph-data">${JSON.stringify(
    zettelGraph
  ).replace(/<\/script>/gi, "<\\/script>")}</script>`;
  const bits = readMarkdownDir(path.join(CONTENT, "bits")).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const semesters = readMarkdownDir(path.join(CONTENT, "semesters")).sort(
    (a, b) => a.order - b.order
  );
  const bibliography = readMarkdownDir(path.join(CONTENT, "bibliography")).sort(
    (a, b) => a.order - b.order
  );
  const pages = readMarkdownDir(path.join(CONTENT, "pages"));
  const pageBySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));

  for (const essay of essays) {
    writePage(
      `essay/${essay.slug}`,
      layout({
        title: essay.title,
        activeHref: "/essays/",
        body: `${breadcrumb("Essays", "/essays/")}
<h1>${essay.title}</h1>
<p class="page-subtitle">${essay.date ? new Date(essay.date).toLocaleDateString() : ""}${
          essay.words ? ` · ${essay.words} words` : ""
        }</p>
<div class="commentable" data-page="essay/${essay.slug}">${essay.html}</div>`,
      })
    );
  }

  writePage(
    "essays",
    layout({
      title: "All Essays",
      activeHref: "/essays/",
      body: `<div class="page-header"><div><h1 class="page-title">All Essays</h1></div></div>
${giscusEmbed("comment-box--corner")}
<ul class="essay-list">
${essays
  .map(
    (e) =>
      `  <li><a href="/essay/${e.slug}/">${e.title}</a><span class="wc">${
        e.words ? e.words + " words" : ""
      }</span></li>`
  )
  .join("\n")}
</ul>`,
    })
  );

  const favorites = essays.filter((e) => e.favorite);
  writePage(
    "favorites",
    layout({
      title: "Favorites",
      activeHref: "/favorites/",
      body: `<div class="page-header"><div><h1 class="page-title">Favorites</h1><p class="page-subtitle">A short, curated list of essays worth reading first.</p></div></div>
<ul class="essay-list">
${favorites.map((e) => `  <li><a href="/essay/${e.slug}/">${e.title}</a></li>`).join("\n")}
</ul>`,
    })
  );

  writePage(
    "index-topics",
    layout({
      title: "Index",
      activeHref: "/index-topics/",
      body: `<div class="page-header"><div><h1 class="page-title">Index</h1><p class="page-subtitle">Essays organized by topic.</p></div></div>
${topics
  .map((t) => {
    const inTopic = essays.filter((e) => (e.topics || []).includes(t.slug));
    return `<div class="topic-group">
  <h2>${t.title}</h2>
  <ul class="essay-list">
${inTopic.map((e) => `    <li><a href="/essay/${e.slug}/">${e.title}</a></li>`).join("\n")}
  </ul>
</div>`;
  })
  .join("\n")}`,
    })
  );

  for (const entry of library) {
    writePage(
      `library/${entry.slug}`,
      layout({
        title: entry.title,
        activeHref: "/library/",
        body: `${breadcrumb("Library", "/library/")}
<h1>${entry.title}</h1>
<p class="page-subtitle">${entry.author || ""}</p>
<div class="commentable" data-page="library/${entry.slug}">${entry.html}</div>`,
      })
    );
  }
  writePage(
    "library",
    layout({
      title: "Library",
      activeHref: "/library/",
      body: `<div class="page-header"><div><h1 class="page-title">Library</h1><p class="page-subtitle">Highlights and responses, organized by source.</p></div></div>
<div class="card-grid">
${library
  .map((e) =>
    bookCard(`/library/${e.slug}/`, e.title, e.author, e.highlights || 0, e.responses, e.cover)
  )
  .join("\n")}
</div>`,
    })
  );

  writePage(
    "dictionary",
    layout({
      title: "Dictionary of Terms",
      activeHref: "/dictionary/",
      body: `<div class="page-header"><div><h1 class="page-title">Dictionary of Terms</h1><p class="page-subtitle">Definitions for terms used often in this writing.</p></div></div>
${definitions
  .map(
    (d) =>
      `<div class="dict-term"><h2>${d.title}</h2>${
        d.tagline ? `<p class="page-subtitle">${d.tagline}</p>` : ""
      }${d.html}</div>`
  )
  .join("\n")}`,
    })
  );

  writePage(
    "bits",
    layout({
      title: "Bits",
      activeHref: "/bits/",
      body: `<div class="page-header"><div><h1 class="page-title">Bits</h1><p class="page-subtitle">Short notes — somewhere between a tweet and an essay.</p></div></div>
${bits
  .map(
    (b) =>
      `<div class="bit"><div class="bit-date">${
        b.date ? new Date(b.date).toLocaleDateString() : ""
      }</div>${b.html}</div>`
  )
  .join("\n")}`,
    })
  );

  writePage(
    "scholars",
    layout({
      title: "Scholars",
      activeHref: "/scholars/",
      body: `<div class="page-header"><div><h1 class="page-title">Scholars</h1><p class="page-subtitle">Thinkers worth returning to.</p></div></div>
<div class="card-grid">
${scholars
  .map((s) => scholarCard(`/scholars/${s.slug}/`, s.title, s.era, s.field))
  .join("\n")}
</div>`,
    })
  );
  for (const s of scholars) {
    writePage(
      `scholars/${s.slug}`,
      layout({
        title: s.title,
        activeHref: "/scholars/",
        body: `${breadcrumb("Scholars", "/scholars/")}
<h1>${s.title}</h1>
<p class="page-subtitle">${s.field || ""} · ${s.era || ""}</p>
${s.html}`,
      })
    );
  }

  writePage(
    "ideas",
    layout({
      title: "Ideas",
      activeHref: "/ideas/",
      body: `<div class="page-header"><div><h1 class="page-title">Ideas</h1><p class="page-subtitle">Threads worth pulling on.</p></div></div>
${ideas
  .map((i) => `<div class="topic-group"><h2><a href="/ideas/${i.slug}/">${i.title}</a></h2>${i.html}</div>`)
  .join("\n")}`,
    })
  );
  for (const i of ideas) {
    writePage(
      `ideas/${i.slug}`,
      layout({
        title: i.title,
        activeHref: "/ideas/",
        body: `${breadcrumb("Ideas", "/ideas/")}\n<h1>${i.title}</h1>\n${i.html}`,
      })
    );
  }

  writePage(
    "zettel",
    layout({
      title: "Zettel",
      activeHref: "/zettel/",
      body: `<div class="page-header"><div><h1 class="page-title">Zettel</h1><p class="page-subtitle">Atomic notes, linked.</p></div></div>
<div id="zettel-graph"></div>
${zettels
  .map(
    (z) => `<div class="topic-group">
  <h2><a href="/zettel/${z.slug}/">${z.title}</a></h2>
  ${z.html}
  ${renderConnections(z)}
</div>`
  )
  .join("\n")}
${zettelGraphScript}`,
    })
  );
  for (const z of zettels) {
    writePage(
      `zettel/${z.slug}`,
      layout({
        title: z.title,
        activeHref: "/zettel/",
        body: `${breadcrumb("Zettel", "/zettel/")}
<div id="zettel-graph" data-current="${z.slug}"></div>
<h1>${z.title}</h1>
${z.html}
${renderConnections(z)}
${zettelGraphScript}`,
      })
    );
  }

  writePage(
    "plan",
    layout({
      title: "Five-Year Plan",
      activeHref: "/plan/",
      body: `<div class="page-header"><div><h1 class="page-title">Five-Year Plan</h1><p class="page-subtitle">The Braided Reading EPUB — a 5-year integrated MA+PhD curriculum across Communication, AI, IP Law, and Social Equity, braided with extracurricular reading. See the <a href="/bibliography/">full 1,200-book bibliography</a> this is drawn from.</p></div></div>
${semesters
  .map(
    (s) => `<div class="plan-card">
  ${planCardImg(s)}
  <div class="plan-card-body">
    <h2><a href="/plan/${s.slug}/">${s.title}</a></h2>
    <p class="page-subtitle">${s.dateRange || ""}</p>
    <p>${s.intro || ""}</p>
    <div class="tag-row">${(s.pillars || []).map((p) => `<span class="tag">${p}</span>`).join("")}</div>
  </div>
</div>`
  )
  .join("\n")}`,
    })
  );
  for (const s of semesters) {
    writePage(
      `plan/${s.slug}`,
      layout({
        title: s.title,
        activeHref: "/plan/",
        body: `${breadcrumb("Five-Year Plan", "/plan/", false)}
<div class="page-header"><div><h1 class="page-title">${s.title}</h1><p class="page-subtitle">${
          s.dateRange || ""
        }</p><p>${s.intro || ""}</p></div></div>
${s.html}`,
      })
    );
  }

  writePage(
    "bibliography",
    layout({
      title: "Bibliography",
      activeHref: "/bibliography/",
      body: `<div class="page-header"><div><h1 class="page-title">Bibliography</h1><p class="page-subtitle">The 1,200-book annotated bibliography behind the <a href="/plan/">Five-Year Plan</a>, organized by category.</p></div></div>
<div class="card-grid">
${bibliography
  .map(
    (b) =>
      `<a class="card" href="/bibliography/${b.slug}/">
  <div class="cover-wrap">${initials(b.title)}</div>
  <div class="title">${b.title}</div>
  <div class="meta">${b.counts || ""}</div>
</a>`
  )
  .join("\n")}
</div>`,
    })
  );
  for (const b of bibliography) {
    writePage(
      `bibliography/${b.slug}`,
      layout({
        title: b.title,
        activeHref: "/bibliography/",
        body: `${breadcrumb("Bibliography", "/bibliography/")}
<div class="page-header"><div><h1 class="page-title">${b.title}</h1><p class="page-subtitle">${
          b.counts || ""
        }</p></div></div>
${b.html}`,
      })
    );
  }

  for (const slug of ["start-here", "projects"]) {
    const p = pageBySlug[slug];
    if (!p) continue;
    const navMatch = NAV.find((n) => n.href.includes(slug));
    writePage(
      slug,
      layout({
        title: p.title,
        activeHref: navMatch ? navMatch.href : "",
        body: `<h1>${p.title}</h1>\n${p.html}`,
      })
    );
  }

  const home = pageBySlug["home"];
  writePage(
    "",
    layout({
      title: "Home",
      activeHref: "/essays/",
      body: `${home ? home.html : ""}
<div class="plan-feed">
${semesters
  .map(
    (s) => `<div class="plan-card">
  ${planCardImg(s)}
  <div class="plan-card-body">
    <h2><a href="/plan/${s.slug}/">${s.title}</a></h2>
    <p class="page-subtitle">${s.dateRange || ""}</p>
    <p>${s.intro || ""}</p>
    <div class="tag-row">${(s.pillars || []).map((p) => `<span class="tag">${p}</span>`).join("")}</div>
  </div>
</div>`
  )
  .join("\n")}
</div>`,
    })
  );

  console.log(
    `Built ${essays.length} essays, ${library.length} library entries, ${definitions.length} terms, ${scholars.length} scholars, ${ideas.length} ideas, ${zettels.length} zettels, ${bits.length} bits, ${semesters.length} semesters, ${bibliography.length} bibliography categories.`
  );
}

build();
