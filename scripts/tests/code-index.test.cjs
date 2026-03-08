const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const {
  makeSandbox,
  writeJson,
  resolveSkillScript,
  runJson
} = require('./test-utils.cjs');

test('code-index build captures symbols, call graph, boundaries, and query scope', () => {
  const sandbox = makeSandbox('code-index-');
  const codeIndex = resolveSkillScript('code-index.cjs');
  const filesJson = path.join(sandbox, 'files.json');
  const indexPath = path.join(sandbox, 'index.json');

  const routeFile = path.join(sandbox, 'src', 'routes', 'user-route.ts');
  const serviceFile = path.join(sandbox, 'src', 'routes', 'service.ts');
  const authFile = path.join(sandbox, 'src', 'lib', 'auth.ts');
  fs.mkdirSync(path.dirname(routeFile), { recursive: true });
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(routeFile, [
    "import { loadUser } from './service';",
    'export function handler(req) {',
    '  return loadUser(req);',
    '}'
  ].join('\n'), 'utf8');
  fs.writeFileSync(serviceFile, [
    "import { verifyToken } from '../lib/auth';",
    'export function loadUser(req) {',
    '  return verifyToken(req.token);',
    '}'
  ].join('\n'), 'utf8');
  fs.writeFileSync(authFile, [
    'export function verifyToken(token) {',
    '  return Boolean(token);',
    '}'
  ].join('\n'), 'utf8');

  writeJson(filesJson, [routeFile, serviceFile, authFile]);
  const buildResult = runJson('node', [codeIndex, 'build', indexPath, filesJson, sandbox]);
  assert.equal(buildResult.ok, true);
  assert.equal(buildResult.metrics.filesIndexed, 3);
  assert.equal(buildResult.metrics.symbolsIndexed > 0, true);
  assert.equal(buildResult.metrics.callEdges > 0, true);
  assert.equal(buildResult.metrics.trustBoundaryFiles >= 1, true);

  const seedJson = path.join(sandbox, 'seed.json');
  writeJson(seedJson, [routeFile]);
  const queryResult = runJson('node', [codeIndex, 'query', indexPath, seedJson, '1']);
  assert.equal(queryResult.ok, true);
  assert.equal(queryResult.selected.includes(routeFile), true);
  assert.equal(queryResult.selected.includes(serviceFile), true);
  assert.equal(queryResult.trustBoundaryFiles.includes(routeFile), true);
});
