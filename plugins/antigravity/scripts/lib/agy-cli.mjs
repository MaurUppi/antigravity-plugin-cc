import { spawn } from "node:child_process";
import fs from "node:fs";

export const DEFAULT_PRINT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_WATCHDOG_GRACE_MS = 30_000;
const SIGKILL_DELAY_MS = 5_000;
const MAX_LOG_READ_BYTES = 5 * 1024 * 1024;
// Shared cargo build cache for sandboxed reviews; --add-dir makes it the only writable path outside cwd and /tmp.
export const REVIEW_CARGO_TARGET_DIR = "/Volumes/P5800X/.tmp/agy-review-target";
// The sandbox allows bind but blocks connect, so a test waiting on a local peer never ends; each sandboxed test binary gets SIGALRM after this.
export const REVIEW_TEST_TIMEOUT_S = 120;

/**
 * Return a copy of baseEnv in which cargo runs every test/example binary through perl with alarm (alarm survives exec).
 * Cargo splits the runner env var on whitespace without quoting, so the perl code holds no spaces.
 * A runner the caller already set is kept.
 */
export function sandboxEnv(baseEnv = process.env, { arch = process.arch, timeoutS = REVIEW_TEST_TIMEOUT_S } = {}) {
  const key = `CARGO_TARGET_${arch === "x64" ? "X86_64" : "AARCH64"}_APPLE_DARWIN_RUNNER`;
  if (baseEnv[key]) {
    return { ...baseEnv };
  }
  return { ...baseEnv, [key]: `/usr/bin/perl -e alarm(shift);exec{$ARGV[0]}@ARGV;die"exec:$!" ${timeoutS}` };
}

// Matches both fresh runs ("Print mode: conversation=<uuid>, sending message")
// and resumed runs ("Print mode: resuming conversation <uuid>").
const CONVERSATION_RE = /Print mode: (?:resuming )?conversation[= ]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const MODEL_LABEL_RE = /Propagating selected model override to backend: label="([^"]+)"/g;

// Single-flight invariant: each worker process runs at most one agy print
// invocation at a time (the facade enforces this), so one module-level slot
// is sufficient. Concurrent runAgyPrint calls in one process would clobber it.
let _activeChild = null;

/**
 * SIGTERM the currently running agy subprocess (if any).
 * Used by the facade's shutdown handler so /cancel's SIGTERM-to-worker chain
 * cleanly stops agy, which performs its own conversation cleanup.
 */
