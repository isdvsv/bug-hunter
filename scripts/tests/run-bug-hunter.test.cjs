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
    'teams,local-sequential'
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.backend.selected, 'teams');
});

test('run-bug-hunter preflight tolerates missing optional code-index helper', () => {
  const sandbox = makeSandbox('run-bug-hunter-preflight-');
  const runner = resolveSkillScript('run-bug-hunter.cjs');
  const optionalSkillDir = path.join(sandbox, 'skill');
  const scriptsDir = path.join(optionalSkillDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  for (const fileName of [
    'run-bug-hunter.cjs',
    'bug-hunter-state.cjs',
    'payload-guard.cjs',
    'fix-lock.cjs',
    'doc-lookup.cjs',
    'context7-api.cjs',
    'delta-mode.cjs'
  ]) {
    fs.copyFileSync(resolveSkillScript(fileName), path.join(scriptsDir, fileName));
  }

  const result = runJson('node', [
    path.join(scriptsDir, 'run-bug-hunter.cjs'),
    'preflight',
    '--skill-dir',
    optionalSkillDir
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test('triage promotes low-only source files into the scan order', () => {
  const sandbox = makeSandbox('triage-low-only-');
  const triage = resolveSkillScript('triage.cjs');
  const scriptsDir = path.join(sandbox, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, 'a.cjs'), 'module.exports = 1;\n', 'utf8');
  fs.writeFileSync(path.join(scriptsDir, 'b.cjs'), 'module.exports = 2;\n', 'utf8');

  const result = runJson('node', [triage, 'scan', sandbox]);
  assert.equal(result.totalFiles, 2);
  assert.equal(result.scannableFiles, 2);
  assert.deepEqual(result.scanOrder, ['scripts/a.cjs', 'scripts/b.cjs']);
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
    '--consistency-report',
    consistencyReportPath,
    '--fix-plan-path',
    fixPlanPath,
    '--facts-path',
    factsPath,
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
    '--fix-plan-path',
    fixPlanPath,
    '--canary-size',
    '1'
  ], {
    cwd: sandbox
  });

  const fixPlan = readJson(fixPlanPath);
  assert.equal(fixPlan.totals.eligible >= 1, true);
  assert.equal(fixPlan.totals.canary, 1);
});

test('run-bug-hunter respects configured delta hops during low-confidence expansion', () => {
  const sandbox = makeSandbox('run-bug-hunter-delta-hops-');
  const runner = resolveSkillScript('run-bug-hunter.cjs');
  const skillDir = path.resolve(__dirname, '..', '..');
  const filesJsonPath = path.join(sandbox, 'files.json');
  const changedFilesJsonPath = path.join(sandbox, 'changed-files.json');
  const statePath = path.join(sandbox, '.claude', 'bug-hunter-state.json');
  const seenFilesPath = path.join(sandbox, 'seen-files.json');
  const workerPath = path.join(sandbox, 'worker.cjs');
  const changedFile = path.join(sandbox, 'src', 'a.ts');
  const neighborFile = path.join(sandbox, 'src', 'b.ts');
  const twoHopFile = path.join(sandbox, 'src', 'c.ts');

  fs.mkdirSync(path.dirname(changedFile), { recursive: true });
  fs.writeFileSync(changedFile, "import { b } from './b';\nexport const a = b();\n", 'utf8');
  fs.writeFileSync(neighborFile, "import { c } from './c';\nexport function b() { return c(); }\n", 'utf8');
  fs.writeFileSync(twoHopFile, 'export function c() { return 1; }\n', 'utf8');

  writeJson(filesJsonPath, [changedFile, neighborFile, twoHopFile]);
  writeJson(changedFilesJsonPath, [changedFile]);

  fs.writeFileSync(workerPath, [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const seenPath = process.argv[process.argv.indexOf('--seen-files') + 1];",
    "const changedPath = process.argv[process.argv.indexOf('--changed-file') + 1];",
    "const scanPath = process.argv[process.argv.indexOf('--scan-files-json') + 1];",
    "const findingsPath = process.argv[process.argv.indexOf('--findings-json') + 1];",
    "const scan = JSON.parse(fs.readFileSync(scanPath, 'utf8'));",
    'let seen = [];',
    "if (fs.existsSync(seenPath)) seen = JSON.parse(fs.readFileSync(seenPath, 'utf8'));",
    'seen.push(scan);',
    "fs.writeFileSync(seenPath, JSON.stringify(seen));",
    "const findings = scan[0] === changedPath ? [{ file: scan[0], lines: '1', claim: 'low confidence', severity: 'Low', confidence: 60 }] : [];",
    "fs.writeFileSync(findingsPath, JSON.stringify(findings));"
  ].join('\n'), 'utf8');

  const workerTemplate = [
    'node',
    workerPath,
    '--chunk-id',
    '{chunkId}',
    '--scan-files-json',
    '{scanFilesJson}',
    '--findings-json',
    '{findingsJson}',
    '--seen-files',
    seenFilesPath,
    '--changed-file',
    changedFile
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
    '--use-index',
    'true',
    '--delta-mode',
    'true',
    '--delta-hops',
    '1',
    '--expand-on-low-confidence',
    'true',
    '--confidence-threshold',
    '75'
  ], {
    cwd: sandbox
  });

  assert.equal(result.ok, true);
  const seenFiles = readJson(seenFilesPath).flat();
  assert.equal(seenFiles.includes(twoHopFile), false);
});
