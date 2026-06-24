// Syncs Essays, Bits, Ideas, Scholars, Topics, Dictionary terms, and the
// Projects page from the Obsidian vault's Website/ folder into content/.
//
// Unlike sync-library-from-obsidian.js (which reverse-engineers HTML built by
// the Frequentation script), these note types are authored directly in the
// vault using templates that already match the site's frontmatter, so syncing
// is mostly copy + validate, not reconstruction.
//
// Usage: node scripts/sync-content-from-obsidian.js
// Vault path override: OBSIDIAN_VAULT=/path/to/vault node scripts/...

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const VAULT =
  process.env.OBSIDIAN_VAULT ||
  "/Users/polymath/Documents/SmartNotes Starter Kit";
const WEBSITE_DIR = path.join(VAULT, "Website");
const REPO_ROOT = path.join(__dirname, "..");

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

// Extracts [[Wikilink]] targets from a note body, resolving [[Target|shown text]] and
// [[Target#heading]] to just Target, then slugifying — relies on the linked note's
// filename/title matching Target exactly, the same convention Obsidian's own
// autocomplete already encourages.
function extractWikilinks(body) {
  const re = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;
  const slugs = new Set();
  let m;
  while ((m = re.exec(body))) slugs.add(slugify(m[1].trim()));
  return [...slugs];
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
  if (existing === contents) {
    stats.unchanged++;
    return;
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, contents);
  if (existing === null) stats.created++;
  else stats.updated++;
}

// Collection types: one vault note per site content file.
const COLLECTIONS = [
  {
    label: "Essays",
    vaultFolder: "Essays",
    destFolder: "essays",
    requiredTitle: true,
    fields: (fm, slug) => ({
      title: fm.title,
      slug,
      date: fm.date,
      topics: fm.topics || [],
      favorite: !!fm.favorite,
      words: fm.words,
    }),
  },
  {
    label: "Ideas",
    vaultFolder: "Ideas",
    destFolder: "ideas",
    requiredTitle: true,
    fields: (fm, slug) => ({
      title: fm.title,
      slug,
      topics: fm.topics || [],
    }),
  },
  {
    label: "Scholars",
    vaultFolder: "Scholars",
    destFolder: "scholars",
    requiredTitle: true,
    fields: (fm, slug) => ({
      title: fm.title,
      slug,
      era: fm.era,
      field: fm.field,
    }),
  },
  {
    label: "Topics",
    vaultFolder: "Topics",
    destFolder: "topics",
    requiredTitle: true,
    fields: (fm, slug) => ({
      title: fm.title,
      slug,
    }),
  },
  {
    label: "Dictionary",
    vaultFolder: "Dictionary",
    destFolder: "definitions",
    requiredTitle: true,
    fields: (fm, slug) => ({
      title: fm.title,
      slug,
      tagline: fm.tagline,
    }),
  },
  {
    label: "Zettel",
    vaultFolder: "Zettel",
    destFolder: "zettel",
    requiredTitle: true,
    fields: (fm, slug, body) => ({
      title: fm.title,
      slug,
      links: extractWikilinks(body),
    }),
  },
];

function syncCollection(def, stats) {
  const srcDir = path.join(WEBSITE_DIR, def.vaultFolder);
  if (!fs.existsSync(srcDir)) return;
  const destDir = path.join(REPO_ROOT, "content", def.destFolder);
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
    const { data: fm, content: body } = matter(raw);
    if (def.requiredTitle && !fm.title) {
      console.warn(`  skip ${def.label}/${file}: missing title`);
      stats.skipped++;
      continue;
    }
    const slug = fm.slug || slugify(fm.title) || slugify(path.basename(file, ".md"));
    const fields = def.fields(fm, slug, body);
    const out = `${buildFrontmatter(fields)}\n\n${body.trim()}\n`;
    writeIfChanged(path.join(destDir, `${slug}.md`), out, stats);
  }
}

// Bits: no title/slug, just a date — filename (slugified) is the identity.
function syncBits(stats) {
  const srcDir = path.join(WEBSITE_DIR, "Bits");
  if (!fs.existsSync(srcDir)) return;
  const destDir = path.join(REPO_ROOT, "content", "bits");
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
    const { data: fm, content: body } = matter(raw);
    if (!fm.date) {
      console.warn(`  skip Bits/${file}: missing date`);
      stats.skipped++;
      continue;
    }
    const slug = slugify(path.basename(file, ".md"));
    const out = `${buildFrontmatter({ date: fm.date })}\n\n${body.trim()}\n`;
    writeIfChanged(path.join(destDir, `${slug}.md`), out, stats);
  }
}

// Projects: a single page, not a collection — body replaces content/pages/projects.md's
// body while that file's own frontmatter (title/slug/nav_order) is preserved.
function syncProjectsPage(stats) {
  const srcPath = path.join(WEBSITE_DIR, "Projects.md");
  if (!fs.existsSync(srcPath)) return;
  const destPath = path.join(REPO_ROOT, "content", "pages", "projects.md");
  const { content: body } = matter(fs.readFileSync(srcPath, "utf8"));
  const existingRaw = fs.readFileSync(destPath, "utf8");
  const { data: destFm } = matter(existingRaw);
  const out = `${buildFrontmatter(destFm)}\n\n${body.trim()}\n`;
  writeIfChanged(destPath, out, stats);
}

function sync() {
  if (!fs.existsSync(WEBSITE_DIR)) {
    console.error(`Vault Website/ folder not found at: ${WEBSITE_DIR}`);
    console.error("Set OBSIDIAN_VAULT to override the vault path.");
    process.exit(1);
  }

  const stats = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const def of COLLECTIONS) syncCollection(def, stats);
  syncBits(stats);
  syncProjectsPage(stats);

  console.log(
    `Synced content from Obsidian: ${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.skipped} skipped.`
  );
}

sync();
