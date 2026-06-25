# Writing in Obsidian → Live on the Website

Obsidian is the writing machine. Every page on the site is built from plain
markdown notes living in this vault — there's no CMS, no separate admin panel.
You write a note, you run one command, it's live.

This file is the complete, no-other-doc-needed guide to that workflow,
covering every page on the site. (`PUBLISHING.md` in this same folder covers
the technical mechanics of the publish step in more depth, if you ever want
that level of detail. `README.md` covers the build's tech stack.)

---

## The big picture

```
You write a note in Obsidian
        ↓
A sync script reads the vault and writes content/<type>/<slug>.md
        ↓
build.js renders content/ into the actual HTML (public/)
        ↓
git commit + push  →  Netlify sees the push  →  your live site updates
```

One command does the last three steps:

```bash
npm run publish
```

Run it from this folder (`Website/`) any time you're done writing for the
session. It syncs everything below, rebuilds the site, commits, and pushes —
Netlify deploys automatically within a minute or two. If nothing changed, it
just tells you so and stops; it's always safe to run.

To preview without going live, run `npm run sync:all` instead — it syncs and
rebuilds locally (`public/`) but doesn't commit or push. Useful for proof-reading
before you ship.

**Important rule the vault works by:** *the vault is authoritative.* Whatever
is in a synced vault folder is what's on the site. If you delete or rename a
note in Obsidian, the next publish deletes the matching page from the site
too. Nothing lingers. A note with `draft: true`, `publish: false`, or
`private: true` in its frontmatter is skipped entirely — it never reaches the
site, no matter what.

---

## Quick reference: every page, where it comes from

| Site page | Vault location | Lives inside this repo folder? |
|---|---|---|
| Start Here | `Website/Start Here.md` | single file |
| All Essays / home | `Website/Essays/*.md` | folder |
| Favorites | *(no folder — flag on an Essay)* | — |
| Index | *(automatic — built from Topics + Essays)* | — |
| Library | `library/books/*.md`, filled by the **Build Library** QuickAdd macro | folder, **outside** this repo |
| Dictionary | `Website/Dictionary/*.md` | folder |
| Projects | `Website/Projects.md` | single file |
| Bits | `Website/Bits/*.md` | folder |
| Scholars | `Website/Scholars/*.md` | folder |
| Ideas | `Website/Ideas/*.md` | folder |
| Zettel | `Website/Zettel/*.md` | folder |
| Five-Year Plan | *(static — not vault-synced, see below)* | — |
| Bibliography | *(static — not vault-synced, see below)* | — |

Everything under `Website/` (this repo's root) doubles as both the live site's
code *and* a folder inside your Obsidian vault — so `Website/Essays/`,
`Website/Bits/`, etc. all show up right in Obsidian's file browser. I've
already created each of these folders with a `_template.md` inside — files
starting with `_` are never published, so they're safe to leave there as a
copy-paste starting point.

---

## Essays — `Website/Essays/*.md`

Duplicate `Website/Essays/_template.md`, rename it, write.

```markdown
---
title: My Essay Title
subtitle: An optional one-line subtitle
date: 2026-01-01
topics: [craft, writing]
favorite: false
words: 0
---

Essay body. Standard markdown, tables, footnotes[^1], and [[wikilinks]] to
other notes all work.

[^1]: Renders as a small popup, not a jump to the bottom.
```

- Only `title` is required. `slug` is optional — derived from the title if blank.
- `favorite: true` puts it on the **Favorites** page (see below).
- `topics: [a, b]` puts it on the **Index** page under each topic (topics
  should match a Topic note's title/slug — see Topics below).
- `words` shows in the essay list; update it roughly, it's not auto-counted.

## Bits — `Website/Bits/*.md`

Short, timestamped notes — no title needed. The filename can be anything.

```markdown
---
date: 2026-01-01
---

A short, passing thought.
```

Only `date` is required.

## Ideas — `Website/Ideas/*.md`

```markdown
---
title: My Idea
topics: [craft]
---

A shorter, less polished note than an essay.
```

Only `title` is required.

## Scholars — `Website/Scholars/*.md`

```markdown
---
title: Scholar Name
era: 20th century
field: Philosophy
---

Notes on a thinker worth returning to.
```

Only `title` is required; `era`/`field` show on the card.

## Topics — `Website/Topics/*.md`

```markdown
---
title: Topic Name
---

A short description, shown above the list of essays tagged with this topic.
```

Only `title` is required. Create a Topic note for any value you use in an
essay's `topics: []` field — that's what makes it show up on the **Index** page.

## Dictionary — `Website/Dictionary/*.md`

```markdown
---
title: Term
tagline: A one-line gloss
---

The fuller definition and usage notes.
```

Only `title` is required; `tagline` is the short gloss in the A–Z list.

## Zettel — `Website/Zettel/*.md`

```markdown
---
title: Zettel Title
---

An atomic note. Link to other zettels with [[wikilinks]] — those links are
what draws the connection graph on the site.
```

Only `title` is required. No separate "links" field — just use `[[wikilinks]]`
in the body.

## Projects — `Website/Projects.md`

A single file, not a folder — the whole site's Projects page is just this
note's body (its title/URL are fixed). I've seeded it with what's currently
live; edit it directly.

## Start Here — `Website/Start Here.md`

Same idea as Projects — a single file whose body is the whole page. Already
seeded with the current live text.

---

## Pages with no vault folder (they're automatic)

**Favorites** isn't its own folder — it's just essays with `favorite: true`
in their frontmatter. Mark a few essays that way and they show up there
automatically, newest first.

**Index** isn't its own folder either — it's built automatically from your
**Topics** notes plus every essay's `topics: []` field. Write Topics, tag
your essays with them, and the Index page assembles itself.

---

## Library — pulling Readwise highlights and writing your responses

This one has its own short loop, separate from the rest:

1. Highlight in Readwise as you read.
2. In Obsidian, run the **"Build Library"** QuickAdd macro (already set up —
   command palette or whatever hotkey/ribbon icon you've bound it to). It
   pulls any *new* highlights straight from the Readwise API into
   `library/books/<book title>.md` — one file per book, one quote callout per
   highlight, with an empty `## ` heading line and a
   `%%Write your response here.%%` placeholder underneath each. Re-running it
   only appends new highlights; it never touches a response you've already
   written.
3. Open the book's note and, for any highlight you want to respond to, type a
   title right after the `## ` and write your response below it, replacing
   the placeholder. The title renders as a heading on that highlight's card on
   the site; leave the `## ` line empty and no heading shows at all — either
   way is fine, it's optional per response.
4. `npm run publish` like everything else.

Note: `library/books/` lives in the vault but **outside** this repo folder
(it's a sibling, not inside `Website/`) — that's intentional, so raw
highlights never accidentally get committed before you've had a chance to
write a response.

---

## Pages that are static (not part of the live Obsidian loop)

**Five-Year Plan** (`/plan/`) and **Bibliography** (`/bibliography/`) were a
one-time conversion from a Kindle EPUB (`Braided-Reading-Stack-Kindle.epub`) —
12 semesters, 1,200+ books. There's no vault folder feeding these; they're
edited by hand directly in `content/semesters/*.md` and
`content/bibliography/*.md` in this repo. That's a deliberate scope decision,
not a missing feature — turning 1,200 individual book entries into an
Obsidian-authored collection isn't really a "write a note, publish" workflow.
If you ever want to maintain these from Obsidian going forward, say so and
we can wire up a vault folder for it the same way as everything else above.

---

## Privacy and drafts

Add any of these to a note's frontmatter to keep it off the site entirely —
the sync script skips it, no page is built, no link appears anywhere:

```yaml
draft: true
```

(`publish: false` or `private: true` work identically — use whichever reads
naturally to you.)

## Wikilinks

`[[Some Note]]` or `[[Some Note|custom label]]` in any synced note's body
becomes a real link to that note's page on the site, if it resolves to a
published Essay, Idea, Scholar, Topic, Dictionary term, Zettel, or Library
book. If it doesn't resolve, it renders as plain text — never a raw `[[ ]]`.

---

## The publish command, in full

```bash
npm run publish
```

What it actually does, in order:
1. Pulls Library highlights/responses into `content/library/`.
2. Pulls Essays/Bits/Ideas/Scholars/Topics/Dictionary/Zettel/Projects/Start
   Here into `content/`.
3. Rebuilds the site (`build.js` → `public/`). A malformed note fails the
   build *here* — before anything is committed or pushed.
4. Commits and pushes. Netlify deploys the push automatically.

If you only want to preview locally first: `npm run sync:all` does steps 1–3
only (no git). Serve the result with `npm run serve` and open it in a browser.

If you'd rather not type commands at all: the **Shell commands** Obsidian
plugin can bind `cd "/path/to/this/repo" && npm run publish` to a ribbon icon
or hotkey (see `PUBLISHING.md` for the one-time setup).
