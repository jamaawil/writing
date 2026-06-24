// Syncs Essays, Bits, Ideas, Scholars, Topics, Dictionary terms, Zettel, and the
// Projects page from the Obsidian vault's Website/ folder into content/.
//
// The vault is the source of truth. On every run this script will:
//   - skip drafts (frontmatter `draft: true` or `publish: false`),
//   - convert Obsidian [[wikilinks]] in note bodies into real site links,
//   - prune content files whose vault note was deleted or renamed,
// so whatever is in Website/ is exactly what ends up on the site.
//
// Usage: node scripts/sync-content-from-obsidian.js
// Vault path override: OBSIDIAN_VAULT=/path/to/vault node scripts/...
// Disable deletion-pruning (extra-safe): NO_PRUNE=1 node scripts/...

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const VAULT =
  process.env.OBSIDIAN_VAULT ||
  "/Users/polymath/Documents/SmartNotes Starter Kit";
const WEBSITE_DIR = path.join(VAULT, "Website");
const REPO_ROOT = path.join(__dirname, "..");
const PRUNE = process.env.NO_PRUNE !== "1";

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// A note is private (kept off the site) if it opts out explicitly.
function isDraft(fm) {
  return fm.draft === true || fm.publish === false || fm.private === true;
}

// Collection types: one vault note per site content file.
const COLLECTIONS = [
  {
    label: "Essays", vaultFolder: "Essays", destFolder: "essays", requiredTitle: true,
    url: (s) => `/essay/${s}/`,
    fields: (fm, slug) => ({ title: fm.title, slug, date: fm.date, topics: fm.topics || [], favorite: !!fm.favorite, words: fm.words }),
  },
  {
    label: "Ideas", vaultFolder: "Ideas", destFolder: "ideas", requiredTitle: true,
    url: (s) => `/ideas/${s}/`,
    fields: (fm, slug) => ({ title: fm.title, slug, topics: fm.topics || [] }),
  },
  {
    label: "Scholars", vaultFolder: "Scholars", destFolder: "scholars", requiredTitle: true,
    url: (s) => `/scholars/${s}/`,
    fields: (fm, slug) => ({ title: fm.title, slug, era: fm.era, field: fm.field }),
  },
  {
    label: "Topics", vaultFolder: "Topics", destFolder: "topics", requiredTitle: true,
    url: (s) => `/topic/${s}/`,
    fields: (fm, slug) => ({ title: fm.title, slug }),
  },
  {
    label: "Dictionary", vaultFolder: "Dictionary", destFolder: "definitions", requiredTitle: true,
    url: (s) => `/dictionary/#word-${s}`,
    fields: (fm, slug) => ({ title: fm.title, slug, tagline: fm.tagline }),
  },
  {
    label: "Zettel", vaultFolder: "Zettel", destFolder: "zettel", requiredTitle: true,
    url: (s) => `/zettel/${s}/`,
    fields: (fm, slug, body) => ({ title: fm.title, slug, links: extractWikilinks(body) }),
  },
];

function noteSlug(fm, file) {
  return fm.slug || slugify(fm.title) || slugify(path.basename(file, ".md"));
}

// Extracts [[Wikilink]] targets, resolving [[Target|label]] and [[Target#heading]] to Target.
function extractWikilinks(body) {
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  const slugs = new Set();
  let m;
  while ((m = re.exec(body))) slugs.add(slugify(m[1].trim()));
  return [...slugs];
}

// Build a {slugified-key -> site URL} index across every publishable note so
// [[wikilinks]] can resolve regardless of whether they reference a title, slug,
// or filename. Drafts are intentionally left out so links to them degrade to text.
function buildLinkIndex() {
  const index = new Map();
  const add = (keys, url) => keys.filter(Boolean).forEach((k) => { if (!index.has(k)) index.set(k, url); });

  for (const def of COLLECTIONS) {
    const dir = path.join(WEBSITE_DIR, def.vaultFolder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_"))) {
      const { data: fm } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
      if (isDraft(fm) || (def.requiredTitle && !fm.title)) continue;
      const slug = noteSlug(fm, file);
      add([slugify(slug), slugify(fm.title), slugify(path.basename(file, ".md"))], def.url(slug));
    }
  }
  // Library books (synced separately) so essays can link to a book page.
  const booksDir = path.join(VAULT, "library", "books");
  if (fs.existsSync(booksDir)) {
    for (const file of fs.readdirSync(booksDir).filter((f) => f.endsWith(".md"))) {
      const { data: fm } = matter(fs.readFileSync(path.join(booksDir, file), "utf8"));
      if (!fm.slug || !fm.title) continue;
      add([slugify(fm.slug), slugify(fm.title), slugify(path.basename(file, ".md"))], `/library/${fm.slug}/`);
    }
  }
  return index;
}

