---
title: "How I Built This"
slug: "how-i-built-this"
---

This site is a custom-built static site generator written in Node.js, deployed on Netlify.

## The Stack

**Generator:** A single `build.js` file reads all content from markdown files, processes them with a remark/rehype pipeline, and outputs plain HTML. No framework, no runtime, no server — just a script that produces a folder of HTML files.

**Content:** All writing lives in a `content/` folder as markdown files with YAML frontmatter. Essays, library highlights, dictionary terms, ideas, zettel notes, bits, scholar pages, and semester plans all have their own subdirectories.

**Deployment:** Netlify watches the repository. Every push to the main branch triggers a build (`node build.js`) and deploys the result. Build time is under two seconds.

**Styling:** A single CSS file (`static/css/style.css`) handles all layout and theming. The design supports four color themes and three font pairs, all switchable client-side via localStorage.

**Comments:** A serverless comment system using Netlify Functions and a database. Comments appear on any page and support reply threading.

**Fonts:** Google Fonts — EB Garamond, Cormorant Garamond, Crimson Pro, Merriweather, Playfair Display, Source Serif 4, and Lora. Loaded via a single stylesheet link; the active pair is toggled with CSS custom properties.

## Design Philosophy

I wanted a site that was fast, readable, and maintainable without dependencies that could break. The goal was to own every line of code and understand exactly what it does.

The content-first approach means I write in plain markdown, the build step is deterministic and reproducible, and the result is pure HTML that loads instantly on any connection.

## Obsidian Integration

Most content originates in Obsidian, my personal knowledge management system. A set of sync scripts pull content from the Obsidian vault into the `content/` folder, converting Obsidian-flavored markdown (wikilinks, callouts) into the formats the build script expects.

This means the site stays in sync with my thinking — when a note is ready to publish, it moves from vault to content folder, and the next build picks it up.
