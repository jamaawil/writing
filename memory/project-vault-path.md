---
name: project-vault-path
description: The Obsidian vault for this site is Awil-site, not SmartNotes or Polymath-Vault
metadata:
  type: project
---

The Obsidian vault for this website is at `/Users/polymath/Documents/Awil-site`.

**Why:** There are multiple vaults on this machine; the sync scripts previously pointed to a stale path (`SmartNotes Starter Kit`) that doesn't exist. The correct vault is Awil-site.

**How to apply:** When touching `scripts/sync-library-from-obsidian.js` or `scripts/sync-content-from-obsidian.js`, always use `/Users/polymath/Documents/Awil-site` as the default VAULT path. Library files in that vault are at `Website/Library/` (not `library/books/`). All other content types are at `Website/<Type>/` (Essays, Bits, Ideas, etc.).
