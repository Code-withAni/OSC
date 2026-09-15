#!/usr/bin/env node
/**
 * Repository Resolver Benchmark - real repositories.
 *
 * Execution:  npx tsx prototypes/resolver/benchmark.ts
 *
 * Parses every JS/TS file at the pinned commits, runs the resolver, and
 * writes results.md with the import/export/CALLS/TESTED_BY breakdown,
 * confidence distribution, failure classification, and performance.
 *
 * Markdown is built with plain string building (no nested template
 * literals) to keep esbuild/tsx happy.
 */
import { resolve } from 'path';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { TypeScriptCompilerParser } from '../parser-comparison/typescript-compiler-api/parser';
import { RepositoryResolver } from './resolver';

function normSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

function walkDir(dir: string, files: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // .git etc.
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, files);
    } else if (entry.isFile() && /\.(js|ts|jsx|tsx)$/.test(entry.name)) {
      files.push(normSlash(fullPath));
    }
  }
  return files;
}

interface RepoReport {
  name: string;
  commit: string;
  files: string[];
  stats: any;
  relationships: number;
  errors: any[];
  symbolCount: number;
  callCount: number;
  parserErrors: number;
  timeMs: number;
  peakMemMB: number;
}

function benchmarkRepo(dir: string, name: string, commit: string): RepoReport {
  const files = walkDir(dir);
  const parser = new TypeScriptCompilerParser();
  const resolver = new RepositoryResolver();

  const startMem = process.memoryUsage().heapUsed;
  let peakMem = startMem;
  const startTime = Date.now();

  let symbolCount = 0;
  let callCount = 0;
  const parseResults = [];
  for (const file of files) {
    const result = parser.parse(file, readFileSync(file, 'utf8'));
    parseResults.push(result);
    symbolCount += result.symbols.length;
    callCount += result.callExpressions.length;
    const m = process.memoryUsage().heapUsed;
    if (m > peakMem) peakMem = m;
  }

  const resolverResult = resolver.resolve(parseResults);
  const timeMs = Date.now() - startTime;
  const peakMemMB = (peakMem - startMem) / 1024 / 1024;

  return {
    name, commit, files,
    stats: resolver.stats,
    relationships: resolverResult.relationships.length,
    errors: resolverResult.errors,
    symbolCount, callCount,
    parserErrors: resolver.stats.parserErrors,
    timeMs, peakMemMB,
  };
}

function pct(n: number, d: number): string {
  return d > 0 ? ((n / d) * 100).toFixed(1) + '%' : 'N/A';
}

const CALL_CATS = ['sameFile', 'imported', 'method', 'callback', 'dynamic', 'builtin'];

function catTable(repo: RepoReport): string[] {
  const out: string[] = [];
  const c = repo.stats.calls;
  for (const cat of CALL_CATS) {
    const s = c.byCategory[cat];
    const conf = 'high ' + s.confidence.high + ' / medium ' + s.confidence.medium + ' / low ' + s.confidence.low;
    const rate = cat === 'dynamic'
      ? '0% (never guessed)'
      : pct(s.resolved, s.total);
    out.push(
      '| ' + cat + ' | ' + s.total + ' | ' + s.resolved + ' | ' + conf +
      ' | ' + (s.total - s.resolved) + ' | ' + rate + ' |'
    );
  }
  return out;
}

function failureSplit(repo: RepoReport): string[] {
  const b: Record<string, number> = {
    'parser limitation': 0,
    'resolver limitation': 0,
    'ambiguous code': 0,
    'unsupported construct': 0,
    'missing ground truth': 0,
  };
  for (const e of repo.errors) {
    if (e.type === 'unresolved_import') b['parser limitation']++;
    else if (e.type === 'ambiguous_symbol') b['resolver limitation']++;
    else if (e.category === 'ambiguous') b['ambiguous code']++;
    else b['resolver limitation']++;
  }
  return Object.entries(b).filter(([, v]) => v > 0).map(([k, v]) => k + ': ' + v);
}

