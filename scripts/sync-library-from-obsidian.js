// Syncs library/books/*.md (Readwise highlights + your written responses,
// built by the vault's _scripts/frequentation.js) into content/library/*.md,
// matching the frontmatter + body shape build.js expects.
//
// Source of truth: the Obsidian vault. This script is read-only on the vault
// and overwrites content/library/<slug>.md deterministically on every run.
//
// Usage: node scripts/sync-library-from-obsidian.js
// Vault path override: OBSIDIAN_VAULT=/path/to/vault node scripts/...
//
// API key for claim-title generation (one of):
//   - PERPLEXITY_API_KEY environment variable
//   - module.exports = { PERPLEXITY_API_KEY: "..." } in <vault>/_scripts/api-config.js

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const matter = require("gray-matter");

const VAULT =
  process.env.OBSIDIAN_VAULT ||
  "/Users/polymath/Documents/SmartNotes Starter Kit";
const SRC = path.join(VAULT, "library", "books");
const DEST = path.join(__dirname, "..", "content", "library");
const PRUNE = process.env.NO_PRUNE !== "1";
const CACHE_PATH = path.join(__dirname, ".claim-cache.json");

// ── API key ──────────────────────────────────────────────────────────────────

function getApiKey() {
  if (process.env.PERPLEXITY_API_KEY) return process.env.PERPLEXITY_API_KEY;
  const configPath = path.join(VAULT, "_scripts", "api-config.js");
  if (fs.existsSync(configPath)) {
    try { return require(configPath).PERPLEXITY_API_KEY || null; } catch {}
  }
  return null;
}

// ── Claim-title cache ─────────────────────────────────────────────────────────

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")); } catch { return {}; }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

function cacheKey(rwId, quote) {
  if (rwId) return `rw:${rwId}`;
  return `q:${crypto.createHash("sha1").update(quote.slice(0, 200)).digest("hex").slice(0, 12)}`;
}

// ── AI claim generation ───────────────────────────────────────────────────────

