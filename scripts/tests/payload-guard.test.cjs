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
  const validPayloadPath = path.join(sandbox, 'valid.json');
  const invalidPayloadPath = path.join(sandbox, 'invalid.json');

  writeJson(validPayloadPath, {
    skillDir: '/Users/codex/.agents/skills/bug-hunter',
    targetFiles: ['src/a.ts'],
    riskMap: {},
    techStack: { framework: 'express' },
    outputSchema: { type: 'object' }
  });

  const valid = runJson('node', [guardScript, 'validate', 'hunter', validPayloadPath]);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.errors, []);

  writeJson(invalidPayloadPath, {
    skillDir: 'relative/path',
    targetFiles: [],
    outputSchema: null
  });

  const invalid = runRaw('node', [guardScript, 'validate', 'hunter', invalidPayloadPath]);
  assert.notEqual(invalid.status, 0);
  const output = `${invalid.stdout || ''}\n${invalid.stderr || ''}`;
  assert.match(output, /Missing required field: riskMap/);
});
