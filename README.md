# /bug-hunter

**Adversarial bug hunting for coding agents.** Find real runtime bugs, verify them through an adversarial pipeline, and auto-fix with guardrails. Now with STRIDE/CWE classification, threat modeling, dependency CVE scanning, and structured JSON output.

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
/bug-hunter --deps src/                   # include dependency CVE scan
/bug-hunter --threat-model src/           # generate/use STRIDE threat model
/bug-hunter --deps --threat-model src/    # full security audit
```

## What's New in v3

- **STRIDE + CWE classification** — every security finding tagged with STRIDE category and CWE ID
- **Threat model generation** — `--threat-model` flag creates `.bug-hunter/threat-model.md` using STRIDE methodology
- **Dependency CVE scanning** — `--deps` flag audits npm/pnpm/yarn/pip/go/rust packages for reachable CVEs
- **Enriched security verdicts** — Referee adds reachability, exploitability, CVSS 3.1 scoring, and proof-of-concept for critical/high security bugs
- **Hard false-positive rules** — 15 battle-tested exclusion patterns in Skeptic for zero-analysis fast dismissal
- **Structured JSON output** — `.bug-hunter/findings.json` for CI/CD gating and dashboards
- **Few-shot calibration** — Hunter and Skeptic get worked examples before scanning
- **Agent-agnostic** — works with Pi, Claude Code, Codex, or any agent with Read/Bash tools

## Pipeline

**Phase 1 — Find & Verify:**
```
Triage (0-token) → Threat Model (opt) → Dep Scan (opt) → Recon → Hunter → Skeptic → Referee
```

**Phase 2 — Fix & Verify (default when bugs confirmed):**
```
Git branch → canary fixes → targeted verify → full verify → report
```

### How it works

1. **Triage** — zero-token Node.js filesystem scan. Classifies files, computes context budget, picks strategy. <2s for 2,000+ files.
2. **Threat Model** *(opt-in)* — generates STRIDE threat model with trust boundaries, vulnerability patterns, and component-level risk analysis.
3. **Dep Scan** *(opt-in)* — runs lockfile-aware `npm/pnpm/yarn audit`, searches codebase for actual usage of vulnerable APIs, classifies reachability.
4. **Recon** — identifies tech stack, trust boundaries, patterns. Consumes triage data and threat model if available.
5. **Hunter** — deep scan for behavioral bugs. Tags security findings with STRIDE category + CWE ID. Uses threat model context for targeted analysis.
6. **Skeptic** — adversarial review. 15 hard exclusion rules for instant false-positive dismissal, then deep analysis for remaining findings. >67% confidence required.
7. **Referee** — impartial final judge. Re-reads code independently. For confirmed security bugs: adds reachability classification, exploitability rating, CVSS 3.1 score, and proof-of-concept.
8. **Fixer** — surgical minimal fixes on a dedicated branch with checkpoint commits and auto-revert on regression.

### Why this works better than single-agent review

Different agents have **opposite incentives**. The Hunter earns points for real bugs but loses points for false positives. The Skeptic earns points for disproving false positives but loses 2× for dismissing real bugs. The Referee trusts neither.

## Output

Every run produces:

| File | Format | Purpose |
|------|--------|---------|
| `.bug-hunter/report.md` | Markdown | Human-readable final report |
| `.bug-hunter/findings.json` | JSON | Machine-readable for CI/CD gating |
| `.bug-hunter/triage.json` | JSON | File classification and strategy |
| `.bug-hunter/threat-model.md` | Markdown | STRIDE threat model (if `--threat-model`) |
| `.bug-hunter/dep-findings.json` | JSON | Dependency CVE results (if `--deps`) |

### Security finding format

```
BUG-1 | Severity: Critical | Points: 10
- File: src/api/users.ts
- Line(s): 45-49
- Category: security
- STRIDE: Tampering
- CWE: CWE-89
- Claim: SQL injection via unsanitized query parameter
- Reachability: EXTERNAL
- Exploitability: EASY
- CVSS: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N (9.1)
```

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

**False-positive control:** adversarial skeptic with 15 hard exclusion rules, referee arbitration, confidence-gated auto-fix (≥75%).

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
  SKILL.md                          # main orchestration
  modes/                            # per-mode execution instructions
    _dispatch.md                    # shared dispatch patterns
  prompts/                          # role-specific prompts
    threat-model.md                 # STRIDE threat model template
    examples/                       # few-shot calibration examples
      hunter-examples.md            # 3 confirmed + 2 false positive examples
      skeptic-examples.md           # 2 accepted + 2 disproved + 1 manual review
  scripts/                          # Node.js helpers
    triage.cjs                      # zero-token file classification
    dep-scan.cjs                    # dependency CVE scanner
    run-bug-hunter.cjs              # chunk orchestrator
    bug-hunter-state.cjs            # persistent state management
    payload-guard.cjs               # subagent payload validation
    delta-mode.cjs                  # changed-file scope reduction
    fix-lock.cjs                    # single-writer lock for fixers
    context7-api.cjs                # doc-lookup integration
    code-index.cjs                  # cross-domain dependency analysis (optional)
  templates/                        # subagent wrapper template
  test-fixture/                     # self-test fixture with planted bugs
```

## Install / Update

```bash
git clone https://github.com/codexstar69/bug-hunter.git ~/.agents/skills/bug-hunter
cd ~/.agents/skills/bug-hunter && git pull  # update
```

MIT License
