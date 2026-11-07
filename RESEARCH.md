# Unified Zettel research

The website code is on the local `unified-zettel` branch. Research sources are
read-only inputs. Builds and imports do not commit, push, deploy, call language
models, or alter the original vault or databases.

## Local workflow

```sh
npm run research:import
npm run build
npm run test:research
npm run research:verify
npm run research:verify-style
npm run research:preview
```

Open `http://127.0.0.1:4173/zettel/`. The preview server requires a terminal
environment that permits binding a local port. Browser automation also requires
permission to launch Chromium; server/database checks alone are not visual tests.

The importer defaults to `~/Documents/Distiller-vault`,
`~/distiller/state/queue.db`, and `~/Documents/Mind`. Override paths with the
script's `--vault`, `--distiller`, and `--mind` arguments when running on the iMac.
Existing writing sync scripts default to this repository's parent Obsidian folder;
the `OBSIDIAN_VAULT` override remains supported.

## Preservation

Each import creates a new private `.research/snapshots/<timestamp>/` directory.
It contains SQLite backup snapshots of Distiller and DMCE, the original vault
reader-facing files (including binary attachments) in a compressed archive, the website
content archive, legacy graph/glossary files, a serving database and a SHA-256
manifest. The active pointer changes only after import checks pass. Failed and
previous snapshots are retained. These files are ignored by Git.

The original vault, source databases, and `Mind-support/gh-pages-git-backup`
remain in their existing locations. The snapshot includes all research attachments
and a `vault-coverage.json` inventory of every vault file, identifying reader-facing,
explicitly private, and operational files. Application settings, dependencies,
local system files, and executable tooling are accounted for as operational;
they are not public content. The complete writing vault and Mind-support Git
history still require independent backups.

All Distiller links, mesh assessments and DMCE similarity records are retained,
including rejected/none/provisional assessments. Each keeps its original row as
JSON. Embeddings remain byte-preserved in the DMCE database snapshot. Relationship
directions are not silently corrected. Ambiguous references have explicit records
and candidate links. A missing note file does not delete its database claim.

The verifier checks source counts, identities, relationship endpoints, preserved
directions/rationales/statuses, search coverage, public route destinations and
archive checksums. The manifest records unresolved source paths and nonstandard
mesh directions. Neither a successful route check nor a reference record proves
that every original citation has been reconciled.

## Website behavior

The existing `/zettel/` notes and addresses remain. Full research search is on
that page and `/zettel/research/`. Stable record IDs determine research URLs;
titles and filenames are aliases. Graph positions are deterministic, use ordinary
SVG links, and have a keyboard-accessible list alternative. Neighborhood views
are bounded for rendering, while relationship lists are paginated without
discarding stored records. Source passages have their own pagination.

Zettel keeps the writer site's full portrait, profile, biography, email,
navigation, sidebar width, and typography. Digitalmind's collection folders
appear below that original navigation; the central reading column and the
constellation, page contents, and connections form the research workspace. The
context column moves below the reading column when space is limited. The writer website's fonts, palette and theme controls
remain authoritative. The landing page links into book maps, themes, trails,
sources, passages, learning notes, the mesh and glossary. Digitalmind's 739
glossary entries, 533 book maps and 24 generated theme pages are preserved in a
separate supplementary archive and imported as searchable records.

Every source highlight has a stable source-passage page, including highlights
without assigned claims. Research records from hypothesis, Booklab, source
suggestion, synthesis, essay-plan, literary lineage, and fact-check tables have
reading pages and explicit links to their parent research. Named-entity mentions
and source/derivation links in note properties are retained as connections.
Heading and block references retain anchors, and note properties are visible
on reading pages and included in search. Canvas nodes, coordinates, and original edges are
preserved alongside a linked view and original download. Base definitions,
bibliographies, JSON, manuscripts, digests, and archives are indexed.

Non-Markdown originals are stored by SHA-256 under the snapshot's `assets/`
directory. The local `/api/research-asset?id=...` endpoint serves the exact bytes
with download disposition. HTML/SVG attachments are downloaded rather than
executed in the website context.

Research CSS and JavaScript load only on Zettel pages. The shared writer
stylesheet, original theme scripts, and fonts remain unchanged. The style
verifier renders the original Git builder against the same content in an
isolated temporary directory and compares every non-Zettel HTML page byte for
byte; this is a regression check, not a browser screenshot comparison.

Private/draft notes remain in the local preservation snapshot and are excluded
from the public API and search. Raw HTML in research notes is not executed.

## GitHub and Netlify deployment

GitHub holds the application code. The multi-gigabyte preservation snapshots
must not be committed as ordinary repository files. Netlify serves the site and
research function; a separate PostgreSQL publication holds the queryable data.
No production database has been provisioned or uploaded by the local build.

After selecting and configuring sufficient PostgreSQL storage, explicitly set
`RESEARCH_DATABASE_URL` and a **new** `RESEARCH_SCHEMA` such as `zettel_20261107`.
Then run `npm run research:upload` from a network-enabled environment. It creates
a separate schema, imports records, builds search indexes and verifies counts and
endpoints. It refuses to overwrite an existing schema. This uploader targets a
Neon-compatible serverless PostgreSQL endpoint, using the dependency the writing
site already has; other PostgreSQL providers need an appropriate driver.

Attachment hosting is a separate required deployment step. Upload the immutable
`assets/` directory to a public HTTPS object store under its SHA-256 filenames,
verify checksums, and set `RESEARCH_ASSET_BASE_URL`. Configure that host to serve
original media types with attachment disposition and `nosniff`; do not serve
untrusted HTML/SVG inline under the writer site's origin. No asset upload has
been performed. The Netlify asset function redirects only published records to
this base URL. The database uploader includes the attachment catalog but does
not upload binary files.

Set the verified publication's `RESEARCH_DATABASE_URL`, `RESEARCH_SCHEMA`, and
`RESEARCH_ASSET_BASE_URL` in
Netlify for both build and function access. Keep the existing comments database
configuration separate. Netlify builds of this branch refuse to deploy without
the research configuration. Database provisioning, upload, live browser checks
and deployment are still separate steps; a local import does not complete them.
