// Comment moderation tool.
//
// Usage:
//   jamalgarden="postgresql://..." node scripts/comments-admin.js            # list pending
//   jamalgarden="postgresql://..." node scripts/comments-admin.js approve 3  # approve #3
//   jamalgarden="postgresql://..." node scripts/comments-admin.js reject 3   # reject #3
//   jamalgarden="postgresql://..." node scripts/comments-admin.js all        # list all

const { neon } = require("@neondatabase/serverless");

const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.jamalgarden;
if (!url) {
  console.error("No database URL found. Set DATABASE_URL or jamalgarden env var.");
  process.exit(1);
}
const sql = neon(url);

const [cmd, arg] = process.argv.slice(2);

function fmtDate(d) {
  return new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function printComments(rows) {
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  rows.forEach(function (r) {
    console.log(`\n  #${r.id}  ${r.name}  ·  ${r.page_slug}  ·  ${r.status}  ·  ${fmtDate(r.created_at)}`);
    if (r.selection_text) console.log(`  Quote:   "${r.selection_text.slice(0, 80)}${r.selection_text.length > 80 ? "…" : ""}"`);
    console.log(`  Message: ${r.message}`);
  });
  console.log("");
}

async function run() {
  if (cmd === "approve" || cmd === "reject") {
    const id = parseInt(arg, 10);
    if (!id) { console.error("Provide a comment ID, e.g.: approve 3"); process.exit(1); }
    const status = cmd === "approve" ? "approved" : "rejected";
    const rows = await sql`UPDATE comments SET status = ${status} WHERE id = ${id} RETURNING id, name, status`;
    if (rows.length === 0) { console.error(`No comment found with id ${id}`); process.exit(1); }
    console.log(`Comment #${rows[0].id} (${rows[0].name}) → ${rows[0].status}`);
    return;
  }

  if (cmd === "all") {
    const rows = await sql`SELECT id, name, message, selection_text, page_slug, status, created_at FROM comments ORDER BY created_at DESC`;
    console.log(`\nAll comments (${rows.length}):`);
    printComments(rows);
    return;
  }

  // Default: list pending
  const rows = await sql`SELECT id, name, message, selection_text, page_slug, status, created_at FROM comments WHERE status = 'pending' ORDER BY created_at ASC`;
  console.log(`\nPending comments (${rows.length}):`);
  printComments(rows);
  console.log("To approve: node scripts/comments-admin.js approve <id>");
  console.log("To reject:  node scripts/comments-admin.js reject <id>");
}

run().catch(function (err) { console.error("Error:", err.message); process.exit(1); });
