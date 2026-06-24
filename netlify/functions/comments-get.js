const { getSql } = require("./lib/db");

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "method not allowed" });

  const page = (event.queryStringParameters || {}).page;
  if (!page) return json(400, { error: "page is required" });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    return json(500, { error: "server not configured" });
  }

  try {
    const rows = await sql`
      SELECT id, parent_id, name, message, selection_text, start_pos, end_pos, created_at
      FROM comments
      WHERE page_slug = ${page} AND status = 'approved'
      ORDER BY created_at ASC
    `;

    const byId = new Map();
    const roots = [];
    for (const row of rows) {
      const comment = {
        id: row.id,
        name: row.name,
        message: row.message,
        selection_text: row.selection_text,
        start_pos: row.start_pos,
        end_pos: row.end_pos,
        created_at: row.created_at,
        replies: [],
      };
      byId.set(row.id, comment);
      if (row.parent_id == null) roots.push(comment);
    }
    for (const row of rows) {
      if (row.parent_id != null && byId.has(row.parent_id)) {
        byId.get(row.parent_id).replies.push(byId.get(row.id));
      }
    }

    return json(200, { comments: roots });
  } catch (err) {
    console.error(err);
    return json(500, { error: "internal error" });
  }
};
