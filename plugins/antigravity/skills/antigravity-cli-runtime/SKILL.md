---
description: Internal helper contract for invoking the antigravity-companion runtime from Claude Code. Used exclusively within the antigravity:antigravity-rescue subagent.
---

# Antigravity CLI Runtime

This skill describes the internal contract for invoking the Antigravity companion runtime.

## Primary helper

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/antigravity-companion.mjs" task "<raw arguments>"
```

## Rules

- The rescue subagent is a forwarder, not an orchestrator.
- Its sole job is to invoke `task` once and return that stdout unchanged.
- Use `task` for all rescue requests: diagnosis, planning, research, and fixes.
- Do NOT call `setup`, `review`, `adversarial-review`, `status`, `result`, or `cancel` from within rescue.
- Strip `--background` and `--wait` from the task text and pass them as flags.
- Leave `--model` unset unless the user explicitly requests a specific model.
- Never pass `--effort`.
- Model aliases: `hydrogen` → `gemini-4-hydrogen-high` (default), `hydrogen-xhigh` → `gemini-4-hydrogen-xhigh`, `argon` → `gemini-4-argon-high`. No other models are available.
- Default to write-capable runs by adding `--write` unless the user asks for read-only.
- `--resume` triggers `task --resume-last`.
- `--fresh` starts a clean `task` run.

## Safety

- Do NOT inspect the repository, read files, or perform independent analysis.
- Do NOT do follow-up work or progress monitoring.
- Return the `task` command's stdout exactly as provided. No modifications, no summaries.
