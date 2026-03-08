const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');

const {
  makeSandbox,
  resolveSkillScript,
  runJson,
  runRaw
} = require('./test-utils.cjs');

test('fix-lock enforces single writer and supports release', () => {
  const sandbox = makeSandbox('fix-lock-');
  const lockScript = resolveSkillScript('fix-lock.cjs');
  const lockPath = path.join(sandbox, 'bug-hunter-fix.lock');

  const acquire1 = runJson('node', [lockScript, 'acquire', lockPath, '120']);
  assert.equal(acquire1.ok, true);
  assert.equal(acquire1.acquired, true);

  const acquire2 = runRaw('node', [lockScript, 'acquire', lockPath, '120']);
  assert.notEqual(acquire2.status, 0);
  const output2 = `${acquire2.stdout || ''}${acquire2.stderr || ''}`;
  assert.match(output2, /lock-held/);

  const status = runJson('node', [lockScript, 'status', lockPath, '120']);
  assert.equal(status.exists, true);
  assert.equal(status.stale, false);

  const release = runJson('node', [lockScript, 'release', lockPath]);
  assert.equal(release.ok, true);
  assert.equal(release.released, true);

  const statusAfter = runJson('node', [lockScript, 'status', lockPath, '120']);
  assert.equal(statusAfter.exists, false);
});