export function killActiveAgyChild(signal = "SIGTERM") {
  const child = _activeChild;
  if (child && child.exitCode === null && !child.killed) {
    try {
      child.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// agy logs the display label even when --model got the id: "Gemini 4 Hydrogen (High)" ~ "gemini-4-hydrogen-high".
export function modelSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildAgyArgs(options = {}) {
  const {
    prompt,
    modelLabel,
    conversationId,
    agyLogFile,
    timeoutMs = DEFAULT_PRINT_TIMEOUT_MS,
    skipPermissions = false,
    sandbox = false
  } = options;

  const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  // agy 1.5.9 rejects an empty --print and no longer reads stdin.
  // shortcut: prompt rides in argv, so prompts over ARG_MAX (~1 MB on macOS) fail to spawn (E2BIG); switch to --input-format stream-json if that happens.
  const args = ["--print", String(prompt ?? ""), "--print-timeout", `${timeoutSeconds}s`];
  if (modelLabel) {
    args.push("--model", modelLabel);
  }
  if (agyLogFile) {
    args.push("--log-file", agyLogFile);
  }
  if (conversationId) {
    args.push("--conversation", conversationId);
  }
  if (skipPermissions) {
    args.push("--dangerously-skip-permissions");
  } else if (sandbox) {
    // Verified on agy 1.5.9: commands run without prompts; no network; writes outside cwd, /tmp and --add-dir fail.
    args.push(
      "--sandbox",
      "--settings", JSON.stringify({ toolPermission: "proceed-in-sandbox", enableTerminalSandbox: true }),
      "--add-dir", REVIEW_CARGO_TARGET_DIR
    );
  }
  return args;
}

/**
 * Extract the conversation id and the last propagated model label from agy's
 * glog output. The conversation line appears as soon as the conversation
 * starts, so it survives cancellation and timeouts.
 */
export function parseAgyLog(logText) {
  const text = String(logText ?? "");
  const conversationMatch = text.match(CONVERSATION_RE);

  let resolvedModelLabel = null;
  MODEL_LABEL_RE.lastIndex = 0;
  for (let match = MODEL_LABEL_RE.exec(text); match !== null; match = MODEL_LABEL_RE.exec(text)) {
    resolvedModelLabel = match[1];
  }

  return {
    conversationId: conversationMatch ? conversationMatch[1] : null,
    resolvedModelLabel
  };
}

export function readAgyLog(agyLogFile) {
  if (!agyLogFile) {
    return "";
  }
  try {
    const stat = fs.statSync(agyLogFile);
    if (stat.size > MAX_LOG_READ_BYTES) {
      // Conversation/model lines appear early — the head is enough.
      const fd = fs.openSync(agyLogFile, "r");
      try {
        const buffer = Buffer.alloc(MAX_LOG_READ_BYTES);
        const bytes = fs.readSync(fd, buffer, 0, MAX_LOG_READ_BYTES, 0);
        return buffer.toString("utf8", 0, bytes);
      } finally {
        fs.closeSync(fd);
      }
    }
    return fs.readFileSync(agyLogFile, "utf8");
  } catch {
    return "";
  }
}

/**
 * Run one agy print-mode invocation.
 *
 * @param {object} options
 * @param {string}  options.prompt           - written to stdin
 * @param {string}  [options.modelLabel]     - agy display label, passed to --model
 * @param {string}  [options.conversationId] - resume an existing conversation
 * @param {string}  [options.cwd]
 * @param {string}  [options.agyLogFile]     - per-run glog path (--log-file)
 * @param {number}  [options.timeoutMs]      - maps to --print-timeout; Node watchdog adds grace
 * @param {boolean} [options.skipPermissions]
 * @param {object}  [options.env]
 * @param {string}  [options.binary]
 * @param {number}  [options.watchdogGraceMs]
 * @returns {Promise<{ok: boolean, exitCode: number|null, stdout: string, stderr: string,
 *   conversationId: string|null, resolvedModelLabel: string|null, modelFellBack: boolean,
 *   timedOut: boolean, spawnErrorMessage: string|null}>}
 */
export function runAgyPrint(options = {}) {
  const {
    prompt,
    modelLabel,
    conversationId,
    cwd,
    agyLogFile,
    timeoutMs = DEFAULT_PRINT_TIMEOUT_MS,
    skipPermissions = false,
    sandbox = false,
    env,
    binary = "agy",
    watchdogGraceMs = DEFAULT_WATCHDOG_GRACE_MS
  } = options;

  if (sandbox) {
    fs.mkdirSync(REVIEW_CARGO_TARGET_DIR, { recursive: true });
  }
  return new Promise((resolve) => {
    const args = buildAgyArgs({ prompt, modelLabel, conversationId, agyLogFile, timeoutMs, skipPermissions, sandbox });
    const childEnv = sandbox ? sandboxEnv(env ?? process.env) : env;
    const child = spawn(binary, args, { cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
    _activeChild = child;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer = null;

    const watchdog = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
      killTimer = setTimeout(() => {
        if (settled) return;
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }, SIGKILL_DELAY_MS);
      killTimer.unref?.();
    }, timeoutMs + watchdogGraceMs);
    watchdog.unref?.();

    function settle(extra = {}) {
      if (settled) {
        return;
      }
      settled = true;
      if (_activeChild === child) {
        _activeChild = null;
      }
      clearTimeout(watchdog);
      clearTimeout(killTimer);

      const parsed = parseAgyLog(readAgyLog(agyLogFile));
      const exitCode = extra.exitCode ?? null;
      const spawnErrorMessage = extra.spawnErrorMessage ?? null;

      resolve({
        ok: exitCode === 0 && !timedOut && !spawnErrorMessage,
        exitCode,
        stdout,
        stderr,
        conversationId: parsed.conversationId ?? conversationId ?? null,
        resolvedModelLabel: parsed.resolvedModelLabel,
        modelFellBack: Boolean(
          modelLabel && parsed.resolvedModelLabel && modelSlug(parsed.resolvedModelLabel) !== modelSlug(modelLabel)
        ),
        timedOut,
        spawnErrorMessage
      });
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      settle({ spawnErrorMessage: err.message, exitCode: null });
    });

    child.on("close", (code) => {
      settle({ exitCode: code });
    });

    child.stdin.on("error", () => {
      // EPIPE when agy exits early — harmless.
    });
    child.stdin.end();
  });
}