function convertWikilinks(body, index) {
  return body.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    let target = inner, label = null;
    const pipe = inner.indexOf("|");
    if (pipe !== -1) { label = inner.slice(pipe + 1).trim(); target = inner.slice(0, pipe); }
    target = target.split("#")[0].trim();
    const text = label || target;
    const url = index.get(slugify(target));
    return url ? `[${text}](${url})` : text; // unresolved → plain text, never raw [[ ]]
  });
}

function yamlValue(v) {
  if (v instanceof Date) return JSON.stringify(v.toISOString().slice(0, 10));
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(String(v));
}
function buildFrontmatter(fields) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `---\n${lines.join("\n")}\n---`;
}
function writeIfChanged(destPath, contents, stats) {
  const existing = fs.existsSync(destPath) ? fs.readFileSync(destPath, "utf8") : null;
  if (existing === contents) { stats.unchanged++; return; }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, contents);
  if (existing === null) stats.created++;
  else stats.updated++;
}
// Delete content/<destFolder>/*.md whose slug is no longer produced by the vault.
function prune(destFolder, keep, stats) {
  if (!PRUNE) return;
  const destDir = path.join(REPO_ROOT, "content", destFolder);
  if (!fs.existsSync(destDir)) return;
  for (const file of fs.readdirSync(destDir).filter((f) => f.endsWith(".md"))) {
    if (!keep.has(path.basename(file, ".md"))) {
      fs.rmSync(path.join(destDir, file));
      stats.pruned++;
    }
  }
}

function syncCollection(def, index, stats) {
  const srcDir = path.join(WEBSITE_DIR, def.vaultFolder);
  if (!fs.existsSync(srcDir)) return;
  const destDir = path.join(REPO_ROOT, "content", def.destFolder);
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  const keep = new Set();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
    const { data: fm, content: body } = matter(raw);
    if (isDraft(fm)) { stats.drafts++; continue; }
    if (def.requiredTitle && !fm.title) { console.warn(`  skip ${def.label}/${file}: missing title`); stats.skipped++; continue; }
    const slug = noteSlug(fm, file);
    const fields = def.fields(fm, slug, body);
    const out = `${buildFrontmatter(fields)}\n\n${convertWikilinks(body, index).trim()}\n`;
    writeIfChanged(path.join(destDir, `${slug}.md`), out, stats);
    keep.add(slug);
  }
  prune(def.destFolder, keep, stats);
}

// Bits: no title/slug, just a date — filename (slugified) is the identity.
function syncBits(index, stats) {
  const srcDir = path.join(WEBSITE_DIR, "Bits");
  if (!fs.existsSync(srcDir)) return;
  const destDir = path.join(REPO_ROOT, "content", "bits");
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  const keep = new Set();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
    const { data: fm, content: body } = matter(raw);
    if (isDraft(fm)) { stats.drafts++; continue; }
    if (!fm.date) { console.warn(`  skip Bits/${file}: missing date`); stats.skipped++; continue; }
    const slug = slugify(path.basename(file, ".md"));
    const out = `${buildFrontmatter({ date: fm.date })}\n\n${convertWikilinks(body, index).trim()}\n`;
    writeIfChanged(path.join(destDir, `${slug}.md`), out, stats);
    keep.add(slug);
  }
  prune("bits", keep, stats);
}

// Projects: a single page — body replaces content/pages/projects.md's body while that
// file's own frontmatter (title/slug/nav_order) is preserved. Never pruned.
function syncProjectsPage(index, stats) {
  const srcPath = path.join(WEBSITE_DIR, "Projects.md");
  if (!fs.existsSync(srcPath)) return;
  const destPath = path.join(REPO_ROOT, "content", "pages", "projects.md");
  if (!fs.existsSync(destPath)) return;
  const { content: body } = matter(fs.readFileSync(srcPath, "utf8"));
  const { data: destFm } = matter(fs.readFileSync(destPath, "utf8"));
  const out = `${buildFrontmatter(destFm)}\n\n${convertWikilinks(body, index).trim()}\n`;
  writeIfChanged(destPath, out, stats);
}

function sync() {
  if (!fs.existsSync(WEBSITE_DIR)) {
    console.error(`Vault Website/ folder not found at: ${WEBSITE_DIR}`);
    console.error("Set OBSIDIAN_VAULT to your vault path, e.g.");
    console.error('  OBSIDIAN_VAULT="/Users/you/Documents/My Vault" node scripts/sync-content-from-obsidian.js');
    process.exit(1);
  }

  const index = buildLinkIndex();
  const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0, drafts: 0, pruned: 0 };
  for (const def of COLLECTIONS) syncCollection(def, index, stats);
  syncBits(index, stats);
  syncProjectsPage(index, stats);

  console.log(
    `Synced content from Obsidian: ${stats.created} created, ${stats.updated} updated, ` +
    `${stats.unchanged} unchanged, ${stats.pruned} pruned, ${stats.drafts} drafts skipped, ${stats.skipped} invalid skipped.`
  );
}

sync();
