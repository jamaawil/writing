// Creates the comments table in the Neon database if it doesn't exist.
// Run once: NETLIFY_DATABASE_URL="postgresql://..." node scripts/db-migrate.js
// Or set the variable name used in your Netlify env (jamalgarden, DATABASE_URL, etc.)

const { neon } = require("@neondatabase/serverless");

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.jamalgarden;
if (!url) {
  console.error("No database URL found. Set DATABASE_URL or jamalgarden env var.");
  process.exit(1);
}

const sql = neon(url);

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id            SERIAL PRIMARY KEY,
      page_slug     TEXT        NOT NULL,
      parent_id     INTEGER     REFERENCES comments(id),
      name          TEXT        NOT NULL,
      email         TEXT        NOT NULL,
      message       TEXT        NOT NULL,
      selection_text TEXT       NOT NULL DEFAULT '',
      start_pos     INTEGER     NOT NULL DEFAULT 0,
      end_pos       INTEGER     NOT NULL DEFAULT 0,
      status        TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','approved','rejected')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS comments_page_slug ON comments(page_slug)`;
  await sql`CREATE INDEX IF NOT EXISTS comments_parent_id ON comments(parent_id)`;
  console.log("Migration complete — comments table ready.");
}

migrate().catch(err => { console.error("Migration failed:", err.message); process.exit(1); });
