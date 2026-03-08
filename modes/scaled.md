# Scaled Mode (FILE_BUDGET*2+1 to FILE_BUDGET*3 files) — state-driven sequential

Use this mode for large scans that still fit in one run but require strict anti-compaction controls.
All launches in this file must use `AGENT_BACKEND` selected during SKILL preflight.

### Step 4s: Run Recon
Collect risk map, service boundaries, and file metrics.

### Step 5s: Initialize durable run state

Create or load `.claude/bug-hunter-state.json` with:
- `run_id`
- `mode: "scaled"`
- `chunks[]` (id, file list, hash, status, retries)
- `bug_ledger[]` (stable BUG-ID, file, lines, status)
- `scan_metrics` (files_scanned, findings_count, started_at, updated_at)

If state exists, resume instead of restarting.

Initialize when missing:
```
node "$SKILL_DIR/scripts/bug-hunter-state.cjs" init ".claude/bug-hunter-state.json" "scaled" ".claude/source-files.json" 30
```

### Step 6s: Sequential chunk loop

Process one chunk at a time:
1. Fetch next chunk:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" next-chunk ".claude/bug-hunter-state.json"
   ```
2. Mark chunk `in_progress`:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" mark-chunk ".claude/bug-hunter-state.json" "<chunk-id>" in_progress
   ```
3. Run hash cache filter and scan only changed files:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" hash-filter ".claude/bug-hunter-state.json" ".claude/chunk-<id>-files.json"
   ```
4. Optional: run read-only triage for uncertain claims only.
5. Validate payload and run deep Hunter:
   ```
   node "$SKILL_DIR/scripts/payload-guard.cjs" validate hunter ".claude/payloads/hunter-chunk-<id>.json"
   ```
6. Run chunk gap-fill for missed CRITICAL/HIGH files.
7. Merge results into `bug_ledger`:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" record-findings ".claude/bug-hunter-state.json" ".claude/chunk-<id>-findings.json" "scaled"
   ```
8. Update hash cache:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" hash-update ".claude/bug-hunter-state.json" ".claude/chunk-<id>-scanned-files.json" scanned
   ```
9. Mark chunk `done`:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" mark-chunk ".claude/bug-hunter-state.json" "<chunk-id>" done
   ```

Hard fallback: if any optional parallel launch fails once, set `parallel_disabled=true` in state and continue fully sequential:
```
node "$SKILL_DIR/scripts/bug-hunter-state.cjs" set-parallel-disabled ".claude/bug-hunter-state.json" true
```

### Step 7s: Skeptic and Referee

After all chunks are `done`:
- Run Skeptic passes sequentially by directory cluster.
- Run one Referee for final arbitration.
- Validate payloads before each launch:
  ```
  node "$SKILL_DIR/scripts/payload-guard.cjs" validate skeptic ".claude/payloads/skeptic-<id>.json"
  node "$SKILL_DIR/scripts/payload-guard.cjs" validate referee ".claude/payloads/referee.json"
  ```

### Step 8s: Completion rules

Report must include:
- Completed chunk count vs total
- Files skipped (if any) with reasons
- Whether `parallel_disabled` was triggered
- Resume command/path (`.claude/bug-hunter-state.json`) for interrupted runs
