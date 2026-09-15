/**
 * Test case runner for the Repository Resolver
 *
 * Each test case directory contains:
 *   - Source files (*.js, *.ts)
 *   - expected.json with expected relationship counts
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { TypeScriptCompilerParser } from '../parser-comparison/typescript-compiler-api/parser';
import { RepositoryResolver } from './resolver';

// Resolve __dirname for both CJS and ESM contexts
declare const __dirname: string;
const testCasesDir = resolve(__dirname, 'test-cases');

// Normalize paths to forward slashes
function normSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

const parser = new TypeScriptCompilerParser();

interface Expected {
  imports?: { total?: number; resolved?: number; external?: number };
  exports?: { total?: number; resolved?: number };
  calls?: {
    total?: number;
    resolved?: number;
    noEnclosingSymbol?: number;
    byCategory?: Record<string, { total?: number; resolved?: number }>;
  };
  testedBy?: { direct?: number; indirect?: number };
  errors?: { expected?: number };
  sampleRelationships?: Array<{ type: string; from: string; to: string }>;
}

function runTestCase(dirPath: string): { passed: number; failed: number } {
  console.log(`\n=== ${basename(dirPath)} ===`);

  const files = readdirSync(dirPath).filter(f =>
    f.endsWith('.js') || f.endsWith('.ts') || f === 'expected.json'
  );

  if (files.length === 0) {
    console.log('  SKIP: no test files');
    return { passed: 0, failed: 0 };
  }

  const parseResults = [];
  for (const file of files) {
    if (file === 'expected.json') continue;
    const filePath = join(dirPath, file);
    const content = readFileSync(filePath, 'utf-8');
    parseResults.push(parser.parse(normSlash(filePath), content));
  }

  // Fresh resolver per test case so stats don't accumulate across cases
  const resolver = new RepositoryResolver();
  const { relationships, errors } = resolver.resolve(parseResults);
  const stats = (resolver as any).stats;

  const expectedPath = join(dirPath, 'expected.json');
  const expected: Expected = existsSync(expectedPath)
    ? JSON.parse(readFileSync(expectedPath, 'utf-8'))
    : {};

  let passed = 0;
  let failed = 0;

  function check(name: string, actual: number, expectedVal: number | undefined): void {
    if (expectedVal === undefined) return;
    if (actual === expectedVal) {
      console.log(`  ✓ ${name}: ${actual}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}: expected ${expectedVal}, got ${actual}`);
      failed++;
    }
  }

  console.log('  Imports:');
  check('total', stats.imports.total, expected.imports?.total);
  check('resolved', stats.imports.resolved, expected.imports?.resolved);
  check('external', stats.imports.external, expected.imports?.external);

  console.log('  Exports:');
  check('total', stats.exports.total, expected.exports?.total);
  check('resolved', stats.exports.resolved, expected.exports?.resolved);

  console.log('  Calls:');
  check('total', stats.calls.total, expected.calls?.total);
  check('resolved', stats.calls.resolved, expected.calls?.resolved);
  check('noEnclosingSymbol', stats.calls.noEnclosingSymbol, expected.calls?.noEnclosingSymbol);

  if (expected.calls?.byCategory) {
    for (const [cat, exp] of Object.entries(expected.calls.byCategory)) {
      const actual = stats.calls.byCategory[cat];
      if (exp.total !== undefined) {
        if (actual.total === exp.total) { console.log(`    ✓ ${cat}.total: ${actual.total}`); passed++; }
        else { console.log(`    ✗ ${cat}.total: expected ${exp.total}, got ${actual.total}`); failed++; }
      }
      if (exp.resolved !== undefined) {
        if (actual.resolved === exp.resolved) { console.log(`    ✓ ${cat}.resolved: ${actual.resolved}`); passed++; }
        else { console.log(`    ✗ ${cat}.resolved: expected ${exp.resolved}, got ${actual.resolved}`); failed++; }
      }
    }
  }

  console.log('  TESTED_BY:');
  check('direct', stats.testedBy.direct, expected.testedBy?.direct);
  check('indirect', stats.testedBy.indirect, expected.testedBy?.indirect);

  check('resolverErrors', errors.length, expected.errors?.expected);

  if (expected.sampleRelationships) {
    console.log('  Relationships:');
    for (const sample of expected.sampleRelationships) {
      const found = relationships.some(r => {
        if (r.type !== sample.type) return false;
        const fromId = (r as any).fromId ?? '';
        const toId = (r as any).toId ?? '';
        return fromId.includes(sample.from) && toId.includes(sample.to);
      });
      if (found) { console.log(`    ✓ ${sample.type}: ${sample.from} -> ${sample.to}`); passed++; }
      else { console.log(`    ✗ ${sample.type}: ${sample.from} -> ${sample.to} (not found)`); failed++; }
    }
  }

  console.log(`  Result: ${passed} passed, ${failed} failed`);

  if (failed > 0 && relationships.length > 0) {
    console.log('\n  Relationships found:');
    for (const rel of relationships) {
      const fromId = (rel as any).fromId ?? '';
      const toId = (rel as any).toId ?? '';
      const conf = (rel as any).confidence ?? '';
      console.log(`    ${rel.type}: ${fromId.replace(/.*\//, '')} -> ${toId.replace(/.*\//, '')} [${conf}]`);
    }
  }

  if (errors.length > 0 && failed > 0) {
    console.log('\n  Errors:');
    for (const err of errors) {
      console.log(`    ${err.type}: ${err.file.replace(/.*\//, '')}:${err.line} - ${err.message}`);
    }
  }

  return { passed, failed };
}

// Main
const dirs = readdirSync(testCasesDir)
  .filter(d => !d.startsWith('.') && !d.startsWith('index'))
  .sort();

console.log('Running resolver test cases...\n');
console.log(`Found ${dirs.length} test cases`);

let totalPassed = 0;
let totalFailed = 0;

for (const dir of dirs) {
  const { passed, failed } = runTestCase(join(testCasesDir, dir));
  totalPassed += passed;
  totalFailed += failed;
}

console.log('\n' + '='.repeat(50));
console.log(`SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);
process.exit(totalFailed > 0 ? 1 : 0);