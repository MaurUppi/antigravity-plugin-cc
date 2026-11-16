# Antigravity plugin for Claude Code

Use Antigravity (agy) from inside Claude Code for code reviews or to delegate tasks.

This plugin is for Claude Code users who want an easy way to use Google's Antigravity
models from the workflow they already have. Originally rebranded from `gemini-plugin-cc` in 2.0 (replacing the deprecated Gemini CLI backend with Antigravity's `agy`), it is now at 3.0.0 with `agy 1.5.9` print-mode and sandboxed review hardening.

## What You Get

- `/antigravity:review` for a normal read-only Antigravity review
- `/antigravity:adversarial-review` for a steerable challenge review
- `/antigravity:rescue`, `/antigravity:status`, `/antigravity:result`, and `/antigravity:cancel` to delegate work and manage background jobs

## Requirements

- **Antigravity (`agy` 1.5.9)** with a signed-in Google account.
  - The `agy` CLI ships with [Antigravity](https://antigravity.google). Usage counts against your Antigravity limits. Older `agy` versions that read the prompt from stdin are not supported.
- **Node.js 18.18 or later**
- **git** (reviews run inside disposable git worktrees)

## Install

Add the marketplace in Claude Code:

```bash
/plugin marketplace add btli/antigravity-plugin-cc
```

Install the plugin:

```bash
/plugin install antigravity
```

Reload plugins:

```bash
/reload-plugins
```

Then run:

```bash
/antigravity:setup
```

`/antigravity:setup` will tell you whether agy is ready.

If `agy` is missing, install [Antigravity](https://antigravity.google) — it bundles the CLI.

If agy is installed but not signed in yet, run it interactively once and complete the Google sign-in:

```bash
agy
```

After install, you should see:

- the slash commands listed below
- the `antigravity:antigravity-rescue` subagent in `/agents`

One simple first run is:

```bash
/antigravity:review --background
/antigravity:status
/antigravity:result
```

## Usage

### `/antigravity:review`

Runs a normal Antigravity review on your current work. It gives you a thorough code review covering bugs, security issues, performance problems, and maintainability concerns.

> [!NOTE]
> Code review especially for multi-file changes might take a while. It's generally recommended to run it in the background.

Use it when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base branch like `main`

Use `--base <ref>` for branch review. The ref must be a commit in the repository that shares history with HEAD; otherwise the command fails with a non-zero exit code. The same check applies to the default branch that branch review detects (the first local `main`, `master` or `trunk`, else `origin/HEAD`, falling back to `main`); when that branch does not exist or shares no history with HEAD, pass `--base <ref>` or `--scope working-tree`.

Supported flags:

- `--base <ref>` — compare `HEAD` against `<ref>`
- `--scope <auto|working-tree|branch>` — defaults to `auto` (working tree if dirty, else branch diff against the detected default branch when on another branch, else working tree)
- `--model <alias|id>` — override the model (see [Models](#models))
- `--wait` / `--background` — force foreground or background execution (when omitted, the slash command asks after checking repo size; the CLI runs foreground only when at most 2 files changed and diff stats are under 60 characters)
- `--timeout-ms <ms>` — foreground print timeout (default: 15 minutes)

Any text after the flags is passed as focus text (for example an audit axis brief) and added to the review prompt. Use [`/antigravity:adversarial-review`](#antigravityadversarial-review) when you want the design-challenge prompt instead of a defect review. Working-tree mode embeds up to 20 untracked files (24 KB max per file). An empty diff approves immediately without running `agy` in both foreground and background modes. A foreground review exits 1 (and a background review ends as `failed`) when `agy` fails or its output is not valid JSON with non-empty string `verdict` and `summary` (and an array `findings` when present).

Examples:

```bash
/antigravity:review
/antigravity:review --base main
/antigravity:review --scope working-tree
/antigravity:review --base main check error handling and concurrency
/antigravity:review --background
```

This command is read-only and will not perform any changes. When run in the background you can use [`/antigravity:status`](#antigravitystatus) to check on the progress and [`/antigravity:cancel`](#antigravitycancel) to cancel the ongoing task.

### `/antigravity:adversarial-review`

Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection (`--base <ref>`, `--scope <auto|working-tree|branch>`), `--model`, `--wait`, `--background`, `--timeout-ms`, worktree isolation, and sandbox rules as `/antigravity:review`. Like `/antigravity:review`, it takes optional trailing focus text after the flags.

Use it when you want:

- a review before shipping that challenges the direction, not just the code details
- review focused on design choices, tradeoffs, hidden assumptions, and alternative approaches
- pressure-testing around specific risk areas like auth, data loss, rollback, race conditions, or reliability

Examples:

```bash
/antigravity:adversarial-review
/antigravity:adversarial-review --base main challenge whether this was the right caching and retry design
/antigravity:adversarial-review --background look for race conditions and question the chosen approach
```

This command is read-only. It does not fix code.

### `/antigravity:rescue`

Hands a task to Antigravity through the `antigravity:antigravity-rescue` subagent.

Use it when you want Antigravity to:

- investigate a bug
- try a fix
- continue a previous Antigravity task
- take a faster or cheaper pass with a smaller model

> [!NOTE]
> Depending on the task and the model you choose these tasks might take a long time and it's generally recommended to force the task to be in the background or move the agent to the background.

It supports `--background`, `--wait`, `--model <alias|id>`, `--resume`, and `--fresh`. If you omit `--resume` and `--fresh`, the plugin can offer to continue the latest rescue thread for this repo. By default the `antigravity:antigravity-rescue` subagent delegates with write access (`--write`); ask for read-only behavior (or pass `--read-only` on the CLI) to prepend a read-only guard and run before/after `git status` drift detection. Any `--effort` flag is stripped and ignored.

Examples:

```bash
/antigravity:rescue investigate why the tests started failing
/antigravity:rescue fix the failing test with the smallest safe patch
/antigravity:rescue --resume apply the top fix from the last run
/antigravity:rescue --model hydrogen-xhigh investigate the flaky integration test
/antigravity:rescue --model argon fix the failing test with a second model
/antigravity:rescue --background investigate the regression
```

You can also just ask for a task to be delegated to Antigravity:

```text
Ask Antigravity to redesign the database connection to be more resilient.
```

**Notes:**

- if you do not pass `--model`, the plugin defaults to `gemini-4-hydrogen-high`.
- if you say `hydrogen-xhigh`, the plugin maps that to `gemini-4-hydrogen-xhigh`
- if you say `argon`, the plugin maps that to `gemini-4-argon-high`
- follow-up rescue requests can continue the latest Antigravity task in the repo

### `/antigravity:status`

Shows running and recent Antigravity jobs for the current repository (phases and 15 s heartbeat previews). Pass `[job-id]` (full ID or unique prefix) for single-job details with up to 10 log lines, or `--all` to list all finished jobs instead of the 8 most recent.

Examples:

```bash
/antigravity:status
/antigravity:status --all
/antigravity:status task-abc123
```

Use it to:

- check progress on background work
- see the latest completed job
- confirm whether a task is still running

### `/antigravity:result`

Shows the final stored Antigravity output for a finished job (defaults to the latest finished job in the current session, or pass `[job-id]` / unique prefix). Cancelled jobs are prefixed with a notice that the output comes from a stopped run.
When available, it also includes the agy conversation ID so you can reopen that run directly in Antigravity with `agy --conversation <conversation-id>`.

Examples:

```bash
/antigravity:result
/antigravity:result task-abc123
```

### `/antigravity:cancel`

Gracefully cancels an active background Antigravity job (pass `[job-id]` or unique prefix; optional when only one job is active). The plugin sends a cancel signal to the running job, waits for the worker to persist any partial output, and then confirms cancellation. If the worker does not exit cleanly within 3 seconds, it is force-terminated.

Examples:

```bash
/antigravity:cancel
/antigravity:cancel task-abc123
```

### `/antigravity:setup`

Checks whether Antigravity is installed and authenticated.

You can also use `/antigravity:setup` to manage the optional review gate.

#### Enabling review gate

```bash
/antigravity:setup --enable-review-gate
/antigravity:setup --disable-review-gate
```

When the review gate is enabled, the plugin uses a `Stop` hook to run a targeted Antigravity review based on Claude's response. If that review finds issues, the stop is blocked so Claude can address them first.

> [!WARNING]
> The review gate can create a long-running Claude/Antigravity loop and may drain usage limits quickly. Only enable it when you plan to actively monitor the session.

## Models

The default model is `gemini-4-hydrogen-high`. Pass `--model <alias>` to any review or rescue command:

| Alias | Model (`agy models` id) |
|---|---|
| `hydrogen` (default) | `gemini-4-hydrogen-high` |
| `hydrogen-xhigh` | `gemini-4-hydrogen-xhigh` |
| `argon` | `gemini-4-argon-high` |

Unknown values are passed to agy verbatim (for custom models defined in your agy settings). If agy does not recognize the model it would silently fall back to Flash Medium — the plugin detects this and fails the run instead.

## Typical Flows

### Review Before Shipping

```bash
/antigravity:review
```

### Hand A Problem To Antigravity

```bash
/antigravity:rescue investigate why the build is failing in CI
```

### Start Something Long-Running

```bash
/antigravity:adversarial-review --background
/antigravity:rescue --background investigate the flaky test
```

Then check in with:

```bash
/antigravity:status
/antigravity:result
```

## Architecture

This plugin mirrors the design of OpenAI's [codex-plugin-cc](https://github.com/openai/codex-plugin-cc), adapted for Google's Antigravity ecosystem.

| | Codex plugin | Antigravity plugin |
|---|---|---|
| **CLI** | [`@openai/codex`](https://developers.openai.com/codex/cli/) | `agy` (ships with [Antigravity](https://antigravity.google)) |
| **Protocol** | JSON-RPC via Codex app server | `agy --print <prompt>` subprocess, prompt as the `--print` value |
| **Session model** | Managed by app server broker | Conversation IDs parsed from agy's per-job glog |
| **Cancellation** | JSON-RPC cancel to app server | SIGTERM to worker → SIGTERM to agy child |
| **Auth** | ChatGPT account or OpenAI API key | Google account via `~/.gemini` |
| **Model aliases** | `spark` &rarr; `gpt-5.3-codex-spark` | `hydrogen` &rarr; `gemini-4-hydrogen-high`, `argon` &rarr; `gemini-4-argon-high` |

Both plugins share the same user-facing command surface (`review`, `adversarial-review`, `rescue`, `status`, `result`, `cancel`, `setup`) and the same background job system with foreground/background execution, conversation resume, and a stop-hook review gate.

### How it works

The plugin spawns `agy --print <prompt>` as a child process (agy 1.5.9 takes the prompt as the `--print` value and does not read stdin). A review prompt over 256 KB is written to a file in the review worktree, and agy is told to read it. Each task gets its own agy invocation with:

- **Watchdog timeouts** — agy's `--print-timeout` is the primary bound; a Node watchdog at timeout+30s catches hung processes.
- **Graceful cancellation** — background workers install a SIGTERM handler that forwards the signal to the active agy child. The cancel command sends SIGTERM to the worker first, waits up to 3 seconds for clean shutdown, and falls back to process tree termination.
- **Partial output preservation** — if a task fails (timeout, rate limit, crash), any output accumulated before the failure is returned instead of being discarded.
- **Review worktree isolation** — reviews run inside a disposable detached git worktree: at HEAD plus your uncommitted changes for a working-tree review, at HEAD for a branch review. agy has no read-only mode and auto-approves file writes in print mode; the worktree ensures stray writes never touch your real working tree.
- **Review sandbox** — reviews also run with `--sandbox` and `toolPermission: proceed-in-sandbox`: commands run without prompts and without network, and writes outside the worktree, `/tmp` and `REVIEW_CARGO_TARGET_DIR` (`--add-dir`) fail. Each review gets its own `run-*` build dir under `REVIEW_CARGO_TARGET_DIR` (removed on normal finish, kept on failure, stale dirs over 24 h swept). On macOS, `sandboxEnv` sets `CARGO_TARGET_<ARCH>_APPLE_DARWIN_RUNNER` (unless already set) to enforce a 120 s `SIGALRM` limit on Cargo test/example binaries.
- **Progress** — background reviews record the phases `starting`, `running`, `finalizing`; background tasks record `running`. Both end with `done`, `failed` or `cancelled`. While agy runs, a heartbeat every 15 s writes the elapsed time, the tool-call count and agy's last activity to the job log; `/antigravity:status` shows the last lines. `state.json` is written atomically via temp file + rename only on phase changes (retaining up to 50 jobs).
- **Cancelled stays cancelled** — a job that got cancel ends as `cancelled`, also when agy stops after the 3 s wait; `/antigravity:result` marks its output as from a stopped run.
- **Conversation resume** — conversation IDs are parsed from agy's per-job glog and stored in job state so you can resume with `--resume-last` or directly with `agy --conversation <id>`.

## Antigravity Integration

The Antigravity plugin wraps the `agy` CLI that ships with [Antigravity](https://antigravity.google). It uses the global `agy` binary installed in your environment.

### Moving The Work Over To Antigravity

Delegated tasks and any [stop gate](#enabling-review-gate) run can also be directly resumed inside Antigravity by running `agy --conversation <conversation-id>` with the specific conversation ID you received from running `/antigravity:result` or `/antigravity:status`.

This way you can review the Antigravity work or continue the work there.

## Migrating from the Gemini plugin

Every `/gemini:*` command has a 1:1 `/antigravity:*` replacement (`/gemini:review` → `/antigravity:review`, etc.).
Old Gemini job state is not migrated; finish or discard in-flight Gemini jobs before switching.
Session resume now uses agy conversations: `agy --conversation <conversation-id>` replaces `gemini --resume <session-id>`.

## Known limitations

- Requires `agy` 1.5.9 (tested); older versions that read prompts from stdin are not supported.
- `REVIEW_CARGO_TARGET_DIR` (`plugins/antigravity/scripts/lib/agy-cli.mjs`) is currently hardcoded to a machine-specific path (`/Volumes/P5800X/.tmp/agy-review-target`); on another machine where that path cannot be created, every sandboxed review fails until it is changed.
- Only review prompts (>256 KB) spill to a file; non-review task prompts are passed in `--print` argv, so task prompts exceeding OS `ARG_MAX` (~1 MB on macOS) fail to spawn (`E2BIG`).
- Read-only **tasks** rely on prompt guidance plus post-run `git status` drift detection (with a prominent warning); only reviews get hard worktree isolation.
- Review worktrees do not initialize git submodules; submodule content is absent from the worktree (the embedded diff still covers it).
- No token-level streaming: `/antigravity:status` shows phases and a 15 s heartbeat. Tool-call counts come from undocumented agy 1.5.9 log lines (and freeze once `.agy.log` exceeds 5 MB) and can stop working with another agy version.
- `state.json` uses atomic renames without a file lock, `MAX_JOBS` (50) pruning can drop older jobs, and `/antigravity:result` exits 0 when displaying a failed or cancelled job.
- agy must be signed in via one interactive run before background jobs work.

## FAQ

### Do I need a separate account for this plugin?

If you are already signed into Antigravity on this machine, that account should work immediately here too. This plugin uses your local agy authentication stored in `~/.gemini`.

If you only use Claude Code today and have not used Antigravity yet, you will need to sign in by running `agy` interactively once and completing Google sign-in. Run `/antigravity:setup` to check whether agy is ready.

### Does the plugin use a separate runtime?

No. This plugin spawns your local `agy` CLI as a subprocess using print mode (`--print`). There is no separate broker or app server — the plugin passes the prompt as the `--print` value and reads the result from stdout.

That means:

- it uses the same agy install you would use directly
- it uses the same local authentication state
- it uses the same repository checkout and machine-local environment
- conversations created by the plugin can be resumed directly with `agy --conversation <id>`

## License

Apache-2.0
