// Netlify injects the connection-string env var directly into the Functions runtime —
// no .env loading needed here (that's only for the local scripts/ tools).

const { neon } = require("@neondatabase/serverless");

function getSql() {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.jamalgarden;
  if (!url) throw new Error("No database URL set");
  return neon(url);
}

module.exports = { getSql };
