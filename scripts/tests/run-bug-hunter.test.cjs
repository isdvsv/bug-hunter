const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const {
  makeSandbox,
  readJson,
  resolveSkillScript,
  runJson,
  writeJson
} = require('./test-utils.cjs');

test('run-bug-hunter preflight selects available backend by priority', () => {
  const runner = resolveSkillScript('run-bug-hunter.cjs');
  const skillDir = path.resolve(__dirname, '..', '..');
  const result = runJson('node', [
    runner,
    'preflight',
    '--skill-dir',
    skillDir,
    '--available-backends',
    'team,local-sequential'
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.backend.selected, 'team');
});

test('run-bug-hunter run executes chunk loop with retry and journal', () => {
  const sandbox = makeSandbox('run-bug-hunter-');
  const runner = resolveSkillScript('run-bug-hunter.cjs');
  const skillDir = path.resolve(__dirname, '..', '..');
  const filesJsonPath = path.join(sandbox, 'files.json');
  const statePath = path.join(sandbox, '.claude', 'bug-hunter-state.json');
  const journalPath = path.join(sandbox, '.claude', 'bug-hunter-run.log');
  const attemptsFile = path.join(sandbox, 'attempts.json');

  const sourceA = path.join(sandbox, 'src', 'a.ts');
  const sourceB = path.join(sandbox, 'src', 'b.ts');
  fs.mkdirSync(path.dirname(sourceA), { recursive: true });
  fs.writeFileSync(sourceA, 'export const a = 1;\n', 'utf8');
  fs.writeFileSync(sourceB, 'export const b = 2;\n', 'utf8');
  writeJson(filesJsonPath, [sourceA, sourceB]);

  const flakyWorker = resolveSkillScript('tests', 'fixtures', 'flaky-worker.cjs');
  const workerTemplate = [
    'node',
    flakyWorker,
    '--chunk-id',
    '{chunkId}',
    '--scan-files-json',
    '{scanFilesJson}',
    '--findings-json',
    '{findingsJson}',
    '--attempts-file',
    attemptsFile
  ].join(' ');

  const result = runJson('node', [
    runner,
    'run',
    '--skill-dir',
    skillDir,
    '--files-json',
    filesJsonPath,
    '--state',
    statePath,
    '--mode',
    'extended',
    '--chunk-size',
    '1',
    '--worker-cmd',
    workerTemplate,
    '--timeout-ms',
    '5000',
    '--max-retries',
    '1',
    '--backoff-ms',
    '10',
    '--journal-path',
    journalPath
  ], {
    cwd: sandbox
  });

  assert.equal(result.ok, true);
  assert.equal(result.status.chunkStatus.done, 2);
  assert.equal(result.status.metrics.findingsUnique >= 2, true);

  const attempts = readJson(attemptsFile);
  assert.equal(attempts['chunk-1'], 2);
  assert.equal(attempts['chunk-2'], 2);

  const journal = fs.readFileSync(journalPath, 'utf8');
  assert.match(journal, /attempt-start/);
  assert.match(journal, /retry-backoff/);
  assert.match(journal, /chunk-done/);
});

test('run-bug-hunter integrates index+delta, fact cards, consistency pass, and fix plan', () => {
  const sandbox = makeSandbox('run-bug-hunter-delta-');
  const runner = resolveSkillScript('run-bug-hunter.cjs');
  const skillDir = path.resolve(__dirname, '..', '..');
  const filesJsonPath = path.join(sandbox, 'files.json');
  const changedFilesJsonPath = path.join(sandbox, 'changed-files.json');
  const statePath = path.join(sandbox, '.claude', 'bug-hunter-state.json');
  const journalPath = path.join(sandbox, '.claude', 'bug-hunter-run.log');
  const seenFilesPath = path.join(sandbox, 'seen-files.json');
  const consistencyReportPath = path.join(sandbox, '.claude', 'bug-hunter-consistency.json');
  const fixPlanPath = path.join(sandbox, '.claude', 'bug-hunter-fix-plan.json');
  const factsPath = path.join(sandbox, '.claude', 'bug-hunter-facts.json');

  const changedFile = path.join(sandbox, 'src', 'feature', 'changed.ts');
  const depFile = path.join(sandbox, 'src', 'feature', 'dep.ts');
  const overlayFile = path.join(sandbox, 'src', 'api', 'admin-route.ts');
  fs.mkdirSync(path.dirname(changedFile), { recursive: true });
  fs.mkdirSync(path.dirname(overlayFile), { recursive: true });
  fs.writeFileSync(changedFile, "import { dep } from './dep';\nexport const value = dep();\n", 'utf8');
  fs.writeFileSync(depFile, 'export function dep() { return 1; }\n', 'utf8');
  fs.writeFileSync(overlayFile, 'export function handler(req) { return req.body; }\n', 'utf8');

  writeJson(filesJsonPath, [changedFile, depFile, overlayFile]);
  writeJson(changedFilesJsonPath, [changedFile]);

  const worker = resolveSkillScript('tests', 'fixtures', 'low-confidence-worker.cjs');
  const workerTemplate = [
    'node',
    worker,
    '--chunk-id',
    '{chunkId}',
    '--scan-files-json',
    '{scanFilesJson}',
    '--findings-json',
    '{findingsJson}',
    '--facts-json',
    '{factsJson}',
    '--seen-files',
    seenFilesPath,
    '--confidence',
    '60'
  ].join(' ');

  const result = runJson('node', [
    runner,
    'run',
    '--skill-dir',
    skillDir,
    '--files-json',
    filesJsonPath,
    '--changed-files-json',
    changedFilesJsonPath,
    '--state',
    statePath,
    '--mode',
    'extended',
    '--chunk-size',
    '1',
    '--worker-cmd',
    workerTemplate,
    '--timeout-ms',
    '5000',
    '--max-retries',
    '1',
    '--backoff-ms',
    '10',
    '--journal-path',
    journalPath,
    '--use-index',
    'true',
    '--delta-mode',
    'true',
    '--delta-hops',
    '1',
    '--expand-on-low-confidence',
    'true',
    '--confidence-threshold',
    '75',
    '--canary-size',
    '1'
  ], {
    cwd: sandbox
  });

  assert.equal(result.ok, true);
  assert.equal(result.deltaMode, true);
  assert.equal(result.deltaSummary.selectedCount >= 2, true);
  assert.equal(fs.existsSync(consistencyReportPath), true);
  assert.equal(fs.existsSync(fixPlanPath), true);
  assert.equal(fs.existsSync(factsPath), true);

  const seenFiles = readJson(seenFilesPath);
  assert.equal(seenFiles.includes(overlayFile), true);

  const state = readJson(statePath);
  assert.equal(Object.keys(state.factCards || {}).length >= 3, true);
  assert.equal(state.metrics.lowConfidenceFindings >= 1, true);

  const consistency = readJson(consistencyReportPath);
  assert.equal(consistency.lowConfidenceFindings >= 1, true);

  const fixPlan = readJson(fixPlanPath);
  assert.equal(fixPlan.totals.manualReview >= 1, true);
});

test('run-bug-hunter builds canary fix subset from high-confidence findings', () => {
  const sandbox = makeSandbox('run-bug-hunter-canary-');
  const runner = resolveSkillScript('run-bug-hunter.cjs');
  const skillDir = path.resolve(__dirname, '..', '..');
  const filesJsonPath = path.join(sandbox, 'files.json');
  const statePath = path.join(sandbox, '.claude', 'bug-hunter-state.json');
  const fixPlanPath = path.join(sandbox, '.claude', 'bug-hunter-fix-plan.json');

  const fileA = path.join(sandbox, 'src', 'a.ts');
  const fileB = path.join(sandbox, 'src', 'b.ts');
  fs.mkdirSync(path.dirname(fileA), { recursive: true });
  fs.writeFileSync(fileA, 'export const a = 1;\n', 'utf8');
  fs.writeFileSync(fileB, 'export const b = 2;\n', 'utf8');
  writeJson(filesJsonPath, [fileA, fileB]);

  const worker = resolveSkillScript('tests', 'fixtures', 'low-confidence-worker.cjs');
  const workerTemplate = [
    'node',
    worker,
    '--chunk-id',
    '{chunkId}',
    '--scan-files-json',
    '{scanFilesJson}',
    '--findings-json',
    '{findingsJson}',
    '--facts-json',
    '{factsJson}',
    '--confidence',
    '92'
  ].join(' ');

  runJson('node', [
    runner,
    'run',
    '--skill-dir',
    skillDir,
    '--files-json',
    filesJsonPath,
    '--state',
    statePath,
    '--mode',
    'extended',
    '--chunk-size',
    '1',
    '--worker-cmd',
    workerTemplate,
    '--timeout-ms',
    '5000',
    '--confidence-threshold',
    '75',
    '--canary-size',
    '1'
  ], {
    cwd: sandbox
  });

  const fixPlan = readJson(fixPlanPath);
  assert.equal(fixPlan.totals.eligible >= 1, true);
  assert.equal(fixPlan.totals.canary, 1);
});
