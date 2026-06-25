# Publishing from Obsidian

Your Obsidian vault is the source of truth for the site. Edit notes in the vault's
`Website/` folder (and let the Frequentation script build `library/books/`), then run
**one command** to sync, build, commit, push, and let Netlify deploy.

```bash
npm run publish
```

That's it. The rest of this file explains what it does and how it's wired.

---

## One-time setup

1. **Node** installed (v18+) and dependencies installed once: `npm install`.
2. **Point the scripts at your vault.** They default to
   `/Users/polymath/Documents/SmartNotes Starter Kit`. If your vault lives elsewhere,
   set `OBSIDIAN_VAULT` (add it to your shell profile so you don't retype it):
   ```bash
   export OBSIDIAN_VAULT="/path/to/your/vault"
   ```
3. **Be on the production branch.** Netlify deploys the branch named
   `claude/eager-shannon-an6g4l`. Make sure your local repo is on it:
   ```bash
   git checkout claude/eager-shannon-an6g4l
   ```
   (You can confirm/-change which branch is production in Netlify →
   Site configuration → Build & deploy → Branches. If you rename it to something
   friendlier like `main`, set `PUBLISH_BRANCH=main` when publishing.)

## What `npm run publish` does

1. `sync-library-from-obsidian.js` — turns `library/books/*.md` into `content/library/`.
2. `sync-content-from-obsidian.js` — turns `Website/<Type>/*.md` into `content/`.
3. `node build.js` — rebuilds `public/`. **If a note is malformed the build fails here,
   before anything is pushed.**
4. Commits the changes and pushes. Netlify sees the push and deploys your live site.

If nothing changed in the vault, it says so and stops.

## How the vault maps to the site

| Vault location | Becomes | Frontmatter the site uses |
|---|---|---|
| `Website/Essays/*.md` | `/essay/<slug>/` + home stream | `title`, `date`, `topics: []`, `favorite: true`, `words` (`slug` optional) |
| `Website/Ideas/*.md` | `/ideas/<slug>/` | `title`, `topics: []` |
| `Website/Scholars/*.md` | `/scholars/<slug>/` | `title`, `era`, `field` |
| `Website/Topics/*.md` | `/topic/<slug>/` | `title` |
| `Website/Dictionary/*.md` | `/dictionary/` (A–Z) | `title`, `tagline` |
| `Website/Zettel/*.md` | `/zettel/<slug>/` + graph | `title` (body `[[links]]` build the graph) |
| `Website/Bits/*.md` | `/bits/` | `date` (the filename is the identity) |
| `Website/Projects.md` | `/projects/` body | — |
| `library/books/*.md` | `/library/<slug>/` | built by your Frequentation script |

`slug` is optional everywhere except where noted — leave it blank and it's derived
from the title. Files starting with `_` (like `_template.md`) are ignored.

## Behaviors worth knowing

- **The vault is authoritative.** Anything in a synced folder is published; anything
  removed or renamed in the vault is **deleted from the site** on the next publish
  (so the site never drifts from your vault). To keep an orphaned file, pass
  `NO_PRUNE=1 npm run publish`.
  - *First real publish:* the current placeholder content (example essays, etc.) will be
    replaced by your vault's notes, since they aren't in the vault.
- **Drafts stay private.** A note with `draft: true`, `publish: false`, or `private: true`
  in its frontmatter is skipped entirely — no page, no link.
- **Wikilinks just work.** `[[Some Note]]` / `[[Some Note|label]]` in a body are converted
  to real site links if the target is a published note (essay, idea, scholar, topic,
  dictionary term, zettel, or library book). Unresolved links render as plain text — never
  raw `[[ ]]`.

## Optional: a button in Obsidian

Install the **Shell commands** community plugin, add a command:

```
cd "/path/to/this/repo" && npm run publish
```

bind it to a ribbon icon or hotkey, and you can publish without leaving Obsidian.

## Troubleshooting

- **"Vault Website/ folder not found"** — set `OBSIDIAN_VAULT` to your vault path.
- **"git push rejected"** — someone/something else pushed; run `git pull --rebase`, then
  `npm run publish` again.
- **Pushed the wrong branch** — the command warns if you're not on the production branch;
  `git checkout claude/eager-shannon-an6g4l` and re-publish.
- **Comments** — commenting needs the `DATABASE_URL` env var set in Netlify (separate from
  publishing); see the comments setup notes.
