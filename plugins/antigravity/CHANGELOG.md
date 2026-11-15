# Changelog

## Unreleased (local, version still 2.0.0)

Breaking: the model aliases `pro`, `pro-low`, `flash`, `flash-medium`,
`flash-low`, `sonnet`, `opus` and `gpt-oss` are gone. They are now passed to
agy verbatim, which falls back and fails the run.

- agy 1.5.9: the prompt is the `--print` value (agy no longer reads stdin);
  review prompts over 256 KB go to a file in the review worktree
- Model aliases `hydrogen` (default `gemini-4-hydrogen-high`),
  `hydrogen-xhigh`, `argon`; `agy models` ids are accepted
- Reviews run with `--sandbox`, `proceed-in-sandbox` and `--add-dir` for one
  shared cargo target dir (`REVIEW_CARGO_TARGET_DIR` in `lib/agy-cli.mjs`,
  currently a machine-specific path)
- `--base` and the detected default branch must be commits that share history
  with HEAD; otherwise the review fails instead of approving an empty diff
- A foreground review that did not run or returned unusable output exits 1; a
  background one ends as `failed`
- Background jobs record phases and a 15 s heartbeat with tool-call counts
- A cancelled job stays `cancelled`; `result` marks its output as from a
  stopped run

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
