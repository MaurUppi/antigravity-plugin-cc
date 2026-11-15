// Run: node --test tests/antigravity.run-target.test.mjs
// A fake agy finds its per-run build dir in the prompt, writes into it and exits with FAKE_EXIT.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAntigravityReview, sweepStaleRunTargetDirs } from "../plugins/antigravity/scripts/lib/antigravity.mjs";
import { REVIEW_CARGO_TARGET_DIR } from "../plugins/antigravity/scripts/lib/agy-cli.mjs";

function fakeAgy(dir) {
  const bin = path.join(dir, "fake-agy.mjs");
  fs.writeFileSync(bin, `#!/usr/bin/env node
import fs from "node:fs";
const prompt = process.argv[process.argv.indexOf("--print") + 1];
const dir = prompt.match(/CARGO_TARGET_DIR=(\\S+)/)[1];
fs.writeFileSync(dir + "/built", "x");
console.log(dir);
process.exit(Number(process.env.FAKE_EXIT ?? 0));
`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

async function run(exitCode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-target-test-"));
  process.env.FAKE_EXIT = String(exitCode);
  const res = await runAntigravityReview(dir, {
    prompt: `build with CARGO_TARGET_DIR=${REVIEW_CARGO_TARGET_DIR} cargo test`,
    binary: fakeAgy(dir),
    workspaceRoot: dir,
    model: "gemini-4-hydrogen-high"
  });
  const runDir = String(res.rawOutput).trim().split("\n").pop().trim();
  fs.rmSync(dir, { recursive: true, force: true });
  return runDir;
}

test("a run gets its own build dir under the root, removed after a normal finish", async () => {
  const runDir = await run(0);
  assert.ok(runDir.startsWith(path.join(REVIEW_CARGO_TARGET_DIR, "run-")), runDir);
  assert.equal(fs.existsSync(runDir), false);
});

test("a failed run keeps its build dir", async () => {
  const runDir = await run(3);
  assert.ok(runDir.startsWith(path.join(REVIEW_CARGO_TARGET_DIR, "run-")), runDir);
  assert.equal(fs.existsSync(path.join(runDir, "built")), true);
  fs.rmSync(runDir, { recursive: true, force: true });
});

test("the sweep removes only run-* dirs older than the limit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sweep-test-"));
  const old = path.join(root, "run-old");
  const fresh = path.join(root, "run-fresh");
  const other = path.join(root, "debug");
  for (const d of [old, fresh, other]) fs.mkdirSync(path.join(d, "sub"), { recursive: true });
  const dayAgo = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(old, dayAgo, dayAgo);
  fs.utimesSync(other, dayAgo, dayAgo);
  assert.deepEqual(sweepStaleRunTargetDirs(root, 24 * 60 * 60 * 1000), [old]);
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(other), true);
  assert.deepEqual(sweepStaleRunTargetDirs(path.join(root, "missing")), []);
  fs.rmSync(root, { recursive: true, force: true });
});
