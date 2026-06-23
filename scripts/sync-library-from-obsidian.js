// Syncs library/books/*.md from the Obsidian "Frequentation" vault into
// content/library/*.md, matching the frontmatter + body shape build.js expects.
//
// Source of truth: the Obsidian vault (book pages built by
// _scripts/frequentation-library.js). This script is read-only on the vault
// and overwrites content/library/<slug>.md deterministically on every run.
//
// Usage: node scripts/sync-library-from-obsidian.js
// Vault path override: OBSIDIAN_VAULT=/path/to/vault node scripts/...

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const VAULT =
  process.env.OBSIDIAN_VAULT ||
  "/Users/polymath/Documents/SmartNotes Starter Kit";
const SRC = path.join(VAULT, "library", "books");
const DEST = path.join(__dirname, "..", "content", "library");

function unescapeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlInlineToMarkdown(s) {
  return unescapeEntities(
    String(s || "")
      .replace(/<span class="quote-close">.*?<\/span>/gs, "")
      .replace(/<a href="([^"]+)">(.*?)<\/a>/gs, "[$2]($1)")
      .replace(/<strong>(.*?)<\/strong>/gs, "**$1**")
      .replace(/<em>(.*?)<\/em>/gs, "*$1*")
  ).trim();
}

function extractResponses(body) {
  const section = body.split("<!-- FREQUENTATION:RESPONSES -->")[1];
  if (!section) return [];
  const articles = section.match(/<article class="response-card">.*?<\/article>/gs) || [];
  return articles.map((article) => {
    const title = htmlInlineToMarkdown(
      (article.match(/<h2 class="response-title">(.*?)<\/h2>/s) || [, ""])[1]
    );
    const quoteBlock = (article.match(/<blockquote class="quote">(.*?)<\/blockquote>/s) || [, ""])[1];
    const quote = htmlInlineToMarkdown(
      (quoteBlock.match(/<p>(.*?)<\/p>/s) || [, ""])[1]
    );
    const location = (quoteBlock.match(/<cite>(.*?)<\/cite>/s) || [, ""])[1];
    const afterBlockquote = article.split(/<\/blockquote>/s)[1] || "";
    const paragraphs = (afterBlockquote.match(/<p>(.*?)<\/p>/gs) || [])
      .map((p) => htmlInlineToMarkdown(p.replace(/^<p>/, "").replace(/<\/p>$/, "")))
      .filter(Boolean);
    return { title, quote, location, paragraphs };
  });
}

function renderEntry(frontmatter, responses) {
  const fm = [
    "---",
    `title: ${JSON.stringify(frontmatter.title)}`,
    `slug: ${frontmatter.slug}`,
    `author: ${JSON.stringify(frontmatter.author || "")}`,
    `highlights: ${frontmatter.highlights || 0}`,
    `responses: ${frontmatter.responses || 0}`,
    frontmatter.cover ? `cover: ${JSON.stringify(frontmatter.cover)}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const body = responses
    .map((r) => {
      const parts = [];
      if (responses.length > 1 && r.title) parts.push(`## ${r.title}`);
      parts.push(`> ${r.quote}`);
      if (r.location) parts.push(`*${r.location}*`);
      parts.push(...r.paragraphs);
      return parts.join("\n\n");
    })
    .join("\n\n---\n\n");

  return `${fm}\n\n${body}\n`;
}

function sync() {
  if (!fs.existsSync(SRC)) {
    console.error(`Vault library/books folder not found at: ${SRC}`);
    console.error("Set OBSIDIAN_VAULT to override the vault path.");
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md"));
  let created = 0,
    updated = 0,
    unchanged = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(SRC, file), "utf8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.slug || !fm.title) {
      console.warn(`Skipping ${file}: missing title/slug frontmatter`);
      continue;
    }
    const responses = extractResponses(body);
    const rendered = renderEntry(fm, responses);
    const destPath = path.join(DEST, `${fm.slug}.md`);
    const existing = fs.existsSync(destPath) ? fs.readFileSync(destPath, "utf8") : null;
    if (existing === rendered) {
      unchanged++;
    } else {
      fs.writeFileSync(destPath, rendered);
      if (existing === null) created++;
      else updated++;
    }
  }

  console.log(`Synced library from Obsidian: ${created} created, ${updated} updated, ${unchanged} unchanged.`);
}

sync();
