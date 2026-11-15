// A review that did not happen, or returned an unusable answer, must not read as success:
// foreground exits non-zero, a background job ends "failed". Background jobs report progress.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createTempDir, cleanTempDir, initGitRepo, runCompanion } from "./helpers.mjs";
import { installFakeAgy, createFakeAgyEnv } from "./fake-agy-fixture.mjs";
import { resolveReviewTarget } from "../plugins/antigravity/scripts/lib/git.mjs";
import { parseAgyActivity } from "../plugins/antigravity/scripts/lib/agy-cli.mjs";
import { runAntigravityReview } from "../plugins/antigravity/scripts/lib/antigravity.mjs";

// Not a commit anywhere; without the ^{commit} peel, `rev-parse --verify` accepts any 40-hex value.
const MISSING_FULL_SHA = "dead".repeat(10);

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

// Repo with two commits; base is the first, so base...HEAD has a real diff.
function makeRepo() {
  const dir = createTempDir("review-exit-repo-");
  initGitRepo(dir);
  const base = git(dir, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(dir, "README.md"), "# Changed\n");
  git(dir, "commit", "-qam", "change");
  return { dir, base };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

describe("resolveReviewTarget --base check", () => {
  let repo;
  before(() => { repo = makeRepo(); });
  after(() => cleanTempDir(repo.dir));

  it("rejects a ref that does not exist", () => {
    assert.throws(() => resolveReviewTarget(repo.dir, { base: "no-such-ref-abc123" }), /--base no-such-ref-abc123 is not a commit/);
  });

  it("rejects a full-length SHA that is not in the repository", () => {
    assert.throws(() => resolveReviewTarget(repo.dir, { base: MISSING_FULL_SHA }), /is not a commit/);
  });

  it("accepts a real commit", () => {
    assert.deepEqual(resolveReviewTarget(repo.dir, { base: repo.base }), { mode: "branch", base: repo.base });
  });

  it("says so when the directory is not a git repository", () => {
    const dir = createTempDir("review-exit-nogit-");
    try {
      assert.throws(() => resolveReviewTarget(dir, { base: "HEAD" }), /Not inside a git repository/);
    } finally {
      cleanTempDir(dir);
    }
  });
});

describe("review commands with fake agy", () => {
  let repo, binDir, env;
  before(() => {
    repo = makeRepo();
    binDir = createTempDir("review-exit-bin-");
    installFakeAgy(binDir, "review-ok");
    env = {
      ...createFakeAgyEnv(binDir),
      CLAUDE_PROJECT_DIR: repo.dir,
      CLAUDE_PLUGIN_DATA: path.join(binDir, "plugin-data")
    };
  });
  after(() => {
    cleanTempDir(repo.dir);
    cleanTempDir(binDir);
  });

  function run(args, behavior = "review-ok") {
    return runCompanion(args, { cwd: repo.dir, env: { ...env, FAKE_AGY_BEHAVIOR: behavior } });
  }

  for (const kind of ["review", "adversarial-review"]) {
    for (const mode of ["--wait", "--background"]) {
      it(`${kind} ${mode} --base <bad ref> exits non-zero and never prints approve`, () => {
        const r = run([kind, mode, "--base", "no-such-ref-abc123"]);
        assert.notEqual(r.status, 0, r.stdout);
        assert.doesNotMatch(r.stdout, /approve|Started background/);
        assert.match(r.stderr, /no-such-ref-abc123/);
      });
    }
  }

  it("--base HEAD with no diff still reports approve with exit 0", () => {
    const r = run(["review", "--wait", "--base", "HEAD"]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Verdict: approve/);
  });

  it("foreground: JSON without verdict/summary exits 1", () => {
    const r = run(["review", "--wait", "--base", repo.base], "review-bad-shape");
    assert.match(r.stdout, /unexpected review shape/);
    assert.equal(r.status, 1, r.stdout);
  });

  it("foreground: a well-formed review exits 0", () => {
    const r = run(["review", "--wait", "--base", repo.base]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Verdict: needs-attention/);
  });

  function runBackground(behavior) {
    const started = run(["review", "--background", "--base", repo.base], behavior);
    assert.equal(started.status, 0, started.stderr);
    const jobId = started.stdout.match(/job (\S+)/)[1];
    for (let i = 0; i < 150; i += 1) {
      const job = JSON.parse(run(["status", jobId, "--json"]).stdout);
      if (job.status !== "queued" && job.status !== "running") return job;
      sleep(100);
    }
    assert.fail(`background job ${jobId} did not finish`);
  }

  it("background: JSON without verdict/summary ends as failed", () => {
    const job = runBackground("review-bad-shape");
    assert.equal(job.status, "failed");
    assert.equal(job.phase, "failed");
    assert.match(job.summary, /verdict/);
  });

  it("background: a well-formed review ends as completed and logs its phases", () => {
    const job = runBackground("review-ok");
    assert.equal(job.status, "completed");
    assert.equal(job.phase, "done");
    const log = fs.readFileSync(job.logFile, "utf8");
    for (const step of ["preparing review worktree", "agy running", "parsing review output"]) {
      assert.match(log, new RegExp(step), log);
    }
  });
});

describe("agy progress", () => {
  it("parseAgyActivity counts tool calls and keeps the last activity description", () => {
    const log = [
      'I0101 x] Monitor agy_tool_safety FINISHED: triggered=false, reason="allowed_tool", duration=5µs',
      'I0101 x] Monitor sir_flash_lite FINISHED: triggered=false, reason="The agent runs git log.", duration=1s',
      'I0101 x] Monitor agy_tool_safety FINISHED: triggered=true, reason="unknown_command", duration=5µs',
      'I0101 x] Monitor sir_flash_lite FINISHED: triggered=false, reason="The agent runs rg.", duration=1s'
    ].join("\n");
    assert.deepEqual(parseAgyActivity(log), { toolCalls: 2, lastActivity: "The agent runs rg." });
    assert.deepEqual(parseAgyActivity(""), { toolCalls: 0, lastActivity: null });
  });

  it("a review reports its phases and a heartbeat with live tool counts", async () => {
    const dir = createTempDir("review-progress-");
    const binDir = createTempDir("review-progress-bin-");
    try {
      initGitRepo(dir);
      const events = [];
      const res = await runAntigravityReview(dir, {
        prompt: "review this",
        binary: installFakeAgy(binDir, "review-slow-tools"),
        workspaceRoot: dir,
        onProgress: (event) => events.push(event),
        progressIntervalMs: 50
      });
      assert.equal(res.ok, true, res.parseError);
      const phases = [...new Set(events.map((e) => e.phase))];
      assert.deepEqual(phases, ["starting", "running", "finalizing"]);
      const beat = events.find((e) => /2 tool calls/.test(e.message));
      assert.ok(beat, JSON.stringify(events));
      assert.match(beat.message, /last activity: The agent is listing files with ls\./);
    } finally {
      cleanTempDir(dir);
      cleanTempDir(binDir);
    }
  });
});
