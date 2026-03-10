const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');

const {
  makeSandbox,
  resolveSkillScript,
  runJson,
  runRaw,
  writeJson
} = require('./test-utils.cjs');

test('payload-guard accepts valid hunter payload and rejects malformed payload', () => {
  const sandbox = makeSandbox('payload-guard-');
  const guardScript = resolveSkillScript('payload-guard.cjs');
  const schemaRuntime = require(resolveSkillScript('schema-runtime.cjs'));
  const validPayloadPath = path.join(sandbox, 'valid.json');
  const invalidPayloadPath = path.join(sandbox, 'invalid.json');

  writeJson(validPayloadPath, {
    skillDir: '/Users/codex/.agents/skills/bug-hunter',
    targetFiles: ['src/a.ts'],
    riskMap: {},
    techStack: { framework: 'express' },
    outputSchema: schemaRuntime.createSchemaRef('findings')
  });

  const valid = runJson('node', [guardScript, 'validate', 'hunter', validPayloadPath]);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, []);

  writeJson(invalidPayloadPath, {
    skillDir: 'relative/path',
    targetFiles: [],
    outputSchema: { artifact: 'findings', schemaVersion: 999, schemaFile: 'schemas/findings.schema.json' }
  });

  const invalid = runRaw('node', [guardScript, 'validate', 'hunter', invalidPayloadPath]);
  assert.notEqual(invalid.status, 0);
  const output = `${invalid.stdout || ''}\n${invalid.stderr || ''}`;
  assert.match(output, /Missing required field: riskMap/);
  assert.match(output, /schema version 1/);
});

test('schema-validate validates example findings fixtures', () => {
  const validatorScript = resolveSkillScript('schema-validate.cjs');
  const validPath = resolveSkillScript('..', 'schemas', 'examples', 'findings.valid.json');
  const invalidPath = resolveSkillScript('..', 'schemas', 'examples', 'findings.invalid.json');

  const valid = runJson('node', [validatorScript, 'findings', validPath]);
  assert.equal(valid.ok, true);

  const invalid = runRaw('node', [validatorScript, 'findings', invalidPath]);
  assert.notEqual(invalid.status, 0);
  assert.match(`${invalid.stdout}${invalid.stderr}`, /\$\[0\]\.claim is required/);
});

test('schema-validate accepts valid skeptic, referee, and fix-report artifacts', () => {
  const sandbox = makeSandbox('schema-validate-more-');
  const validatorScript = resolveSkillScript('schema-validate.cjs');
  const skepticPath = path.join(sandbox, 'skeptic.json');
  const refereePath = path.join(sandbox, 'referee.json');
  const fixReportPath = path.join(sandbox, 'fix-report.json');

  writeJson(skepticPath, [
    {
      bugId: 'BUG-1',
      response: 'ACCEPT',
      analysisSummary: 'The finding holds after re-reading the code.'
    }
  ]);
  writeJson(refereePath, [
    {
      bugId: 'BUG-1',
      verdict: 'REAL_BUG',
      trueSeverity: 'Critical',
      confidenceScore: 95,
      confidenceLabel: 'high',
      verificationMode: 'INDEPENDENTLY_VERIFIED',
      analysisSummary: 'Confirmed by direct code trace.'
    }
  ]);
  writeJson(fixReportPath, {
    version: '3.0.0',
    fix_branch: 'bug-hunter-fix-20260311-200000',
    base_commit: 'abc123',
    dry_run: false,
    circuit_breaker_tripped: false,
    phase2_timeout_hit: false,
    fixes: [
      {
        bugId: 'BUG-1',
        severity: 'CRITICAL',
        status: 'FIXED',
        files: ['src/a.ts'],
        lines: '10-12',
        commit: 'def456',
        description: 'Parameterized the query.'
      }
    ],
    verification: {
      baseline_pass: 10,
      baseline_fail: 1,
      flaky_tests: 0,
      final_pass: 11,
      final_fail: 0,
      new_failures: 0,
      resolved_failures: 1,
      typecheck_pass: true,
      build_pass: true,
      fixer_bugs_found: 0
    },
    summary: {
      total_confirmed: 1,
      eligible: 1,
      manual_review: 0,
      fixed: 1,
      fix_reverted: 0,
      fix_failed: 0,
      skipped: 0,
      fixer_bug: 0,
      partial: 0
    }
  });

  assert.equal(runJson('node', [validatorScript, 'skeptic', skepticPath]).ok, true);
  assert.equal(runJson('node', [validatorScript, 'referee', refereePath]).ok, true);
  assert.equal(runJson('node', [validatorScript, 'fix-report', fixReportPath]).ok, true);
});
