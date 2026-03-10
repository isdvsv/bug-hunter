# Ralph-Loop Mode (`--loop`)

When `--loop` is present, the bug-hunter wraps itself in a ralph-loop that keeps iterating until the audit achieves full queued coverage. This is for thorough, autonomous audits where you want every queued scannable source file examined unless the user interrupts.

## CRITICAL: Starting the ralph-loop

**You MUST call the `ralph_start` tool to begin the loop.** Without this call, the loop will not iterate.

When `LOOP_MODE=true` is set (from `--loop` flag), before running the first pipeline iteration:

1. Build the task content from the TODO.md template below.
2. Call the `ralph_start` tool:

```
MAX_LOOP_ITERATIONS = max(12, min(200, ceil(SCANNABLE_FILES / max(FILE_BUDGET, 1)) + 8))

ralph_start({
  name: "bug-hunter-audit",
  taskContent: <the TODO.md content below>,
  maxIterations: MAX_LOOP_ITERATIONS
})
```

3. The ralph-loop system will then drive iteration. Each iteration:
   - You receive the task prompt with the current checklist state.
   - You execute one iteration of the bug-hunt pipeline (steps below).
   - You update `.bug-hunter/coverage.json` with results and render `.bug-hunter/coverage.md` from it.
   - If ALL queued scannable source files are DONE → output `<promise>COMPLETE</promise>` to end the loop.
   - Otherwise → call `ralph_done` to proceed to the next iteration.

**Do NOT manually loop or re-invoke yourself.** The ralph-loop system handles iteration automatically after you call `ralph_start`.

## How it works

1. **First iteration**: Run the normal pipeline (Recon → Hunters → Skeptics →
   Referee). At the end, write canonical coverage state to
   `.bug-hunter/coverage.json` and render `.bug-hunter/coverage.md` from it.

2. **Coverage check**: After each iteration, evaluate:
   - If ALL queued scannable source files show status DONE → output `<promise>COMPLETE</promise>` → loop ends
   - If any queued scannable source files are SKIPPED or PARTIAL → call `ralph_done` → loop continues
   - Do NOT stop just because the current prioritized tier is clean; continue descending through MEDIUM and LOW files automatically

3. **Subsequent iterations**: Each new iteration reads
   `.bug-hunter/coverage.json` to see what's already been done, then runs the
   pipeline ONLY on uncovered files. New findings are appended to the
   cumulative bug list.

## Coverage file format (canonical)

**`.bug-hunter/coverage.json`:**
```json
{
  "schemaVersion": 1,
  "iteration": 1,
  "status": "IN_PROGRESS",
  "files": [
    { "path": "src/auth/login.ts", "status": "done" },
    { "path": "src/api/payments.ts", "status": "pending" }
  ],
  "bugs": [
    { "bugId": "BUG-3", "severity": "Critical", "file": "src/auth/login.ts", "claim": "JWT token not validated before use" }
  ],
  "fixes": [
    { "bugId": "BUG-3", "status": "MANUAL_REVIEW" }
  ]
}
```

**`.bug-hunter/coverage.md`** is derived from the JSON artifact for humans.

## TODO.md task content for ralph_start

Use this as the `taskContent` parameter when calling `ralph_start`:

**For `--loop` (scan only):**
```markdown
# Bug Hunt Audit

## Coverage Tasks
- [ ] All CRITICAL files scanned
- [ ] All HIGH files scanned
- [ ] All MEDIUM files scanned
- [ ] All LOW files scanned
- [ ] Findings verified through Skeptic+Referee pipeline

## Completion
- [ ] ALL_TASKS_COMPLETE

## Instructions
1. Read .bug-hunter/coverage.json for previous iteration state
2. Parse the `files` array — collect all entries where `status` is not `done`
3. Run bug-hunter pipeline on those files only
4. Update coverage JSON: change file status to `done`, append bug summaries, and render coverage.md
5. Output <promise>COMPLETE</promise> only when all queued source files are DONE
6. Otherwise call ralph_done to continue to the next iteration
```

## Coverage file validation

At the start of each iteration, validate the coverage file:
1. Validate `.bug-hunter/coverage.json` against the local coverage schema.
2. If validation fails, rename the bad file to `.bug-hunter/coverage.json.bak`
   and start fresh. Warn the user.
3. Always regenerate `.bug-hunter/coverage.md` from the JSON artifact after a
   successful write.

## Iteration behavior

Each iteration after the first:
1. Read `.bug-hunter/coverage.json`
2. Collect all file entries where `status != "done"`
3. If none remain → output `<promise>COMPLETE</promise>` (this ends the ralph-loop)
4. Otherwise, run the pipeline on remaining files only (use small/parallel mode based on count)
5. Update `coverage.json`, then render `coverage.md`
6. Increment ITERATION counter
7. Call `ralph_done` to proceed to the next iteration

## Safety

- Max iterations should scale with the queue size so autonomous runs do not stop early
- Each iteration only scans NEW files — no re-scanning already-DONE files
- User can stop anytime with ESC or `/ralph-stop`
- Canonical state is in `.bug-hunter/coverage.json`; `coverage.md` is derived
  and fully resumable from that JSON
