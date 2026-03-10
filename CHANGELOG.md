# Changelog

## 2.1.0 — 2026-03-10

### v3 security pipeline + dependency scanner reliability

- STRIDE/CWE fields in Hunter findings format, with CWE quick-reference mapping for security categories
- Skeptic hard-exclusion fast path (15 false-positive classes) before deep review
- Referee security enrichment: reachability, exploitability, CVSS 3.1, and PoC blocks for critical/high security bugs
- Threat model support: `--threat-model` flag, `prompts/threat-model.md`, Recon/Hunter threat-context wiring
- Dependency scan support: `--deps` flag and `scripts/dep-scan.cjs` output to `.bug-hunter/dep-findings.json`
- JSON report contract: `.bug-hunter/findings.json` plus canonical `.bug-hunter/report.md`
- Few-shot calibration examples for Hunter and Skeptic in `prompts/examples/`
- `dep-scan.cjs` lockfile-aware audits (`npm`, `pnpm`, `yarn`, `bun`) and non-zero audit exit handling so vulnerability exits are not misreported as scanner failures

## 2.0.0 — 2026-03-10

### Structural overhaul — triage pipeline + 36% token reduction

**Pipeline restructure:**
- Triage moved to Step 1 (after arg parse) — was running before target resolved
- All mode files consume triage JSON — riskMap, scanOrder, fileBudget flow downstream
- Recon demoted to enrichment — no longer does file classification when triage exists
- Step 7.0 re-audit gate removed — duplicated Referee's work

**Deduplication:**
- `modes/_dispatch.md` — shared dispatch patterns (18 references across modes)
- Mode files compressed: small 7.3→2.9KB, parallel 7.9→4.2KB, extended 7.1→3.3KB, scaled 7.3→2.7KB
- Skip-file patterns consolidated — single authoritative list in SKILL.md
- Error handling table updated with correct step references

**Dead weight removed:**
- FIX-PLAN.md deleted (26KB dead planning doc)
- README.md compressed from 8.5KB to 3.7KB
- code-index.cjs marked optional

**Prompt compression:**
- hunter.md: scope rules and security checklist compressed
- recon.md: output format template and "What to map" sections compressed
- referee.md: tiering rules, re-check section, output format compressed
- skeptic.md: false-positive patterns compressed to inline format

**Logic gaps fixed:**
- Branch-diff/staged optimization note in Step 3
- single-file.md: local-sequential backend support added

**Size:** 187,964 → 119,825 bytes (36% reduction, ~30K tokens)

## 1.0.0 — 2026-03-10

### Zero-token pre-recon triage (`triage.cjs`)
- `scripts/triage.cjs` runs before any LLM agent — 0 tokens, <2s for 2,000+ files
- FILE_BUDGET, strategy, and domain map decided by triage, not Recon
- Writes `.bug-hunter/triage.json` with strategy, fileBudget, domains, riskMap, scanOrder
- `local-sequential.md` with full phase-by-phase instructions
- Subagent wrapper template in `templates/subagent-wrapper.md`
- Coverage enforcement — partial audits produce explicit warnings
- Large codebase strategy with domain-first tiered scanning
