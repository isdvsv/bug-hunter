# Extended Mode (FILE_BUDGET+1 to FILE_BUDGET*2 files) — chunked sequential

This mode is built for medium-large codebases where one deep scan would overflow context.
All launches in this file must use `AGENT_BACKEND` selected during SKILL preflight.

### Step 4e: Run Recon
Same as parallel mode. Capture risk map + service boundaries.

### Step 5e: Build chunk plan

Create sequential chunks with these rules:
- Target chunk size: 20-40 source files.
- Preserve service boundaries when possible.
- Order chunks by risk: CRITICAL-heavy first, then HIGH, then MEDIUM.
- Keep test files context-only and include only when needed.

Persist plan to `.claude/bug-hunter-state.json`:
- `chunks[]` with `id`, `files`, `status` (`pending|in_progress|done`)
- `findings[]` ledger
- `last_updated`

Initialize state file:
```
node "$SKILL_DIR/scripts/bug-hunter-state.cjs" init ".claude/bug-hunter-state.json" "extended" ".claude/source-files.json" 30
```

### Step 5e-run: Process chunks one-by-one

For each pending chunk:
1. Get next chunk:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" next-chunk ".claude/bug-hunter-state.json"
   ```
2. Mark chunk `in_progress` in state:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" mark-chunk ".claude/bug-hunter-state.json" "<chunk-id>" in_progress
   ```
3. Run hash cache filter on chunk files. Scan only returned `scan` files.
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" hash-filter ".claude/bug-hunter-state.json" ".claude/chunk-<id>-files.json"
   ```
4. Optionally run read-only dual-lens triage on that chunk.
5. Validate deep Hunter payload and run one deep Hunter on the chunk (authoritative output):
   ```
   node "$SKILL_DIR/scripts/payload-guard.cjs" validate hunter ".claude/payloads/hunter-chunk-<id>.json"
   ```
6. Run chunk-local gap-fill for missed CRITICAL/HIGH files.
7. Append findings to state ledger:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" record-findings ".claude/bug-hunter-state.json" ".claude/chunk-<id>-findings.json" "extended"
   ```
8. Update hash cache for scanned files:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" hash-update ".claude/bug-hunter-state.json" ".claude/chunk-<id>-scanned-files.json" scanned
   ```
9. Mark chunk `done`:
   ```
   node "$SKILL_DIR/scripts/bug-hunter-state.cjs" mark-chunk ".claude/bug-hunter-state.json" "<chunk-id>" done
   ```

If interrupted, resume from state and continue with remaining chunks only.

### Step 5e-merge: Merge findings across chunks

After all chunks complete:
- Merge and dedupe by file+line+claim overlap.
- Renumber BUG-IDs sequentially.
- Build file-to-bugs index for Skeptic clustering.

### Step 6e: Skeptic pass

Run Skeptics sequentially by directory clusters:
- One Skeptic for <= 8 bugs.
- Two Skeptics in sequence for > 8 bugs.
- Validate each Skeptic payload before launch:
  ```
  node "$SKILL_DIR/scripts/payload-guard.cjs" validate skeptic ".claude/payloads/skeptic-<id>.json"
  ```

### Step 7e: Referee

Run one Referee on merged findings + Skeptic output.
- Validate Referee payload before launch:
  ```
  node "$SKILL_DIR/scripts/payload-guard.cjs" validate referee ".claude/payloads/referee.json"
  ```
If Referee fails, fall back to Skeptic accepted list and mark partial verification.
