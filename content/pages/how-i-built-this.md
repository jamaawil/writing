---
title: How I Built This
slug: how-i-built-this
nav_order: 8
---

This site is a custom static site generator, not Hugo or Jekyll — just `build.js`, some markdown, and the libraries underneath those bigger tools.

## Stack

- **gray-matter** — reads YAML frontmatter on every markdown file
- **remark-parse** + **remark-gfm** — parses markdown (with GitHub-flavored extensions) into a syntax tree
- **remark-rehype** — converts the markdown tree into an HTML tree
- **rehype-stringify** — renders the final HTML

## Content structure

All writing lives as local markdown files, organized by type:

- `content/essays/` — published essays
- `content/pages/` — static pages like this one
- `content/definitions/` — dictionary terms
- `content/library/` — reading notes and responses
- `content/topics/` — topic descriptions used by the Index

Each file has YAML frontmatter (title, date, topics, etc.) and a markdown body.

## Build

Running `npm run build` reads every markdown file, converts it to HTML, and drops it into a templated page in `public/`. There's no database and no server — just static files, ready to deploy anywhere that serves HTML.

## Hosting

Push to GitHub, host on Netlify (or any static host) with the build command `npm run build` and the publish directory `public`.
