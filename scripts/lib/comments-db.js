// Shared DB connection helper for the comments scripts (migrate, review) that run
// outside Netlify's runtime, so DATABASE_URL has to come from a local .env rather than
// an auto-injected platform env var.

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function getSql() {
  loadDotEnv();
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!url) {
    console.error(
      "No DATABASE_URL (or NETLIFY_DATABASE_URL) found. Add it to a local .env file first."
    );
    process.exit(1);
  }
  return neon(url);
}

module.exports = { getSql };