function cleanClaim(raw) {
  return raw
    .trim()
    .replace(/\(.*?\)/gs, "")                        // strip parenthetical reasoning (Wait — ...) etc.
    .replace(/\[\d+\]/g, "")                         // strip citation markers [1], [12]
    .replace(/\[highlight\]/gi, "")
    .replace(/\*+/g, "")                             // strip bold/italic markdown
    .replace(/\b(Wait|Note|However|But)[,\s—].*/gi, "") // strip self-correction leakage
    .split(/(?<=[.!?])\s/)[0]                        // take only first sentence
    .replace(/^["']|["']$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function generateClaimTitle(quote, apiKey) {
  const resp = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar",
      max_tokens: 40,
      messages: [
        {
          role: "system",
          content: "You output ONLY the requested claim — one declarative sentence, nothing else. No reasoning, no self-correction, no parenthetical notes, no commentary about the rules.",
        },
        {
          role: "user",
          content: `Write a one-sentence factual claim (under 12 words) based on this highlight. Start with the real subject — not "This chapter", "This highlight", "The author", or "The passage". State only what the highlight says as fact.\n\nHighlight: "${quote}"`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Perplexity API ${resp.status}: ${err}`);
  }

  const data = await resp.json();
  return cleanClaim(data.choices[0].message.content);
}

// ── Markdown parsing ──────────────────────────────────────────────────────────

function stripMarkers(s) {
  return s
    .replace(/<!--\s*rw:\d+\s*-->/g, "")
    .replace(/%%[\s\S]*?%%/g, "")
    .trim();
}

// Returns { claimTitle, text, next } or null if lines[i] isn't the expected callout type.
function readCallout(lines, i, type) {
  const m = (lines[i] || "").match(new RegExp(`^>\\s*\\[!${type}\\]\\s*(.*)$`, "i"));
  if (!m) return null;
  const claimTitle = m[1].trim() || null;
  i++;
  const body = [];
  while (i < lines.length && lines[i].startsWith(">") && !/^>\s*\[!/.test(lines[i])) {
    body.push(lines[i].replace(/^>\s?/, ""));
    i++;
  }
  return { claimTitle, text: stripMarkers(body.join("\n")).trim(), next: i };
}

// Each highlight is a "---"-separated block:
//   > [!quote] optional existing claim title
//   > quote text (possibly multi-line)
//   <cite>Author, Title, Location N</cite> <!-- rw:ID -->
//
//   > [!Response]
//   > your response (optional — may be empty)
function parseHighlightBlocks(body) {
  return body
    .split(/\n-{3,}\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const quoteCallout = readCallout(lines, 0, "quote");
      const quote = quoteCallout ? quoteCallout.text : "";
      const claimTitle = quoteCallout ? quoteCallout.claimTitle : null;
      let i = quoteCallout ? quoteCallout.next : 0;
      while (i < lines.length && lines[i].trim() === "") i++;
      const citeRaw = lines[i] || "";
      const citeMatch = citeRaw.match(/^\s*<cite>(.*?)<\/cite>/);
      const rwIdMatch = citeRaw.match(/<!--\s*rw:(\d+)\s*-->/);
      const rwId = rwIdMatch ? rwIdMatch[1] : null;
      const citation = citeMatch ? stripMarkers(citeMatch[1]) : null;
      if (citeMatch) i++;
      while (i < lines.length && lines[i].trim() === "") i++;
      const responseCallout = readCallout(lines, i, "response");
      const response = responseCallout ? responseCallout.text : "";
      return { quote, claimTitle, rwId, citation, response };
    })
    .filter((h) => h.quote);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderEntry(fm, highlights) {
  const fmLines = [
    "---",
    `title: ${JSON.stringify(fm.title)}`,
    `slug: ${fm.slug}`,
    `author: ${JSON.stringify(fm.author || "")}`,
    `highlights: ${highlights.length}`,
    `responses: ${highlights.filter((h) => h.response).length}`,
    fm.cover ? `cover: ${JSON.stringify(fm.cover)}` : null,
    fm.first_highlight != null ? `first_highlight: ${JSON.stringify(fm.first_highlight)}` : null,
    fm.last_highlight != null ? `last_highlight: ${JSON.stringify(fm.last_highlight)}` : null,
    fm.last_note != null ? `last_note: ${JSON.stringify(fm.last_note)}` : null,
    "---",
  ]
    .filter(Boolean)
    .join("\n");

  const body = highlights
    .map((h) => {
      const quoteLine = h.claimTitle ? `> [!quote] ${h.claimTitle}` : `> [!quote]`;
      const quoteBlock = [quoteLine, ...h.quote.split("\n").map((l) => `> ${l}`)].join("\n");
      const parts = [quoteBlock];
      if (h.citation) parts.push(`<cite>${h.citation}</cite>`);
      const responseBody = h.response
        ? h.response.split("\n").map((l) => `> ${l}`).join("\n")
        : "> ";
      parts.push(`> [!Response]\n${responseBody}`);
      return parts.join("\n\n");
    })
    .join("\n\n---\n\n");

  return `${fmLines}\n\n${body}\n`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function sync() {
  if (!fs.existsSync(SRC)) {
    console.error(`Vault library/books folder not found at: ${SRC}`);
    console.error("Set OBSIDIAN_VAULT to override the vault path.");
    process.exit(1);
  }
  fs.mkdirSync(DEST, { recursive: true });

  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("No PERPLEXITY_API_KEY — claim titles will not be generated.");
    console.warn("Set PERPLEXITY_API_KEY env var, or add it to <vault>/_scripts/api-config.js:");
    console.warn('  module.exports = { PERPLEXITY_API_KEY: "pplx-..." };');
  }

  const cache = loadCache();
  let generated = 0;

  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  let created = 0, updated = 0, unchanged = 0, pruned = 0;
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

    // Preserve any responses the user wrote directly in the content file
    const destPath = path.join(DEST, `${slug}.md`);
    if (fs.existsSync(destPath)) {
      const { content: existingBody } = matter(fs.readFileSync(destPath, "utf8"));
      const existingHighlights = parseHighlightBlocks(existingBody);
      const savedResponses = {};
      for (const eh of existingHighlights) {
        if (eh.response) {
          const key = eh.rwId ? `rw:${eh.rwId}` : eh.quote.slice(0, 120);
          savedResponses[key] = eh.response;
        }
      }
      for (const h of highlights) {
        if (!h.response) {
          const key = h.rwId ? `rw:${h.rwId}` : h.quote.slice(0, 120);
          if (savedResponses[key]) h.response = savedResponses[key];
        }
      }
    }

    // Auto-compute dates from file timestamps (Readwise updates mtime on every sync)
    const stat = fs.statSync(path.join(SRC, file));
    const toDateStr = (d) => d.toISOString().slice(0, 10);
    fm.last_highlight = toDateStr(stat.mtime);
    fm.first_highlight = toDateStr(stat.birthtime && stat.birthtime < stat.mtime ? stat.birthtime : stat.mtime);
    fm.last_note = highlights.some((h) => h.response) ? toDateStr(stat.mtime) : (fm.last_note || "");

    for (const h of highlights) {
      if (!h.quote) continue;
      // Vault already has a claim title (written by frequentation.js) — use it
      if (h.claimTitle) continue;
      // Fallback: check cache, then generate (for highlights not pulled via frequentation)
      if (!apiKey) continue;
      const key = cacheKey(h.rwId, h.quote);
      if (cache[key]) {
        h.claimTitle = cache[key];
      } else {
        try {
          h.claimTitle = await generateClaimTitle(h.quote, apiKey);
          cache[key] = h.claimTitle;
          generated++;
        } catch (err) {
          console.warn(`  ⚠ Claim generation failed for highlight in ${file}: ${err.message}`);
        }
      }
    }

    const rendered = renderEntry({ ...fm, slug }, highlights);
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

  if (generated > 0) {
    saveCache(cache);
    console.log(`Generated ${generated} new claim title(s) and saved to cache.`);
  }

  if (PRUNE) {
    for (const file of fs.readdirSync(DEST).filter((f) => f.endsWith(".md"))) {
      if (!keep.has(path.basename(file, ".md"))) {
        fs.rmSync(path.join(DEST, file));
        pruned++;
      }
    }
  }

  console.log(`Synced library: ${created} created, ${updated} updated, ${unchanged} unchanged, ${pruned} pruned.`);
}

sync().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
