// One command for the end-of-session terminal step: pull everything written in
// Obsidian since last time, rebuild, and push it live.
//
// Usage: npm run publish

const { execSync } = require("child_process");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: __dirname + "/.." });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: __dirname + "/..", encoding: "utf8" });
}

function main() {
  run("node scripts/sync-library-from-obsidian.js");
  run("node scripts/sync-content-from-obsidian.js");
  run("node build.js");

  const status = runCapture("git status --porcelain").trim();
  if (!status) {
    console.log("\nNothing changed since last publish — already up to date.");
    return;
  }

  console.log("\nChanges to publish:");
  console.log(runCapture("git status --short"));

  run("git add -A -- content static build.js package.json package-lock.json scripts .claude");

  const staged = runCapture("git status --porcelain").trim();
  if (!staged) {
    console.log("\nNo tracked changes to publish (only ignored files changed).");
    return;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const message = `Publish: sync from Obsidian (${stamp})`;
  run(`git commit -m ${JSON.stringify(message)}`);
  run("git push");

  console.log("\nPublished.");
}

main();
