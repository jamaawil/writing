// Terminal moderation queue. Run with: npm run comments:review
// Needs DATABASE_URL (or NETLIFY_DATABASE_URL) in a local .env.

const readline = require("readline");
const { getSql } = require("./lib/comments-db");

function excerpt(s, n = 200) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function main() {
  const sql = getSql();
  const pending = await sql`
    SELECT id, page_slug, parent_id, name, email, message, selection_text, created_at
    FROM comments WHERE status = 'pending' ORDER BY created_at ASC
  `;

  if (!pending.length) {
    console.log("No pending comments.");
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  let approved = 0,
    rejected = 0,
    skipped = 0;

  for (const c of pending) {
    let parentLine = "";
    if (c.parent_id != null) {
      const parentRows = await sql`SELECT name, message FROM comments WHERE id = ${c.parent_id}`;
      const parent = parentRows[0];
      if (parent) parentLine = `\n  In reply to ${parent.name}: "${excerpt(parent.message, 100)}"`;
    }

    console.log(
      `\n--- #${c.id} on ${c.page_slug} — ${c.name} (${c.email}) — ${new Date(
        c.created_at
      ).toLocaleString()} ---${parentLine}\n  Highlighted: "${excerpt(c.selection_text, 150)}"\n  Comment: ${c.message}`
    );

    let answer;
    do {
      answer = (await ask("  (a)pprove / (r)eject / (s)kip / (q)uit > ")).trim().toLowerCase();
    } while (!["a", "r", "s", "q"].includes(answer));

    if (answer === "q") break;
    if (answer === "s") {
      skipped++;
      continue;
    }
    const status = answer === "a" ? "approved" : "rejected";
    await sql`UPDATE comments SET status = ${status} WHERE id = ${c.id}`;
    if (answer === "a") approved++;
    else rejected++;
  }

  rl.close();
  console.log(`\nDone — ${approved} approved, ${rejected} rejected, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error("Review failed:", err.message);
  process.exit(1);
});
