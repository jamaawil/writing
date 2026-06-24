const { getSql } = require("./lib/db");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method not allowed" });

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return json(400, { error: "invalid JSON" });
  }

  // Honeypot: a bot that fills this hidden field gets a fake success, never an error
  // that would tip it off, and nothing is inserted.
  if (payload.website) {
    return json(201, { id: 0, submitted_at: new Date().toISOString() });
  }

  const name = String(payload.name || "").trim().slice(0, 200);
  const email = String(payload.email || "").trim().slice(0, 200);
  const message = String(payload.message || "").trim().slice(0, 2000);
  const pageSlug = String(payload.page_slug || "").trim();

  if (!name) return json(400, { error: "name is required" });
  if (!EMAIL_RE.test(email)) return json(400, { error: "a valid email is required" });
  if (!message) return json(400, { error: "message is required" });
  if (!pageSlug) return json(400, { error: "page_slug is required" });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    return json(500, { error: "server not configured" });
  }

  try {
    let parentId = null;
    let finalPageSlug = pageSlug;
    let selectionText;
    let startPos;
    let endPos;

    if (payload.parent_id != null) {
      const parentRows = await sql`
        SELECT id, page_slug, selection_text, start_pos, end_pos, status
        FROM comments WHERE id = ${payload.parent_id}
      `;
      const parent = parentRows[0];
      if (!parent || parent.status !== "approved") {
        return json(400, { error: "parent comment not found" });
      }
      // Replies inherit the original anchor from the parent — never trust the
      // client's copy of selection_text/start_pos/end_pos for a reply.
      parentId = parent.id;
      finalPageSlug = parent.page_slug;
      selectionText = parent.selection_text;
      startPos = parent.start_pos;
      endPos = parent.end_pos;
    } else {
      selectionText = String(payload.selection_text || "").trim().slice(0, 1000);
      startPos = parseInt(payload.start_pos, 10);
      endPos = parseInt(payload.end_pos, 10);
      if (!selectionText) return json(400, { error: "selection_text is required" });
      if (!Number.isInteger(startPos) || !Number.isInteger(endPos) || endPos <= startPos) {
        return json(400, { error: "invalid selection range" });
      }
    }

    const rows = await sql`
      INSERT INTO comments
        (page_slug, parent_id, name, email, message, selection_text, start_pos, end_pos, status)
      VALUES
        (${finalPageSlug}, ${parentId}, ${name}, ${email}, ${message}, ${selectionText}, ${startPos}, ${endPos}, 'pending')
      RETURNING id, created_at
    `;
    const row = rows[0];
    return json(201, { id: row.id, submitted_at: row.created_at });
  } catch (err) {
    console.error(err);
    return json(500, { error: "internal error" });
  }
};
