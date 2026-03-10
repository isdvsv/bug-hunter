# /bug-hunter

**Adversarial bug hunting for coding agents.** Find real runtime bugs, verify them through an adversarial pipeline, and auto-fix with guardrails.

## Quick Start

```bash
/bug-hunter                               # full project, auto-fix by default
/bug-hunter src/                          # target directory
/bug-hunter lib/auth.ts                   # target file
/bug-hunter -b feature-xyz                # branch diff vs main
/bug-hunter --staged                      # staged files
/bug-hunter --scan-only src/              # report-only, no code edits
/bug-hunter --fix --approve src/          # prompt before each fix
/bug-hunter --loop src/                   # iterative coverage for large repos
```

## Pipeline

**Phase 1 — Find & Verify:**
```
Triage (0-token) → Recon (map) → Hunter (scan) → Skeptic (challenge) → Referee (verdict)
```

**Phase 2 — Fix & Verify (default when bugs confirmed):**
```
Git branch → canary fixes → targeted verify → full verify → report
```

### How it works

1. **Triage** — zero-token Node.js filesystem scan. Classifies files, computes context budget, picks execution strategy. Runs in <2s.
2. **Recon** — identifies tech stack, trust boundaries, and patterns. Uses triage data for file classification.
3. **Hunter** — deep scan for behavioral bugs (logic errors, security vulns, race conditions, error handling gaps).
4. **Skeptic** — adversarial review. Tries to disprove each finding. Only challenges with >67% confidence.
5. **Referee** — impartial final judge. Re-reads code independently for high-severity bugs. Makes REAL BUG / NOT A BUG verdicts.
6. **Fixer** — surgical minimal fixes on a dedicated branch with checkpoint commits and auto-revert on regression.

### Why this works better than single-agent review

Different agents have **opposite incentives**. The Hunter earns points for real bugs but loses points for false positives. The Skeptic earns points for disproving false positives but loses 2× for dismissing real bugs. The Referee trusts neither.

## Modes

| Mode | Files | Strategy |
|------|-------|----------|
| Single-file | 1 | Direct Hunter → Skeptic → Referee |
| Small | 2–10 | Recon + single deep pass |
| Parallel | 11–FILE_BUDGET | Deep scan + optional dual-lens scout |
| Extended | FILE_BUDGET+1 to ×2 | Sequential chunked scanning |
| Scaled | ×2+1 to ×3 | State-driven chunks with resume |
| Large-codebase | >×3 | Domain-scoped pipelines + boundary audits |

## Guardrails

**Code safety:** dedicated fix branch, single-writer lock, checkpoint commits, auto-revert for regressions, dirty-tree stash/restore.

**False-positive control:** adversarial skeptic, referee arbitration, confidence-gated auto-fix (≥75%).

**Scale:** hash-cache skip for unchanged files, chunk checkpoints for resume, delta-first scope reduction.

## Languages

TypeScript/JavaScript, Python, Go, Rust, Java/Kotlin, Ruby, PHP.

## Self-Test

```bash
/bug-hunter test-fixture/
```

6 planted bugs (2 Critical, 3 Medium, 1 Low). Pipeline should confirm all 6 and challenge at least 1 false positive.

## Layout

```
bug-hunter/
  SKILL.md              # main orchestration
  modes/                # per-mode execution instructions
    _dispatch.md        # shared dispatch patterns
  prompts/              # role-specific prompts
  scripts/              # Node.js helpers (triage, state, index, etc.)
  templates/            # subagent wrapper template
  test-fixture/         # self-test fixture
```

## Install / Update

```bash
git clone https://github.com/codexstar69/bug-hunter.git ~/.agents/skills/bug-hunter
cd ~/.agents/skills/bug-hunter && git pull  # update
```

MIT License
