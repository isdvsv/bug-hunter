# Bug Hunter Skill — End-to-End Fix Plan v2

**Date:** 2026-03-10
**Status:** Ready to execute

---

## Root Cause Summary

The skill has grown organically. Each fix added instructions without removing what it replaced. The result: **47K tokens of .md files** with structural contradictions, massive duplication, dead weight, and a triage system that's wired in at SKILL.md but has zero consumers downstream.

---

## Issues (ordered by impact)

### P0: Structural — The pipeline can't run correctly

#### Issue 1: Step ordering breaks triage
**SKILL.md Step 0.4** runs `triage.cjs scan "<TARGET_PATH>"` but `<TARGET_PATH>` is not resolved until **Step 1** (Parse arguments and resolve target). The triage script literally cannot run because the target doesn't exist yet.

**Fix:** Move triage into Step 1, AFTER arg parsing resolves the target path. Renumber:
- Step 0: Preflight (SKILL_DIR, Node.js, helper scripts, backend selection)
- Step 1: Parse arguments → resolve target → run triage → report
- Step 2: Read prompt files (on demand)
- Step 3: Determine mode (from triage output)

#### Issue 2: Triage output has zero downstream consumers
Triage writes `.claude/bug-hunter-triage.json` with `strategy`, `fileBudget`, `domains`, `scanOrder`, `domainFileLists`, `riskMap`. But:
- **No mode file reads it.** Not `small.md`, not `parallel.md`, not `extended.md`, not `scaled.md`, not `local-sequential.md`.
- **No mode file uses `scanOrder`** to order files for Hunters.
- **No mode file uses `domains`** for chunking decisions.
- **No mode file uses `riskMap`** as the pre-built risk map to skip Recon classification.
- **`run-bug-hunter.cjs`** doesn't know triage exists.
- The triage JSON is generated, reported to the user, and then forgotten.