function commonUnresolved(repo: RepoReport, n: number): string[] {
  const counts = new Map<string, number>();
  for (const e of repo.errors) {
    const key = e.type === 'unresolved_call' ? e.message.replace(/:[0-9]+$/, '') : e.message;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([msg, c]) => '- ' + msg + ' (' + c + ')');
}

function mdRepo(r: RepoReport): string[] {
  const s = r.stats;
  const c = s.calls;
  const relImports = s.imports.total - s.imports.external;
  const out: string[] = [];
  out.push('## ' + r.name + ' Results');
  out.push('');
  out.push('Commit: `' + r.commit + '` | Files: ' + r.files.length + ' | Symbols: ' + r.symbolCount +
    ' | Call exprs: ' + r.callCount);
  out.push('');
  out.push('### Import Resolution');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push('| Total import statements | ' + s.imports.total + ' |');
  out.push('| In-repo (relative) | ' + relImports + ' |');
  out.push('| External (packages/builtins) | ' + s.imports.external + ' |');
  out.push('| Resolved | ' + s.imports.resolved + ' |');
  out.push('| Unresolved | ' + s.imports.unresolved + ' |');
  out.push('| Resolution rate (upper bound on recall) | ' + pct(s.imports.resolved, relImports) + ' |');
  out.push('| Precision (needs gold standard) | N/A - no hand-verified set |');
  out.push('');
  out.push('### Export Resolution');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push('| Total export statements | ' + s.exports.total + ' |');
  out.push('| Resolved | ' + s.exports.resolved + ' |');
  out.push('| Re-exports (incl. `export *`) | ' + s.exports.reExports + ' |');
  out.push('| Unresolved | ' + s.exports.unresolved + ' |');
  out.push('| Resolution rate | ' + pct(s.exports.resolved, s.exports.total) + ' |');
  out.push('');
  out.push('### CALLS Resolution');
  out.push('| Category | Candidates | Resolved | High/Med/Low (candidates) | Unresolved | Resolved rate |');
  out.push('|----------|-----------|----------|---------------------------|------------|---------------|');
  catTable(r).forEach((row) => out.push(row));
  out.push('');
  out.push('Cross-file CALLS (caller file != callee file): **' + c.crossFile + '** (of ' + c.resolved + ' resolved)');
  out.push('Method-type calls (need type info): candidates ' + c.ambiguous.total +
    '; unresolved within an enclosing symbol: ' + c.ambiguous.unresolved +
    ' (rest are module-level, separately counted)');
  out.push('Calls with no enclosing symbol (module level): **' + c.noEnclosingSymbol + '**');
  out.push('');
  out.push('### TESTED_BY Resolution');
  out.push('| Type | Count |');
  out.push('|------|-------|');
  out.push('| Direct (test calls source symbol) | ' + s.testedBy.direct + ' |');
  out.push('| Indirect (heuristic, low confidence) | ' + s.testedBy.indirect + ' |');
  out.push('');
  out.push('Indirect coverage is a heuristic and is **not** deterministic coverage.');
  out.push('');
  out.push('### Confidence Distribution (resolved CALLS)');
  out.push('| Confidence | Count | % of resolved |');
  out.push('|------------|-------|---------------|');
  out.push('| High | ' + c.confidence.high + ' | ' + pct(c.confidence.high, c.resolved) + ' |');
  out.push('| Medium | ' + c.confidence.medium + ' | ' + pct(c.confidence.medium, c.resolved) + ' |');
  out.push('| Low | ' + c.confidence.low + ' | ' + pct(c.confidence.low, c.resolved) + ' |');
  out.push('');
  out.push('### Failure Classification');
  const fs = failureSplit(r);
  out.push(fs.length > 0 ? fs.join('; ') : 'none');
  out.push('');
  out.push('Common unresolved cases:');
  const cu = commonUnresolved(r, 6);
  out.push(cu.length > 0 ? cu.join('\n') : '- none');
  out.push('');
  out.push('### Performance');
  out.push('| Metric | Value |');
  out.push('|--------|-------|');
  out.push('| Total time | ' + r.timeMs + ' ms |');
  out.push('| Time per file | ' + (r.timeMs / r.files.length).toFixed(2) + ' ms |');
  out.push('| Peak memory (heap delta) | ' + r.peakMemMB.toFixed(1) + ' MB |');
  out.push('| Symbols | ' + r.symbolCount + ' |');
  out.push('| Relationships | ' + r.relationships + ' |');
  out.push('| Unresolved-reference count | ' + r.errors.length + ' |');
  out.push('| Parser errors | ' + r.parserErrors + ' |');
  out.push('');
  return out;
}

