// One-time schema setup. Run with: npm run comments:migrate
// Needs DATABASE_URL (or NETLIFY_DATABASE_URL) in a local .env — see README/setup notes.

const { getSql } = require("./lib/comments-db");

async function migrate() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id             BIGSERIAL PRIMARY KEY,
      page_slug      TEXT NOT NULL,
      parent_id      BIGINT REFERENCES comments(id),
      name           TEXT NOT NULL,
      email          TEXT NOT NULL,
      message        TEXT NOT NULL,
      selection_text TEXT NOT NULL,
      start_pos      INTEGER NOT NULL,
      end_pos        INTEGER NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_page_slug ON comments(page_slug)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status)`;
  console.log("comments table ready.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
