<p align="center">
  <img src="assets/pipeline-diagram.png" alt="Bug Hunter pipeline" width="100%" />
</p>

<h1 align="center">/bug-hunter</h1>

<p align="center">
  <strong>Adversarial bug detection + autonomous fix for coding agents</strong><br/>
  Sequential-first pipeline for real runtime bugs, with safe branch-based remediation.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" /></a>
</p>

---

## Overview

Bug Hunter is built for issues linters miss: runtime logic flaws, race conditions, auth gaps, and cross-file contract mismatches.

The system uses adversarial roles in isolated context:

1. Recon maps architecture and trust boundaries.
2. Hunter finds bugs.
3. Skeptic tries to disprove findings.
4. Referee decides final verdicts.
5. Fix phase applies canary-first, confidence-gated fixes.

A mandatory re-audit rejection pass drops contradicted or non-reproducible findings before final confirmed counts.

---

## Default Behavior

Bug Hunter now runs in **fix-by-default mode**.

- If confirmed eligible bugs exist, Phase 2 starts automatically.
- If no confirmed bugs exist, run ends after report.
- Use `--scan-only` for report-only mode with no edits.

All edits happen on `bug-hunter-fix-<timestamp>` with checkpoint commits and auto-revert on regression.

---

## Commands

```bash
/bug-hunter                               # full scan + auto-fix (default)
/bug-hunter src/                          # target directory
/bug-hunter lib/auth.ts                   # target file
/bug-hunter -b feature-xyz                # branch diff vs main
/bug-hunter -b feature-xyz --base dev     # branch diff vs custom base
/bug-hunter --staged                      # staged files scan
/bug-hunter --scan-only src/              # report-only mode
/bug-hunter --fix src/                    # explicit auto-fix (alias of default)
/bug-hunter --autonomous src/             # explicit no-intervention auto-fix
/bug-hunter --fix --approve src/          # ask before each fix
/bug-hunter --loop src/                   # loop coverage mode
/bug-hunter --loop --fix src/             # loop + fix mode
```

---

## Pipeline

### Phase 1: Find + Verify

```
Recon -> Deep Hunter -> Skeptic -> Referee -> Re-audit gate
```

### Phase 2: Fix + Verify

```
Fix branch -> canary subset -> targeted checks -> rollout -> full checks -> post-fix re-scan
```

Fixes are single-writer and sequential by default.

---

## Scaling Strategy

Bug Hunter uses a hybrid **index + delta + chunk** model for large repositories.

### Persistent index

`code-index.cjs` builds `.claude/bug-hunter-index.json` with:

- symbols
- import dependencies
- lightweight call graph
- trust-boundary tags

### Delta mode

`delta-mode.cjs` starts from changed files and expands by dependency hops.

- initial scope: changed files + 1/2-hop deps
- expansion trigger: low-confidence findings
- expansion inputs: low-confidence files + critical boundary overlays

### Chunk state + facts

`bug-hunter-state.cjs` stores:

- chunk status and retries
- hash cache (skip unchanged files)
- bug ledger with confidence
- chunk fact cards (contracts, auth assumptions, invariants)
- consistency report + fix plan

### Global consistency before fix

`run-bug-hunter.cjs` performs a final consistency pass:

- duplicate/reused bug-id detection
- conflicting claims at same location
- low-confidence summary

Then it generates canary-first fix planning.

---

## Safety Model

- Dedicated fix branch per run.
- Single-writer lock via `.claude/bug-hunter-fix.lock`.
- Checkpoint commit per bug/cluster.
- Targeted verification before full-suite verification.
- Automatic `git revert` for regression-causing fixes.
- Post-fix delta re-scan for fixer-introduced bugs.
- Dirty tree stash + restore attempt with conflict reporting.

---

## Backend Adaptation

Bug Hunter picks one backend and falls back automatically:

1. `spawn_agent` + `wait`
2. native `subagent`
3. team-agent tooling
4. local sequential fallback

---

## Context7

Context7 lookups are optional and non-blocking.

- If available, Skeptic/Hunter use docs to validate framework claims.
- Missing `CONTEXT7_API_KEY` does not block execution.

Setup (optional):

```bash
export CONTEXT7_API_KEY="your-api-key"
```

---

## Orchestrator

For long or flaky runs use:

```bash
node scripts/run-bug-hunter.cjs run \
  --skill-dir /absolute/path/to/bug-hunter \
  --files-json .claude/source-files.json \
  --changed-files-json .claude/changed-files.json \
  --mode extended \
  --use-index true \
  --delta-mode true \
  --delta-hops 2 \
  --expand-on-low-confidence true \
  --canary-size 3 \
  --timeout-ms 120000 \
  --max-retries 1 \
  --backoff-ms 1000
```

Artifacts:

- `.claude/bug-hunter-run.log`
- `.claude/bug-hunter-state.json`
- `.claude/bug-hunter-index.json`
- `.claude/bug-hunter-facts.json`
- `.claude/bug-hunter-consistency.json`
- `.claude/bug-hunter-fix-plan.json`

---

## Modes

| Mode | File count | Execution |
|------|------------|-----------|
| Single-file | 1 | Hunter + Skeptic + Referee |
| Small | 2-10 | Recon + Hunter + Skeptic + Referee |
| Parallel (hybrid) | 11-FILE_BUDGET | Recon + deep Hunter (+ optional read-only triage) + Skeptic + Referee |
| Extended | FILE_BUDGET+1 to FILE_BUDGET*2 | Sequential chunked runs |
| Scaled | FILE_BUDGET*2+1 to FILE_BUDGET*3 | State-driven chunked runs |
| Loop | > FILE_BUDGET*3 | Iterative coverage loop |

---

## What It Catches

- security vulnerabilities
- logic errors
- runtime error-handling gaps
- race conditions
- API contract breaks
- cross-file assumption mismatches
- data integrity bugs

Not a style/lint tool.

---

## Tested Languages

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java / Kotlin
- Ruby
- PHP

---

## Repository Layout

```text
bug-hunter/
  SKILL.md
  prompts/
  modes/
  scripts/
    run-bug-hunter.cjs
    code-index.cjs
    delta-mode.cjs
    bug-hunter-state.cjs
    payload-guard.cjs
    fix-lock.cjs
    context7-api.cjs
    tests/
  test-fixture/
  assets/
```

---

## Self-Test

The included fixture contains 6 planted bugs (2 Critical, 3 Medium, 1 Low).

```bash
/bug-hunter test-fixture/
```

Expected outcome: all planted bugs should be confirmed with at least one Skeptic challenge recorded.

---

## Install / Update / Remove

```bash
# install
git clone https://github.com/codexstar69/bug-hunter.git ~/.agents/skills/bug-hunter

# update
cd ~/.agents/skills/bug-hunter && git pull

# remove
rm -rf ~/.agents/skills/bug-hunter
```

---

## License

MIT — see [LICENSE](LICENSE)
