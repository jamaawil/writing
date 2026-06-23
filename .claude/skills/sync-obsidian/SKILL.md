---
name: sync-obsidian
description: Pull essays, bits, ideas, scholars, topics, dictionary terms, projects, and library highlights/responses from the Obsidian vault into this site's content/ folder, rebuild, and preview. Use when the user says to sync, pull, or update site content from Obsidian.
---

# Sync from Obsidian

The vault is at `/Users/polymath/Documents/SmartNotes Starter Kit` (override with the
`OBSIDIAN_VAULT` env var if it moves). Two sync scripts pull from it, because two different
parts of the vault produce content in different shapes:

1. **Library** (book highlights + written responses) — authored via the vault's existing
   "Frequentation" QuickAdd macro (`_scripts/frequentation-library.js`), which builds styled
   HTML response cards on pages under `library/books/*.md`. `scripts/sync-library-from-obsidian.js`
   reverse-engineers that HTML into `content/library/*.md`.
2. **Everything else** (Essays, Bits, Ideas, Scholars, Topics, Dictionary, Projects) —
   authored directly as plain notes under `Website/<Type>/` in the vault, using frontmatter
   templates (`Website/<Type>/_template.md`) that already match the site's schema 1:1.
   `scripts/sync-content-from-obsidian.js` copies + validates these into `content/<type>/`.
   Projects is a single page (`Website/Projects.md` → `content/pages/projects.md` body).

## Steps

1. Run `npm run sync:all` from the repo root — this runs both sync scripts and then
   `npm run build` in sequence. (Or `npm run sync:obsidian` / `npm run sync:content`
   individually if the user only mentions one content type.) Report the
   created/updated/unchanged/skipped counts from each script's output.
2. If a local preview server isn't already running on port 4173, start one in the
   background (`npx serve public -p 4173`) and open it so the user can check the result.
3. Show a short `git diff --stat -- content` so the user can see exactly what changed
   before deciding to commit.
4. Do NOT commit or push automatically — ask the user first, same as any other change to
   this repo.

## Content-type → vault folder map

| Site content | Vault location | Required frontmatter |
|---|---|---|
| Essays | `Website/Essays/*.md` | `title` (slug auto-derived if blank) |
| Bits | `Website/Bits/*.md` | `date` |
| Ideas | `Website/Ideas/*.md` | `title` |
| Scholars | `Website/Scholars/*.md` | `title` |
| Topics (powers the Index page) | `Website/Topics/*.md` | `title` |
| Dictionary of Terms | `Website/Dictionary/*.md` | `title` |
| Projects page | `Website/Projects.md` (single file, body only) | none |
| Favorites | not a folder — set `favorite: true` in an Essay's frontmatter | — |
| Library | `library/books/*.md` (Frequentation-managed, not under `Website/`) | — |

Files starting with `_` (the `_template.md` files) are skipped by the sync script.

## Known constraints

- Five-Year Plan (`/plan/`) and Bibliography (`/bibliography/`) have no live vault sync —
  they were a one-time conversion from `Braided-Reading-Stack-Kindle.epub`. Edit
  `content/semesters/*.md` / `content/bibliography/*.md` directly if these need to change.
- `content/library/` previously had lorem-ipsum placeholder entries from the initial
  scaffold; those were removed once real synced content existed. If new placeholder
  content shows up in other types, ask before deleting it.

## Extending further

If a new content type appears in the vault that doesn't fit the `Website/<Type>/` direct-copy
pattern (e.g. something with its own rich HTML structure like Library), follow
`scripts/sync-library-from-obsidian.js`'s approach: deterministic extraction, gray-matter in,
gray-matter out — no LLM rewriting, so the site stays faithful to what the user actually wrote.
