# Parallel Mode (11-FILE_BUDGET files) — sequential-first hybrid

Use this mode when files fit in one deep pass but the target is too large for "small mode". Keep one writer/decision-maker flow. Parallel work is read-only and optional.
All launches in this file must use `AGENT_BACKEND` selected during SKILL preflight.

### Step 4p: Run Recon
Launch one general-purpose subagent with the recon prompt. Pass the scan target.
Wait for completion. Capture:
- Risk map (CRITICAL/HIGH/MEDIUM scan order)
- Service boundaries
- Context budget

### Step 5p: Optional read-only dual-lens triage (safe parallel)

Run this only when `DOC_LOOKUP_AVAILABLE=true` and orchestration is stable.

Launch two triage Hunters in parallel on CRITICAL+HIGH files only:
- Hunter-A (Security triage)
- Hunter-B (Logic triage)

Before each launch, validate payload:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate triage-hunter ".claude/payloads/triage-hunter-<id>.json"
```

Rules:
- Triage is read-only and short. It produces a shortlist, not final bugs.
- If either launch fails once, disable triage for the rest of the run and continue sequentially.

### Step 5p-deep: Run one deep Hunter (authoritative)

Launch ONE Hunter on the full risk-map order (CRITICAL -> HIGH -> MEDIUM).
Pass:
- Recon risk map
- Optional triage shortlist notes as hints
- Instruction that deep scan output is the source of truth

Validate payload before launching:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate hunter ".claude/payloads/hunter-deep.json"
```

### Step 5p-verify: Gap-fill check

Compare deep Hunter `FILES SCANNED` against the risk map:
- If CRITICAL/HIGH files are missing, launch one gap-fill Hunter on only missed files.
- Merge findings and renumber BUG-IDs sequentially.
- Report coverage status.

If merged `TOTAL FINDINGS: 0`, go to Step 7.

### Step 6p: Skeptic pass (sequential by cluster)

Group bugs by directory (same rules as before), then:
- If total bugs <= 5: run one Skeptic.
- If total bugs > 5: run Skeptic-A on cluster set 1, then Skeptic-B on cluster set 2 (sequentially, not in parallel).

Merge Skeptic output while preserving BUG-IDs.

Validate each Skeptic payload before launch:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate skeptic ".claude/payloads/skeptic-<id>.json"
```

### Step 7p: Run Referee

Launch one Referee with:
- Merged Hunter findings
- Merged Skeptic challenges
- Coverage notes from gap-fill

Validate payload:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate referee ".claude/payloads/referee.json"
```

If Referee fails or times out, fall back to Skeptic accepted bugs and mark result as `REFEREE_UNAVAILABLE`.