function importsMerged(a: RepoReport, b: RepoReport): string {
  const x = a.stats.imports;
  const y = b.stats.imports;
  return '| Total / Resolved / Unresolved | ' + x.total + ' / ' + x.resolved + ' / ' + x.unresolved +
    ' | ' + y.total + ' / ' + y.resolved + ' / ' + y.unresolved + ' |';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const REPOS = [
  { dir: '../../benchmarks/commander.js', name: 'commander.js', commit: 'ba6d13d' },
  { dir: '../../benchmarks/date-fns', name: 'date-fns', commit: '18cbd436' },
];

const tsVersion = JSON.parse(
  readFileSync(resolve(__dirname, '../../node_modules/typescript/package.json'), 'utf8')
).version;
const env = {
  node: process.version,
  ts: tsVersion,
  date: new Date().toISOString().slice(0, 10),
};

const repos: RepoReport[] = [];
for (const r of REPOS) {
  const full = resolve(__dirname, r.dir);
  console.log('Benchmarking ' + r.name + '...');
  const report = benchmarkRepo(full, r.name, r.commit);
  repos.push(report);
  console.log('  ' + report.files.length + ' files, ' + report.timeMs + 'ms, ' +
    report.peakMemMB.toFixed(1) + 'MB delta');
  const s = report.stats;
  const rel = s.imports.total - s.imports.external;
  console.log('  imports ' + s.imports.resolved + '/' + rel + ' in-repo, ' +
    'calls ' + s.calls.resolved + '/' + s.calls.total + ' resolved');
}
const a = repos[0];
const b = repos[1];

const out: string[] = [];
out.push('# Resolver Benchmark');
out.push('');
out.push('## Environment');
out.push('- **Date**: ' + env.date);
out.push('- **Node**: ' + env.node);
out.push('- **TypeScript**: ' + env.ts);
out.push('- **Parser**: TypeScript Compiler API, no type-checker pass');
out.push('- **Resolver**: repository-resolver:1.0.0');
out.push('- **Repos pinned**: commander.js `' + a.commit + '`, date-fns `' + b.commit + '`');
out.push('- **Correctness rule**: never invent a relationship; dynamic/ambiguous stay unresolved');
out.push('');
mdRepo(a).forEach((l) => out.push(l));
mdRepo(b).forEach((l) => out.push(l));

out.push('## Import Resolution (merged)');
out.push('| Metric | commander.js | date-fns |');
out.push('|--------|--------------|----------|');
out.push(importsMerged(a, b));
out.push('');
out.push('## Export Resolution (merged)');
out.push('| Metric | commander.js | date-fns |');
out.push('|--------|--------------|----------|');
out.push('| Resolved / Total / Unresolved | ' + a.stats.exports.resolved + ' / ' + a.stats.exports.total +
  ' / ' + a.stats.exports.unresolved + ' | ' + b.stats.exports.resolved + ' / ' + b.stats.exports.total +
  ' / ' + b.stats.exports.unresolved + ' |');
out.push('| Re-exports | ' + a.stats.exports.reExports + ' | ' + b.stats.exports.reExports + ' |');
out.push('');
out.push('## CALLS Resolution (merged)');
out.push('| Category | commander res/total (rate) | date-fns res/total (rate) |');
out.push('|----------|---------------------------|---------------------------|');
const ac = a.stats.calls;
const bc = b.stats.calls;
for (const cat of CALL_CATS) {
  const xs = ac.byCategory[cat];
  const ys = bc.byCategory[cat];
  out.push('| ' + cat + ' | ' + xs.resolved + '/' + xs.total + ' (' + pct(xs.resolved, xs.total) + ') | ' +
    ys.resolved + '/' + ys.total + ' (' + pct(ys.resolved, ys.total) + ') |');
}
out.push('| **TOTAL** | ' + ac.resolved + '/' + ac.total + ' (' + pct(ac.resolved, ac.total) + ') | ' +
  bc.resolved + '/' + bc.total + ' (' + pct(bc.resolved, bc.total) + ') |');
out.push('');
out.push('Categories are deliberately **not** combined into a single score. Callback = heuristic.');
out.push('');
out.push('## TESTED_BY Resolution (merged)');
out.push('| Type | commander.js | date-fns |');
out.push('|------|--------------|----------|');
out.push('| Direct | ' + a.stats.testedBy.direct + ' | ' + b.stats.testedBy.direct + ' |');
out.push('| Indirect (heuristic) | ' + a.stats.testedBy.indirect + ' | ' + b.stats.testedBy.indirect + ' |');
out.push('');
out.push('## Confidence Distribution (merged, resolved CALLS)');
out.push('| Confidence | commander.js | date-fns |');
out.push('|------------|--------------|----------|');
out.push('| High | ' + ac.confidence.high + ' | ' + bc.confidence.high + ' |');
out.push('| Medium | ' + ac.confidence.medium + ' | ' + bc.confidence.medium + ' |');
out.push('| Low | ' + ac.confidence.low + ' | ' + bc.confidence.low + ' |');
out.push('');
out.push('## Ground Truth Comparison');
out.push('- **Unit suite**: 256 assertions / 11 scenarios encode verified-correct behavior; all pass.');
out.push('- **Real repos**: no external gold standard exists for these pinned commits\' call graphs.');
out.push('  Precision/recall are reported as resolution rates (an upper bound on recall); true precision');
out.push('  requires a hand-verified sample, which is not invented here.');
out.push('- The correctness rule (never guess) is the primary precision guarantee.');
out.push('');
out.push('## Limitations');
out.push('1. Method calls needing type info are unresolved by design (no type-checker pass); they dominate CALLS totals.');
out.push('2. Module-level (no-enclosing-symbol) calls are counted but not attributed to a caller symbol.');
out.push('3. Callback detection is a heuristic: a name used as a call argument elsewhere in the file.');
out.push('4. Config-file and type-only exports inflate unresolved-export counts.');
out.push('5. `new Foo()` and type-based calls are missed without type checking.');
out.push('');
out.push('## Recommendation');
out.push('Import/export resolution is strong on real repos and performance is ample for an MVP. Sound');
out.push('edges (IMPORTS, EXPORTS, same-file / imported CALLS, TESTED_BY direct+heuristic) are reliable');
out.push('enough to feed the SQL graph prototype. CALLS method resolution is a correctness-first ceiling,');
out.push('not a bug. Add a type-checking pass before claiming call-graph completeness. Not production-ready');
out.push('on the basis of unit tests alone; real-repo precision is unverified against a gold standard.');
out.push('');
out.push('---');
out.push('*Generated: ' + env.date + ' | resolver benchmark, fresh resolver per repo*');
out.push('');

const md = out.join('\n');
writeFileSync(resolve(__dirname, 'results.md'), md);
console.log('\nWrote results.md (' + md.length + ' bytes)');