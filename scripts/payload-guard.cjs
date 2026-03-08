#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REQUIRED_BY_ROLE = {
  recon: ['skillDir', 'targetFiles', 'outputSchema'],
  'triage-hunter': ['skillDir', 'targetFiles', 'techStack', 'outputSchema'],
  hunter: ['skillDir', 'targetFiles', 'riskMap', 'techStack', 'outputSchema'],
  skeptic: ['skillDir', 'bugs', 'techStack', 'outputSchema'],
  referee: ['skillDir', 'findings', 'skepticResults', 'outputSchema'],
  fixer: ['skillDir', 'bugs', 'techStack', 'outputSchema']
};

function usage() {
  console.error('Usage: payload-guard.cjs validate <role> <payloadJsonPath>');
}

function readPayload(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function validate(role, payload) {
  const errors = [];
  const required = REQUIRED_BY_ROLE[role];
  if (!required) {
    return {
      ok: false,
      errors: [`Unknown role: ${role}`]
    };
  }

  for (const field of required) {
    if (!(field in payload)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if ('skillDir' in payload) {
    if (typeof payload.skillDir !== 'string' || payload.skillDir.trim() === '') {
      errors.push('skillDir must be a non-empty string');
    } else if (!path.isAbsolute(payload.skillDir)) {
      errors.push('skillDir must be an absolute path');
    }
  }

  if ('targetFiles' in payload && !isNonEmptyArray(payload.targetFiles)) {
    errors.push('targetFiles must be a non-empty array');
  }

  if ('bugs' in payload && !isNonEmptyArray(payload.bugs)) {
    errors.push('bugs must be a non-empty array');
  }

  if ('findings' in payload && !isNonEmptyArray(payload.findings)) {
    errors.push('findings must be a non-empty array');
  }

  if ('skepticResults' in payload) {
    if (!payload.skepticResults || typeof payload.skepticResults !== 'object') {
      errors.push('skepticResults must be an object');
    }
  }

  if ('outputSchema' in payload) {
    if (!payload.outputSchema || typeof payload.outputSchema !== 'object') {
      errors.push('outputSchema must be an object');
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function main() {
  const [command, role, payloadJsonPath] = process.argv.slice(2);
  if (command !== 'validate' || !role || !payloadJsonPath) {
    usage();
    process.exit(1);
  }

  const payload = readPayload(payloadJsonPath);
  const result = validate(role, payload);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
