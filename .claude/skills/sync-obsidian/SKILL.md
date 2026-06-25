---
name: sync-obsidian
description: Pull essays, bits, ideas, scholars, topics, dictionary terms, projects, and library highlights/responses from the Obsidian vault into this site's content/ folder, rebuild, and preview. Use when the user says to sync, pull, or update site content from Obsidian.
---

# Sync from Obsidian

The vault is at `/Users/polymath/Documents/SmartNotes Starter Kit` (override with the
`OBSIDIAN_VAULT` env var if it moves). Two sync scripts pull from it, because two different
parts of the vault produce content in different shapes:

1. **Library** (book highlights + written responses) — `library/books/*.md` is built by the
   vault's QuickAdd macro "Build Library" (`_scripts/frequentation.js`), which pulls highlights
   straight from the Readwise API (not from the official Readwise plugin's own export folder)
   and writes one plain-markdown blockquote per highlight with blank space underneath for a
   response. Re-running only appends new highlights — it never touches what you've already
   written. `scripts/sync-library-from-obsidian.js` reads those files into `content/library/*.md`.
2. **Everything else** (Essays, Bits, Ideas, Scholars, Topics, Dictionary, Projects) —
   authored directly as plain notes under `Website/<Type>/` in the vault, using frontmatter
   templates (`Website/<Type>/_template.md`) that already match the site's schema 1:1.
   `scripts/sync-content-from-obsidian.js` copies + validates these into `content/<type>/`.
   Projects is a single page (`Website/Projects.md` → `content/pages/projects.md` body).

## Steps

The user's workflow: everything is authored in Obsidian; when they're done for the
session, they come to the terminal once and want it live. Two commands, two intents:

- **"sync" / "pull" / "preview" / "check what changed"** → run `npm run sync:all`
  (sync scripts + build, no git). Report the created/updated/unchanged/skipped counts.
  Start a local preview server if one isn't already running on port 4173
  (`npx serve public -p 4173`) and open it. Show `git diff --stat -- content` and stop —
  do not commit or push for a plain sync/preview request.
- **"publish" / "ship it" / "go live" / "I'm done, push it"** → run `npm run publish`
  directly, no extra confirmation needed. This is a standing authorization from the user
  (established 2026-06-23): `npm run publish` runs both sync scripts, builds, commits, and
  pushes in one shot, and a `git push` from this repo authenticates via a credential already
  stored in the macOS keychain (`git credential approve`d for `github.com`) — it does not
  need a pasted token. Report the script's output (what was synced, what was committed,
  confirmation it pushed) back to the user.

If the user is ambiguous about which they mean, ask — but default to assuming "publish" if
they say anything like "I'm finished in Obsidian" or "put it live."

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
