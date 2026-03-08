# Phase 2: Fix Pipeline (default; also via `--fix`/`--autonomous`)

This phase takes the Referee's confirmed bug report and implements fixes. It runs when `FIX_MODE=true` and the Referee confirmed at least one real bug.
All Fixer launches in this file must use `AGENT_BACKEND` selected during SKILL preflight.

### Step 8: Prepare for fixing (single-writer model)

**8a. Git safety + baseline refs**

Before touching code:
1. Run `git rev-parse --is-inside-work-tree`:
   - If not a git repo, warn and continue without rollback features.
2. If in git:
   - Capture `ORIGINAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)`
   - Capture `FIX_BASE_COMMIT=$(git rev-parse HEAD)` (used later for exact post-fix diff)
   - Run `git status --porcelain`
   - If dirty working tree, run `git stash push -m "bug-hunter-pre-fix-$(date +%s)"` and record `STASH_CREATED=true`
   - Create fix branch: `git checkout -b bug-hunter-fix-$(date +%Y%m%d-%H%M%S)`

Report:
- Fix branch name
- Base commit hash (`FIX_BASE_COMMIT`)
- Whether stash was created

Acquire single-writer lock before edits:
```
node "$SKILL_DIR/scripts/fix-lock.cjs" acquire ".claude/bug-hunter-fix.lock" 1800
```
If lock cannot be acquired, stop Phase 2 to avoid concurrent mutation.

**8b. Detect verification commands**

Detect and store:
- `TEST_COMMAND`
- `TYPECHECK_COMMAND`
- `BUILD_COMMAND`

Use the same detection order as before. Missing commands should be stored as `null`.

**8c. Capture pre-fix baseline**

If `TEST_COMMAND` is not null:
1. Run it once (timeout 5 minutes).
2. Store pass/fail counts and failure identifiers as `BASELINE_FAILURES`.

If baseline cannot run, set `BASELINE=null` and continue with manual-verification warning.

**8d. Build sequential fix plan**

Prepare bug queue:
1. Apply confidence gate:
   - `ELIGIBLE` for auto-fix when Referee confidence >= 75%.
   - `MANUAL_REVIEW` when confidence < 75% or missing confidence.
2. Run global consistency pass on merged findings:
   - Detect reused BUG-ID collisions.
   - Detect conflicting claims on the same file/line range.
   - Resolve conflicts before edits.
3. Auto-fix queue contains `ELIGIBLE` bugs only.
4. Sort by severity: Critical -> Medium -> Low.
5. Build canary subset from top critical/high-confidence eligible bugs (recommended 1-3 bugs).
6. Keep same-file bugs adjacent.
7. Group into small clusters (recommended max 3 bugs per cluster) for checkpoints.

Report: `Fix plan: [N] eligible bugs, canary=[K], rollout=[R], manual-review=[M].`

### Step 9: Execute fixes (sequential fixer)

Single writer rule: run one Fixer at a time. No parallel worktrees by default.

Execution order:
1. Canary clusters first.
2. Verify canary results.
3. Continue rollout clusters only if canary verification passes.

For each cluster in order:
1. Launch one Fixer with:
   - `prompts/fixer.md`
   - Cluster bug subset
   - Recon tech stack context
2. Validate Fixer payload before launch:
   ```
   node "$SKILL_DIR/scripts/payload-guard.cjs" validate fixer ".claude/payloads/fixer-cluster-<id>.json"
   ```
3. Permission mode:
   - `APPROVE_MODE=true` -> `mode: "default"`
   - `APPROVE_MODE=false` -> `mode: "auto"`
4. Apply returned changes.
5. Commit checkpoint immediately:
   - `fix(bug-hunter): BUG-N — [short description]`
   - If cluster contains multiple bugs, still keep one commit per bug when possible.
6. Record commit hash per BUG-ID in a fix ledger.

If a bug cannot be fixed, mark `SKIPPED` and continue.

### Step 10: Verify and auto-revert

**10a. Fast checks after each checkpoint**

After each bug commit:
- Run nearest/impacted checks first (targeted tests or module typecheck).
- If targeted checks fail with new failures, revert that bug commit immediately.

**10b. End-of-run full verification**

After all clusters:
1. Run full `TEST_COMMAND` (if available).
2. Compare with baseline:
   - New failures
   - Unchanged pre-existing failures
   - Resolved failures
3. Run `TYPECHECK_COMMAND` and `BUILD_COMMAND` when available.

**10c. Auto-revert failing bug commits**

For each BUG-ID linked to new failures:
1. Revert its checkpoint commit (`git revert --no-edit <hash>`).
2. Re-run the smallest relevant check.
3. Mark status:
   - `FIX_REVERTED` when revert succeeds and failures clear.
   - `FIX_FAILED` when revert conflicts or failures persist.

**10d. Post-fix targeted re-scan**

Use exact fixed scope from the real base commit:
1. Run `git diff --unified=0 "$FIX_BASE_COMMIT"..HEAD`.
2. Build changed hunks list.
3. Run one lightweight Hunter on changed hunks only to detect fixer-introduced bugs.

This removes ambiguity from `<base-branch>` and works for path scans, staged scans, and branch scans.

### Step 11: Determine final bug status

| Status | Criteria |
|--------|----------|
| FIXED | Fix landed, checks pass, no fixer-introduced issue |
| FIX_REVERTED | Fix introduced regression and was cleanly reverted |
| FIX_FAILED | Regression introduced and could not be cleanly reverted |
| PARTIAL | Minimal patch landed, larger refactor still required |
| SKIPPED | Fix not implemented |
| FIXER_BUG | Post-fix re-scan found a new bug introduced by the fix |

### Step 12: Restore user state and report

If stash was created:
1. Attempt automatic restore (`git stash pop`).
2. If restore succeeds, report `stash_restored=true`.
3. If restore conflicts, stop and report clear conflict instructions; do not discard stash.

Always release single-writer lock at the end (success or failure path):
```
node "$SKILL_DIR/scripts/fix-lock.cjs" release ".claude/bug-hunter-fix.lock"
```
If an earlier step aborts Phase 2, run the same release command in best-effort cleanup before returning.

Present:
- Fix summary by status
- Verification summary (baseline vs final)
- Files modified
- Fix details per BUG-ID
- Git info:
  - Fix branch
  - Base commit (`FIX_BASE_COMMIT`)
  - Review command: `git diff "$FIX_BASE_COMMIT"..HEAD`
  - Stash restore outcome

If `LOOP_MODE=true`, continue to fix-loop rules for unresolved bugs.
