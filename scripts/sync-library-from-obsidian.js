// Syncs library/books/*.md (Readwise highlights + your written responses,
// built by the vault's _scripts/frequentation.js) into content/library/*.md,
// matching the frontmatter + body shape build.js expects.
//
// Source of truth: the Obsidian vault. This script is read-only on the vault
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
const PRUNE = process.env.NO_PRUNE !== "1";

function stripMarkers(s) {
  return s.replace(/<!--\s*rw:\d+\s*-->/g, "").trim();
}

// Each highlight is a "---"-separated block:
//   > quote text (possibly multi-line)
//   *Location N* <!-- rw:ID -->
//
//   optional response paragraph(s), written by hand in Obsidian
function parseHighlightBlocks(body) {
  return body
    .split(/\n-{3,}\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const quoteLines = [];
      let i = 0;
      while (i < lines.length && lines[i].startsWith(">") && !lines[i].startsWith("> [!")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const quote = quoteLines.join("\n").trim();
      const rest = lines.slice(i).join("\n");
      const citeMatch = rest.match(/^\s*<cite>(.*?)<\/cite>/m);
      const citation = citeMatch ? stripMarkers(citeMatch[1]) : null;
      const afterCite = citeMatch ? rest.slice(rest.indexOf(citeMatch[0]) + citeMatch[0].length) : rest;
      // Drop any blockquote/callout lines (e.g. the "Your Readwise note" aside)
      // from the response — only plain paragraph text counts as a response.
      const responseLines = afterCite.split("\n").filter((l) => !l.trim().startsWith(">"));
      const response = stripMarkers(responseLines.join("\n")).trim();
      return { quote, citation, response };
    })
    .filter((h) => h.quote);
}

function renderEntry(fm, highlights) {
  const fmLines = [
    "---",
    `title: ${JSON.stringify(fm.title)}`,
    `slug: ${fm.slug}`,
    `author: ${JSON.stringify(fm.author || "")}`,
    `highlights: ${highlights.length}`,
    `responses: ${highlights.filter((h) => h.response).length}`,
    fm.cover ? `cover: ${JSON.stringify(fm.cover)}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const body = highlights
    .map((h) => {
      const parts = [`> ${h.quote}`];
      if (h.citation) parts.push(`<cite>${h.citation}</cite>`);
      if (h.response) parts.push(h.response);
      return parts.join("\n\n");
    })
    .join("\n\n---\n\n");

  return `${fmLines}\n\n${body}\n`;
}

function sync() {
  if (!fs.existsSync(SRC)) {
    console.error(`Vault library/books folder not found at: ${SRC}`);
    console.error("Set OBSIDIAN_VAULT to override the vault path.");
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  let created = 0,
    updated = 0,
    unchanged = 0,
    pruned = 0;
  const keep = new Set();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(SRC, file), "utf8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.title) {
      console.warn(`Skipping ${file}: missing title frontmatter`);
      continue;
    }
    const slug = fm.slug || path.basename(file, ".md");
    const highlights = parseHighlightBlocks(body);
    const rendered = renderEntry({ ...fm, slug }, highlights);
    const destPath = path.join(DEST, `${slug}.md`);
    const existing = fs.existsSync(destPath) ? fs.readFileSync(destPath, "utf8") : null;
    if (existing === rendered) {
      unchanged++;
    } else {
      fs.writeFileSync(destPath, rendered);
      if (existing === null) created++;
      else updated++;
    }
    keep.add(slug);
  }

  // Prune library entries whose source book was removed/renamed in the vault.
  if (PRUNE) {
    for (const file of fs.readdirSync(DEST).filter((f) => f.endsWith(".md"))) {
      if (!keep.has(path.basename(file, ".md"))) {
        fs.rmSync(path.join(DEST, file));
        pruned++;
      }
    }
  }

  console.log(`Synced library from Obsidian: ${created} created, ${updated} updated, ${unchanged} unchanged, ${pruned} pruned.`);
}

sync();
