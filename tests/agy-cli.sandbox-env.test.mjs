// Run: node --test tests/agy-cli.sandbox-env.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { sandboxEnv } from "../plugins/antigravity/scripts/lib/agy-cli.mjs";

const ARM = "CARGO_TARGET_AARCH64_APPLE_DARWIN_RUNNER";

test("adds the host runner and leaves the base env unchanged", () => {
  const base = { PATH: "/usr/bin" };
  const env = sandboxEnv(base, { arch: "arm64", timeoutS: 7 });
  assert.equal(env.PATH, "/usr/bin");
  assert.match(env[ARM], / 7$/);
  assert.equal(base[ARM], undefined);
  assert.ok(sandboxEnv(base, { arch: "x64" }).CARGO_TARGET_X86_64_APPLE_DARWIN_RUNNER);
});

test("keeps a runner the caller already set", () => {
  assert.equal(sandboxEnv({ [ARM]: "mine" }, { arch: "arm64" })[ARM], "mine");
});

// Cargo splits the runner on whitespace; run it the same way.
function runWithRunner(timeoutS, cmd) {
  const [bin, ...args] = sandboxEnv({}, { arch: "arm64", timeoutS })[ARM].split(/\s+/);
  return spawnSync(bin, [...args, ...cmd], { encoding: "utf8" });
}

test("a binary over the limit gets SIGALRM", () => {
  assert.equal(runWithRunner(1, ["/bin/sleep", "5"]).signal, "SIGALRM");
});

test("a binary under the limit keeps its exit code and args", () => {
  const r = runWithRunner(5, ["/bin/sh", "-c", "echo \"$1\"; exit 3", "sh", "a b;c"]);
  assert.equal(r.status, 3);
  assert.equal(r.stdout, "a b;c\n");
});

test("a missing binary fails instead of exiting 0", () => {
  const r = runWithRunner(5, ["/nonexistent/bin"]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /exec:/);
});