**Fix:** Every mode file must:
1. Check for `.claude/bug-hunter-triage.json` at the start
2. If present, use `triage.riskMap` as the initial risk map (skip Recon's file classification)
3. Use `triage.scanOrder` as the Hunter's file list
4. Use `triage.fileBudget` instead of recomputing
5. Recon becomes an *enrichment* phase (tech stack, git churn, trust boundary patterns) not a *classification* phase

#### Issue 3: `local-sequential` ignores triage and recomputes everything
`local-sequential.md` Phase A tells the agent to:
- Discover source files (triage already did this)
- Classify every file into CRITICAL/HIGH/MEDIUM (triage already did this)
- Compute FILE_BUDGET (triage already did this)
- Measure file sizes with `wc -l` (triage already sampled 30 files)

**Fix:** `local-sequential.md` Phase A should check for triage JSON first. If present, skip classification and FILE_BUDGET computation. Recon becomes: read 3-5 key files to identify tech stack + git churn, then proceed to Phase B using triage's scanOrder.

#### Issue 4: `small.md` recomputes FILE_BUDGET in Recon
Line 16: `Compute FILE_BUDGET (should be ≥ file count for small mode).`

**Fix:** Remove FILE_BUDGET computation. Small mode doesn't need FILE_BUDGET — all files fit in one pass by definition. If triage said "small", trust it.

#### Issue 5: Step 7 "Verification re-audit gate" is orphaned
The gate says "Re-audit all Critical findings" and "mark REJECTED_FALSE_POSITIVE" — but:
- No prompt file defines how to do this re-audit
- No state file tracks `REJECTED_FALSE_POSITIVE` status
- No mode file mentions this step
- It duplicates the Referee's job

**Fix:** Remove the verification re-audit gate. The Referee already does independent verification with tiered evaluation. A fourth pass adds no value and wastes tokens.

---

### P1: Duplication — 4 mode files repeat the same boilerplate

#### Issue 6: Recon/Skeptic/Referee dispatch boilerplate repeated 4×
`small.md`, `parallel.md`, `extended.md`, `scaled.md` each contain near-identical sections for:
- Recon dispatch (30-40 lines each)
- Skeptic dispatch (25-35 lines each)
- Referee dispatch (25-35 lines each)

Each section has the same payload-guard generate → fill → validate → dispatch → wait pattern. Total: ~300 lines of duplicated dispatch boilerplate across 4 files.

**Fix:** Create `modes/_dispatch.md` — a shared dispatch reference. Each mode file says "Run Recon using the standard dispatch pattern (see `_dispatch.md`)." The dispatch file contains the backend-specific patterns once.

#### Issue 7: Step numbering conflicts
`single-file.md` uses Step 4s/5s/6s — same suffix as `scaled.md` (Step 4s/5s/6s). `small.md` uses 4m/5m/6m/7m. `parallel.md` uses 4p/5p/6p/7p. `extended.md` uses 4e/5e/6e/7e.

These suffixed step numbers serve no purpose — the agent only reads ONE mode file per run, so there's no collision risk. But they add cognitive overhead for the LLM parsing the instructions.

**Fix:** Drop suffixes. All mode files use Step 4/5/6/7 (or just: Recon / Hunter / Skeptic / Referee headings).

---

### P2: Dead weight — files/sections that waste tokens

#### Issue 8: `FIX-PLAN.md` is 26KB of superseded planning doc
This was the original analysis doc from a previous session. It's not referenced by any prompt, mode, or script. An LLM that reads the skill directory will load 26KB of stale planning notes.

**Fix:** Delete `FIX-PLAN.md`. The CHANGELOG captures what was done. This plan document replaces it.

#### Issue 9: Recon prompt output format section is too verbose
`recon.md` has a 90-line output format template with markdown code blocks showing the exact format. This is fine for documentation but the LLM doesn't need a 90-line template — it needs 20 lines of structure.

**Fix:** Compress the output format to the essential structure. Remove the JSON example for domain map (triage already produces this). Remove the FILE_BUDGET computation section (triage does this). Target: cut recon.md from 230 lines to ~150 lines.

#### Issue 10: CHANGELOG.md is 10KB and growing
The CHANGELOG documents every internal iteration of the skill development. An LLM reading the skill doesn't need this. It's not referenced by any prompt.

**Fix:** Move CHANGELOG.md out of the main skill read path. Either:
- Rename to `_CHANGELOG.md` (underscore prefix = skip by convention), OR
- Add it to a `.skillignore` pattern if the skill loader supports it, OR
- Just truncate to the latest 2 entries

#### Issue 11: `run-bug-hunter.cjs` (26KB) is never actually invoked by any mode
SKILL.md mentions it once in a `node ... run` command block, but no mode file references it. The script does complex chunk orchestration with worker spawning, timeouts, retries, canary-first execution — but the LLM agent executing the skill never calls it. The same chunk orchestration is described in prose in `extended.md`, `scaled.md`, and `local-sequential.md`.

**Fix:** Either:
- (a) Wire `run-bug-hunter.cjs` into the mode files as the primary chunk executor, OR
- (b) Remove `run-bug-hunter.cjs` and keep the prose-based chunk loop in mode files

Option (a) is better: the script handles timeouts, retries, and journaling that the LLM can't do reliably. But it requires the mode files to actually invoke it.

#### Issue 12: `code-index.cjs` (15KB) — is it used?
The code index builds a dependency graph, extracts symbols/imports/calls, and supports `query-bugs` for expanding scan scope. But:
- Only SKILL.md references it in the helper scripts `ls` check
- No mode file invokes `code-index.cjs build` or `code-index.cjs query-bugs`
- No prompt tells the agent to use it

**Fix:** Either wire it into the pipeline (e.g., triage or Recon uses it to identify cross-domain imports) or document it as optional and remove from the required scripts check.

---

### P3: Token efficiency — the LLM reads too much per run

#### Issue 13: Agent reads 1 mode file + SKILL.md + prompts = ~15K tokens minimum
A minimal run (small mode, local-sequential) forces the agent to read:
- `SKILL.md`: ~6,600 tokens
- `modes/small.md`: ~1,800 tokens
- `prompts/recon.md`: ~2,400 tokens
- `prompts/hunter.md`: ~3,000 tokens
- `prompts/skeptic.md`: ~2,000 tokens
- `prompts/referee.md`: ~2,500 tokens
- **Total: ~18,300 tokens** just for instructions, before reading a single source file

For a 5-file scan, the instructions are 4× larger than the code being scanned.

**Fix:** Compress all prompt files. Specific targets:
- `hunter.md` (3,058 tokens → ~2,000): Remove the verbose "OUT OF SCOPE" list (the agent knows what a linter does). Compress Phase 3 security checklist. Remove the repeated skip-file patterns (already in SKILL.md).
- `recon.md` (2,445 tokens → ~1,500): Remove FILE_BUDGET computation (triage does it). Compress output format. Remove scaling strategy section (triage decides this).
- `referee.md` (2,500 tokens → ~1,800): Compress the scaling strategy (20+ bugs tiering). Remove the verbose re-check section.
- `skeptic.md` (2,054 tokens → ~1,500): Compress the false positive patterns list.
- `SKILL.md` (6,665 tokens → ~4,500): Remove the detailed `run-bug-hunter.cjs` invocation block (move to mode files). Compress Step 0 preflight (much of it is boilerplate). Remove Step 7.0 re-audit gate.

#### Issue 14: Skip-file patterns duplicated in SKILL.md + hunter.md
The same list of file extensions to skip (`.md`, `.json`, `.yaml`, `.lock`, `.svg`, etc.) appears in both `SKILL.md` (Target section) and `hunter.md` (Scope rules). That's ~30 lines × 2 = 60 lines of duplication.

**Fix:** Keep the authoritative list in `SKILL.md` only. In `hunter.md`, say: "Apply the skip rules from your assignment. Do not scan config, docs, or asset files."

---

### P4: Logic gaps

#### Issue 15: `large-codebase.md` Tier 0 says "already done by triage" but Tier 1 doesn't consume triage data
Tier 1 says "Run Recon on THIS domain only → domain-specific risk map" but doesn't say to pass the triage `domainFileLists[domain]` as the Recon target. The agent has to rediscover the files that triage already found.

**Fix:** Tier 1 should explicitly say: "Get this domain's file list from `triage.domainFileLists[domainPath]`. Pass these files to the domain Recon."

#### Issue 16: `parallel.md` "dual-lens triage" concept is confusing
The word "triage" in `parallel.md` (Step 5p) means "optional read-only dual-lens pre-scan with two Hunters" — completely different from `triage.cjs` which is a zero-token filesystem scan. This naming collision will confuse agents.

**Fix:** Rename the parallel mode's pre-scan to "dual-lens pre-scan" or "scout pass" everywhere. Reserve "triage" exclusively for `triage.cjs`.

#### Issue 17: No mode file handles branch-diff or staged mode specially
When the user runs `/bug-hunter -b feature-xyz` or `/bug-hunter --staged`, the file list is typically 5-20 files. But the mode selection still goes through the full strategy table. For branch diffs, the optimal behavior is:
- Skip Recon entirely (the diff files are the risk map)
- Run Hunter directly on the changed files
- Prioritize recently-changed files (they all are)

No mode file has branch-diff-specific optimizations.

**Fix:** Add a note in SKILL.md Step 3: "For branch-diff and staged modes, if file count ≤ FILE_BUDGET, always use `small` or `parallel` mode regardless of total codebase size. The triage script already handles this correctly since it only scans the provided target."

---

## Execution Plan (ordered by priority, with dependencies)

### Phase 1: Structural fixes (P0) — must be done first

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 1.1 | Move triage from Step 0.4 to Step 1 (after arg parse). Renumber steps. | `SKILL.md` | — |
| 1.2 | Wire triage output into `local-sequential.md` Phase A: check for triage JSON, skip classification/FILE_BUDGET if present, use scanOrder | `modes/local-sequential.md` | 1.1 |
| 1.3 | Wire triage output into `small.md`: remove FILE_BUDGET recomputation, use triage.riskMap if present | `modes/small.md` | 1.1 |
| 1.4 | Wire triage output into `parallel.md`: use triage data for risk map, rename "triage" pre-scan to "scout pass" | `modes/parallel.md` | 1.1 |
| 1.5 | Wire triage output into `extended.md`: use triage.scanOrder for chunk building | `modes/extended.md` | 1.1 |
| 1.6 | Wire triage output into `scaled.md`: use triage.scanOrder for chunk building | `modes/scaled.md` | 1.1 |
| 1.7 | Wire triage output into `large-codebase.md` Tier 1: pass domainFileLists to domain Recon | `modes/large-codebase.md` | 1.1 |
| 1.8 | Remove Step 7.0 verification re-audit gate | `SKILL.md` | — |
| 1.9 | Update `recon.md`: remove FILE_BUDGET computation entirely (triage does it). Recon only checks for triage JSON and uses its values or computes as fallback. | `prompts/recon.md` | 1.1 |

### Phase 2: Deduplication (P1)

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 2.1 | Create `modes/_dispatch.md` with shared Recon/Skeptic/Referee dispatch patterns for both `local-sequential` and `subagent` backends | `modes/_dispatch.md` (new) | — |
| 2.2 | Rewrite `small.md` to reference `_dispatch.md` instead of inline dispatch boilerplate | `modes/small.md` | 2.1, 1.3 |
| 2.3 | Rewrite `parallel.md` to reference `_dispatch.md` | `modes/parallel.md` | 2.1, 1.4 |
| 2.4 | Rewrite `extended.md` to reference `_dispatch.md` | `modes/extended.md` | 2.1, 1.5 |
| 2.5 | Rewrite `scaled.md` to reference `_dispatch.md` | `modes/scaled.md` | 2.1, 1.6 |
| 2.6 | Drop step-number suffixes (4m→4, 5p→5, etc.) in all mode files | all `modes/*.md` | 2.2-2.5 |
| 2.7 | Remove duplicate skip-file patterns from `hunter.md` (keep only in SKILL.md) | `prompts/hunter.md` | — |

### Phase 3: Dead weight removal (P2)

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 3.1 | Delete `FIX-PLAN.md` | `FIX-PLAN.md` | — |
| 3.2 | Truncate `CHANGELOG.md` to latest 2 entries | `CHANGELOG.md` | — |
| 3.3 | Wire `run-bug-hunter.cjs` into `extended.md` and `scaled.md` as the chunk executor (replace prose-based chunk loop) | `modes/extended.md`, `modes/scaled.md` | 2.4, 2.5 |
| 3.4 | Document `code-index.cjs` as optional (remove from required scripts check, add usage note for agents that want deeper cross-ref analysis) | `SKILL.md` | — |

### Phase 4: Token compression (P3)

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 4.1 | Compress `hunter.md`: remove redundant scope rules, compress security checklist | `prompts/hunter.md` | 2.7 |
| 4.2 | Compress `recon.md`: remove FILE_BUDGET section, compress output format | `prompts/recon.md` | 1.9 |
| 4.3 | Compress `referee.md`: compress tiering rules, remove redundant re-check section | `prompts/referee.md` | — |
| 4.4 | Compress `skeptic.md`: compress false-positive patterns list | `prompts/skeptic.md` | — |
| 4.5 | Compress `SKILL.md`: remove `run-bug-hunter.cjs` inline invocation, compress preflight | `SKILL.md` | 1.1, 1.8, 3.3, 3.4 |

### Phase 5: Logic gap fixes (P4)

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 5.1 | Add branch-diff/staged optimization note in SKILL.md Step 3 | `SKILL.md` | 1.1 |
| 5.2 | Rename "triage" pre-scan in `parallel.md` to "scout pass" everywhere | `modes/parallel.md` | 2.3 |
| 5.3 | Ensure `single-file.md` has local-sequential instructions (currently only subagent dispatch) | `modes/single-file.md` | 2.1 |

### Phase 6: Validation

| # | Task | Files | Depends On |
|---|------|-------|------------|
| 6.1 | Run `triage.cjs` on 3 test targets (1 file, 10 files, 500+ files) and verify the JSON output matches what each mode file expects | — | All |
| 6.2 | Trace a complete dry-run of `local-sequential` on a small target: verify every file reference, every script invocation, every output path is consistent | — | All |
| 6.3 | Trace a complete dry-run of `large-codebase` mode: verify domain file lists flow from triage → Tier 1 → per-domain Recon → per-domain Hunter | — | All |
| 6.4 | Measure total .md bytes before and after. Target: <120KB (from current 188KB) | — | All |
| 6.5 | Run self-test: `/bug-hunter SKILL_DIR/test-fixture/` and verify pipeline completes end-to-end | — | All |

---

## Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Total .md tokens | ~47,000 | ~30,000 (target: -36%) |
| SKILL.md tokens | ~6,665 | ~4,500 |
| Instruction tokens per small run | ~18,300 | ~11,000 |
| Duplicate dispatch lines | ~300 | ~30 (in `_dispatch.md`) |
| Dead weight files | 2 (FIX-PLAN + bloated CHANGELOG) | 0 |
| Triage data consumers | 0 mode files | All 7 mode files |
| Step ordering bugs | 1 (triage before target) | 0 |
| Naming collisions | 2 ("triage", step suffixes) | 0 |
| Orphaned features | 3 (re-audit gate, code-index, run-bug-hunter) | 0 |

---

## Files Changed Summary

| File | Action |
|------|--------|
| `SKILL.md` | Restructure steps, remove re-audit gate, compress preflight, wire triage |
| `FIX-PLAN.md` | **DELETE** |
| `CHANGELOG.md` | Truncate to latest 2 entries |
| `modes/_dispatch.md` | **CREATE** — shared dispatch patterns |
| `modes/local-sequential.md` | Wire triage, simplify Recon phase |
| `modes/small.md` | Wire triage, deduplicate dispatch, drop step suffixes |
| `modes/parallel.md` | Wire triage, rename scout pass, deduplicate, drop suffixes |
| `modes/extended.md` | Wire triage, wire run-bug-hunter.cjs, deduplicate, drop suffixes |
| `modes/scaled.md` | Wire triage, wire run-bug-hunter.cjs, deduplicate, drop suffixes |
| `modes/large-codebase.md` | Wire triage domainFileLists into Tier 1 |
| `modes/single-file.md` | Add local-sequential support, drop suffix |
| `prompts/recon.md` | Remove FILE_BUDGET computation, compress output format |
| `prompts/hunter.md` | Remove duplicate skip rules, compress security checklist |
| `prompts/skeptic.md` | Compress false-positive patterns |
| `prompts/referee.md` | Compress tiering rules |
