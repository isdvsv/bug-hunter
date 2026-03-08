# Single-File Mode (1 file)

All launches in this file must use `AGENT_BACKEND` selected during SKILL preflight.

### Step 4s: Run Hunter
Launch one general-purpose subagent with the hunter prompt. Pass the single file path. No risk map needed.
Validate payload before launch:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate hunter ".claude/payloads/hunter-single.json"
```
Wait for completion. If TOTAL FINDINGS: 0, go to Step 7.

### Step 5s: Run Skeptic
Launch one general-purpose subagent with the skeptic prompt. Inject the Hunter's findings.
Validate payload before launch:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate skeptic ".claude/payloads/skeptic-single.json"
```
Wait for completion.

### Step 6s: Run Referee
Launch one general-purpose subagent with the referee prompt. Inject Hunter + Skeptic reports.
Validate payload before launch:
```
node "$SKILL_DIR/scripts/payload-guard.cjs" validate referee ".claude/payloads/referee-single.json"
```
Wait for completion. Go to Step 7.
