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

const NAV = [
  { title: "Start Here", href: "/start-here/" },
  { title: "All Essays", href: "/essays/" },
  { title: "Favorites", href: "/favorites/" },
  { title: "Index", href: "/index-topics/" },
  { title: "Library", href: "/library/" },
  { title: "Dictionary", href: "/dictionary/" },
  { title: "Projects", href: "/projects/" },
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

function layout({ title, activeHref, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Michael's Writing</title>
<link rel="stylesheet" href="/css/style.css">
</head>
<body>
<div class="wrap">
<header class="site-header">
  <a class="site-title" href="/">Your Name</a>
  <nav class="site-nav">
    ${NAV.map(
      (n) =>
        `<a href="${n.href}"${n.href === activeHref ? ' class="active"' : ""}>${n.title}</a>`
    ).join("\n    ")}
  </nav>
  <div class="controls">
    <button id="aa-toggle" title="Adjust text size">Aa</button>
    <button id="theme-toggle" title="Toggle dark mode">&#9680;</button>
  </div>
</header>
<main>
${body}
</main>
<footer class="site-footer">
  <p>Built with a custom markdown pipeline. See <a href="/how-i-built-this/">How I Built This</a>.</p>
</footer>
</div>
<script src="/js/main.js"></script>
</body>
</html>
`;
}

function writePage(relDir, html) {
  const dir = path.join(OUT, relDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

function copyStatic() {
  const srcCss = path.join(ROOT, "static/css");
  const srcJs = path.join(ROOT, "static/js");
  const srcImg = path.join(ROOT, "static/images");
  for (const [src, destName] of [
    [srcCss, "css"],
    [srcJs, "js"],
    [srcImg, "images"],
  ]) {
    if (!fs.existsSync(src)) continue;
    const dest = path.join(OUT, destName);
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(src)) {
      fs.copyFileSync(path.join(src, f), path.join(dest, f));
    }
  }
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  copyStatic();

  const essays = readMarkdownDir(path.join(CONTENT, "essays")).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const definitions = readMarkdownDir(path.join(CONTENT, "definitions")).sort(
    (a, b) => a.title.localeCompare(b.title)
  );
  const library = readMarkdownDir(path.join(CONTENT, "library")).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const topics = readMarkdownDir(path.join(CONTENT, "topics")).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  const pages = readMarkdownDir(path.join(CONTENT, "pages"));
  const pageBySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));

  // Individual essay pages
  for (const essay of essays) {
    writePage(
      `essay/${essay.slug}`,
      layout({
        title: essay.title,
        activeHref: "/essays/",
        body: `<h1>${essay.title}</h1>
<p class="meta">${essay.date ? new Date(essay.date).toLocaleDateString() : ""}${
          essay.words ? ` · ${essay.words} words` : ""
        }</p>
${essay.html}`,
      })
    );
  }

  // All Essays
  writePage(
    "essays",
    layout({
      title: "All Essays",
      activeHref: "/essays/",
      body: `<h1>All Essays</h1>
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

  // Favorites
  const favorites = essays.filter((e) => e.favorite);
  writePage(
    "favorites",
    layout({
      title: "Favorites",
      activeHref: "/favorites/",
      body: `<h1>Favorites</h1>
${pageBySlug["favorites"] ? pageBySlug["favorites"].html : ""}
<ul class="essay-list">
${favorites
  .map((e) => `  <li><a href="/essay/${e.slug}/">${e.title}</a></li>`)
  .join("\n")}
</ul>`,
    })
  );

  // Index (by topic)
  writePage(
    "index-topics",
    layout({
      title: "Index",
      activeHref: "/index-topics/",
      body: `<h1>Index</h1>
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

  // Library
  for (const entry of library) {
    writePage(
      `library/${entry.slug}`,
      layout({
        title: entry.title,
        activeHref: "/library/",
        body: `<h1>${entry.title}</h1>
<p class="meta">${entry.source || ""}</p>
${entry.html}`,
      })
    );
  }
  writePage(
    "library",
    layout({
      title: "Library",
      activeHref: "/library/",
      body: `<h1>Library</h1>
<ul class="essay-list">
${library
  .map(
    (e) =>
      `  <li><a href="/library/${e.slug}/">${e.title}</a><span class="wc">${e.source || ""}</span></li>`
  )
  .join("\n")}
</ul>`,
    })
  );

  // Dictionary
  writePage(
    "dictionary",
    layout({
      title: "Dictionary",
      activeHref: "/dictionary/",
      body: `<h1>Dictionary</h1>
${definitions
  .map((d) => `<h2>${d.title}</h2>\n${d.html}`)
  .join("\n")}`,
    })
  );

  // Static pages: Start Here, Projects, How I Built This
  for (const slug of ["start-here", "projects", "how-i-built-this"]) {
    const p = pageBySlug[slug];
    if (!p) continue;
    writePage(
      slug,
      layout({
        title: p.title,
        activeHref: NAV.find((n) => n.href.includes(slug))?.href || "",
        body: `<h1>${p.title}</h1>\n${p.html}`,
      })
    );
  }

  // Home
  const home = pageBySlug["home"];
  writePage(
    "",
    layout({
      title: "Home",
      activeHref: "",
      body: `${home ? home.html : ""}
<ul class="essay-list">
${essays
  .slice(0, 10)
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

  console.log(`Built ${essays.length} essays, ${library.length} library notes, ${definitions.length} terms.`);
}

build();
