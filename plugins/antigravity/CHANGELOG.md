# Changelog

## 3.0.0

Requires agy 1.5.9 (tested). Older agy versions that read the prompt from stdin are not supported.

### Breaking

- The model aliases `pro`, `pro-low`, `flash`, `flash-medium`, `flash-low`,
  `sonnet`, `opus` and `gpt-oss` are gone. They are now passed to agy
  verbatim, which falls back and fails the run. New aliases: `hydrogen`
  (default `gemini-4-hydrogen-high`), `hydrogen-xhigh`, `argon`; `agy models`
  ids are accepted
- The prompt is the `--print` value (agy 1.5.9 no longer reads stdin); review
  prompts over 256 KB go to a file in the review worktree
- Two cases that used to exit 0 with `approve` (or end as `completed`) now
  fail: a `--base` or detected default branch that is not a commit sharing
  history with HEAD, and review output without a string `verdict` and
  `summary` or with non-array `findings`. A foreground review exits non-zero
  and a background one ends as `failed`
- Reviews need `REVIEW_CARGO_TARGET_DIR` (`lib/agy-cli.mjs`) to be creatable.
  It is currently a machine-specific path; on another machine every review
  that runs agy fails until it is changed

### Features

- Reviews run with `--sandbox`, `proceed-in-sandbox` and `--add-dir` for the
  shared cargo target dir; each run gets its own build dir in it, and run dirs
  older than 24 h are removed
- On macOS, cargo test binaries started inside a review get a 120 s time limit
  (`REVIEW_TEST_TIMEOUT_S`) through the cargo runner env var, unless that
  variable is already set
- Background jobs record phases (reviews: starting, running, finalizing;
  tasks: running) and a 15 s heartbeat with tool-call counts and agy's last
  activity; `/antigravity:status` shows them

### Fixes

- `--base` and the detected default branch must be commits that share history
  with HEAD; before, a bad ref diffed against nothing and reported `approve`
- A review whose output is not valid JSON with a string `verdict` and
  `summary`, or whose `findings` is not an array, fails instead of reading as
  "No material findings"
- A worker that throws ends its job as `failed` instead of leaving it
  `running`
- A cancelled job stays `cancelled` when agy stops after cancel's 3 s wait;
  `result` marks its output as from a stopped run
- `--background --scope working-tree` no longer fails on a repo without a
  default branch
- A background review with no diff approves without running agy, like the
  foreground review
- Branch reviews run in a worktree at HEAD and no longer copy uncommitted
  changes into it
- `state.json` is written through a temp file and a rename, and heartbeats no
  longer write it

## 2.0.0

Adaptation from the deprecated Gemini CLI to Antigravity (`agy`). Breaking: the
plugin is now named `antigravity` and all commands moved from `/gemini:*` to
`/antigravity:*`.

- Execution backend replaced: ACP (JSON-RPC over stdio) → `agy --print`
  subprocess with prompt on stdin
- Reviews run inside disposable git worktrees (agy has no read-only mode);
  stray writes can never touch your working tree
- Conversation IDs captured from agy's log; resume via `--resume-last` or
  `agy --conversation <id>`
- Models are agy display labels; default `Gemini 3.1 Pro (High)`; aliases:
  `pro`, `pro-low`, `flash`, `flash-medium`, `flash-low`, `sonnet`, `opus`,
  `gpt-oss`
- Silent model fallback (unrecognized `--model` values) is detected and
  reported as a failure instead of reviewing with the wrong model
- Read-only tasks get a prompt guard plus before/after `git status` drift
  detection with a prominent warning
- Auth via the shared `~/.gemini` Google account state; sign in by running
  `agy` interactively once

## 1.0.0

Initial release.

- `/gemini:review` for standard code review
- `/gemini:adversarial-review` for steerable challenge review
- `/gemini:rescue` for task delegation via subagent
- `/gemini:status`, `/gemini:result`, `/gemini:cancel` for job management
- `/gemini:setup` for installation and authentication check
- `gemini:gemini-rescue` subagent for proactive task delegation
- Stop-time review gate (optional, via `/gemini:setup --enable-review-gate`)
- Background job support with detached workers
- Session resume support via Gemini CLI session IDs
