// One command to publish everything written in Obsidian: pull the vault into
// content/, rebuild, commit, and push. Netlify then deploys the pushed branch.
//
// Usage: npm run publish
// Options:
//   OBSIDIAN_VAULT=/path/to/vault   point at your vault (default is the path in the sync scripts)
//   NO_PRUNE=1                       keep content whose vault note was deleted (skip deletion-sync)

const { execSync, execFileSync } = require("child_process");

const ROOT = __dirname + "/..";
// The branch Netlify builds for production. Pushing this branch publishes the site.
const PRODUCTION_BRANCH = process.env.PUBLISH_BRANCH || "claude/eager-shannon-an6g4l";

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}
function cap(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function main() {
  // 1. Pull the vault into content/ and rebuild. A bad note fails the build here,
  //    before anything is committed or pushed.
  run("node scripts/sync-library-from-obsidian.js");
  run("node scripts/sync-content-from-obsidian.js");
  run("node build.js");

  // 2. Anything to publish?
  if (!cap("git status --porcelain")) {
    console.log("\nNothing changed since last publish — already up to date.");
    return;
  }
  console.log("\nChanges to publish:");
  console.log(cap("git status --short"));

  // 3. Stage the site's tracked areas, commit, push.
  run("git add -A -- content static data build.js package.json package-lock.json scripts tests netlify netlify.toml .gitignore");
  if (!cap("git diff --cached --name-only")) {
    console.log("\nNo tracked changes to publish (only ignored files changed).");
    return;
  }
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  run(`git commit -m ${JSON.stringify(`Publish: sync from Obsidian (${stamp})`)}`);

  const branch = cap("git rev-parse --abbrev-ref HEAD");
  console.log(`\n$ git push origin HEAD:${PRODUCTION_BRANCH}`);
  execFileSync("git", ["push", "origin", `HEAD:${PRODUCTION_BRANCH}`], { stdio: "inherit", cwd: ROOT });

  console.log(`\nPublished from "${branch}" to "${PRODUCTION_BRANCH}".`);
  console.log("Netlify will now build and deploy this to your live site.");
}

try {
  main();
} catch (err) {
  console.error("\nPublish failed:");
  console.error("  " + (err && err.message ? err.message.split("\n")[0] : String(err)));
  console.error("\nCommon causes:");
  console.error("  • Vault not found — set OBSIDIAN_VAULT to your vault path.");
  console.error("  • A note has invalid frontmatter — see the message above.");
  console.error("  • git push rejected — run `git pull --rebase` then `npm run publish` again.");
  process.exit(1);
}
