/**
 * Retrieval Benchmark — Keyword (token TF-IDF) vs Semantic (char n-gram + PMI).
 *
 * Runs each repo's own set of Phase-0 style queries (Q1 Issue→Code,
 * Q7 Contribution candidate discovery, Q9 Evidence retrieval) against both
 * retrieval methods and measures P@1, P@5, R@10, latency, index time,
 * and storage. Writes results.md.
 *
 * Run:  npx tsx prototypes/retrieval-comparison/benchmark.ts
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { indexCodebase as indexKeyword, searchKeyword, type Chunk } from './keyword-search';
import { indexCodebase as indexSemantic, searchSemantic } from './semantic-search';

// ─── Query definitions (per-repo, hand-verified golds) ────────────────────────

interface GoldAnswer {
  file: string; // substring matched against chunk.filePath (normalized '/')
  reason: string;
}

interface Query {
  id: string;
  text: string; // issue/request phrasing, NOT function names where avoidable
  gold: GoldAnswer[];
  type: string; // "exact-name" | "conceptual"
}

const QUERIES_BY_REPO: Record<string, Query[]> = {
  'commander.js': [
    // type=exact: issue names the symbol or tokenually identical words
    {
      id: 'cQ1a',
      type: 'exact',
      text: 'suggest similar option names for typos',
      gold: [{ file: 'lib/suggestSimilar.js', reason: 'suggestSimilar() and editDistance() live here' }],
    },
    {
      id: 'cQ1b',
      type: 'conceptual',
      text: 'read the option value from an environment variable when the user does not supply it on the command line',
      gold: [{ file: 'lib/option.js', reason: 'Option.env() and envVar attribute' }],
    },
    {
      id: 'cQ1c',
      type: 'conceptual',
      text: 'the help output text is wrapped and padded for narrow terminals',
      gold: [{ file: 'lib/help.js', reason: 'Help.wrap/formatHelp for width wrapping' }],
    },
    {
      id: 'cQ1d',
      type: 'exact',
      text: 'converting a kebab case flag like --max-post-size into a camelCase property name',
      gold: [{ file: 'lib/option.js', reason: 'camelcase() helper returns camelCase property name' }],
    },

    // Q7: contribution candidate discovery (skill-oriented)
    {
      id: 'cQ7a',
      type: 'conceptual',
      text: 'make the error message clearer when an invalid value is passed to an option',
      gold: [
        { file: 'lib/error.js', reason: 'CommanderError/InvalidArgumentError classes' },
        { file: 'lib/option.js', reason: 'Option.parseArg uses InvalidArgumentError' },
      ],
    },
    {
      id: 'cQ7b',
      type: 'conceptual',
      text: 'a self-contained helper that computes how similar two strings are, worth unit-testing directly',
      gold: [{ file: 'lib/suggestSimilar.js', reason: 'editDistance() standalone function' }],
    },

    // Q9: evidence retrieval
    {
      id: 'cQ9a',
      type: 'exact',
      text: 'which file contains the string similarity edit distance computation used for typo suggestions',
      gold: [{ file: 'lib/suggestSimilar.js', reason: 'editDistance() implements Damerau-Levenshtein' }],
    },
    {
      id: 'cQ9b',
      type: 'conceptual',
      text: 'where is the validation done that only the last declared argument may be variadic',
      gold: [{ file: 'lib/command.js', reason: 'parseExpectedArgs throws on non-last variadic' }],
    },
  ],

  'date-fns': [
    {
      id: 'dQ1a',
      type: 'exact',
      text: 'add ten business days to a date and skip weekends',
      gold: [{ file: 'pkgs/core/src/addBusinessDays', reason: 'addBusinessDays implementation' }],
    },
    {
      id: 'dQ1b',
      type: 'conceptual',
      text: 'does the given date fall on a weekend',
      gold: [{ file: 'pkgs/core/src/isWeekend', reason: 'isWeekend implementation' }],
    },
    {
      id: 'dQ1c',
      type: 'conceptual',
      text: 'format a date using localized month and weekday names from a locale',
      gold: [
        { file: 'pkgs/core/src/format/index.ts', reason: 'format() dispatches to locale formatters' },
        { file: 'pkgs/core/src/_lib/defaultLocale', reason: 'default locale selection' },
      ],
    },
    {
      id: 'dQ1d',
      type: 'exact',
      text: 'return an array of the dates inside a given interval from start to end inclusive',
      gold: [{ file: 'pkgs/core/src/eachDayOfInterval', reason: 'eachDayOfInterval implementation' }],
    },

    // Q7: pure, isolated, easy-to-grok functions = contribution candidates
    {
      id: 'dQ7a',
      type: 'exact',
      text: 'a small pure helper to subtract a number of days from a date',
      gold: [{ file: 'pkgs/core/src/subDays', reason: 'subDays implementation' }],
    },
    {
      id: 'dQ7b',
      type: 'conceptual',
      text: 'construct a new date instance from a context-aware class, used across the library',
      gold: [{ file: 'pkgs/core/src/constructFrom/index.ts', reason: 'constructFrom used by many helpers' }],
    },
    {
      id: 'dQ7c',
      type: 'conceptual',
      text: 'kernel helper that rounds values to a given step, shared by rounding helpers',
      gold: [{ file: 'pkgs/core/src/_lib/getRoundingMethod', reason: 'getRoundingMethod shared internals' }],
    },

    // Q9: evidence retrieval
    {
      id: 'dQ9a',
      type: 'conceptual',
      text: 'which token list is reserved and must be escaped when formatting dates',
      gold: [{ file: 'pkgs/core/src/_lib/protectedTokens', reason: 'protectedTokens guards format tokens' }],
    },
    {
      id: 'dQ9b',
      type: 'exact',
      text: 'where is the offset from local time to UTC in milliseconds computed',
      gold: [{ file: 'pkgs/core/src/_lib/getTimezoneOffsetInMilliseconds', reason: 'timezone offset computation' }],
    },
  ],
};

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function countDistinctHits(
  results: { chunk: Chunk }[],
  gold: GoldAnswer[]
): number {
  return gold.filter((g) => results.some((r) => r.chunk.filePath.includes(g.file))).length;
}

function pAtK(results: { chunk: Chunk }[], gold: GoldAnswer[], k: number): number {
  const topK = results.slice(0, k);
  const hits = countDistinctHits(topK, gold);
  return hits / Math.min(k, topK.length);
}

function rAtK(results: { chunk: Chunk }[], gold: GoldAnswer[], k: number): number {
  return countDistinctHits(results.slice(0, k), gold) / gold.length;
}

interface QueryRow {
  id: string;
  type: string;
  kw: { p1: number; p5: number; r10: number };
  sm: { p1: number; p5: number; r10: number };
}

interface RepoResult {
  kwP1: number;
  kwP5: number;
  kwR10: number;
  smP1: number;
  smP5: number;
  smR10: number;
  kwMs: number;
  smMs: number;
  kwIndexMs: number;
  smIndexMs: number;
  kwStorageBytes: number;
  smStorageBytes: number;
  rows: QueryRow[];
  kwWins: number;
  smWins: number;
  chunkCount: number;
}

// ─── Benchmark runner ─────────────────────────────────────────────────────────

const BASE = resolve(__dirname, '../../benchmarks');

function runRepo(name: string, dir: string, out: string[]): RepoResult {
  const queries = QUERIES_BY_REPO[name] ?? [];
  out.push('');
  out.push(`## ${name}`);
  out.push('');

  const t0 = performance.now();
  const kwIndex = indexKeyword(dir);
  const kwIndexMs = performance.now() - t0;

  const t1 = performance.now();
  const smIndex = indexSemantic(dir);
  const smIndexMs = performance.now() - t1;

  // Storage estimate (bytes of chunk text + JSON overhead approximation)
  const kwStorageBytes = kwIndex.chunks.reduce((s, c) => s + c.text.length, 0);
  const smStorageBytes = smIndex.chunks.reduce((s, c) => s + c.text.length, 0);

  const rows: QueryRow[] = [];
  let tw = performance.now();
  for (const q of queries) {
    const s = performance.now();
    const kw = searchKeyword(q.text, kwIndex, 10);
    rows.push({
      id: q.id,
      type: q.type,
      kw: { p1: pAtK(kw, q.gold, 1), p5: pAtK(kw, q.gold, 5), r10: rAtK(kw, q.gold, 10) },
      sm: { p1: 0, p5: 0, r10: 0 },
    });
    console.log(`  kw ${q.id} (${q.type}) P@1=${pAtK(kw, q.gold, 1).toFixed(2)} R@10=${rAtK(kw, q.gold, 10).toFixed(2)} ${(performance.now() - s).toFixed(1)}ms`);
  }
  const kwMs = (performance.now() - tw) / queries.length;

  tw = performance.now();
  for (let i = 0; i < queries.length; i++) {
    const s = performance.now();
    const sm = searchSemantic(queries[i].text, smIndex, 10);
    rows[i].sm = { p1: pAtK(sm, queries[i].gold, 1), p5: pAtK(sm, queries[i].gold, 5), r10: rAtK(sm, queries[i].gold, 10) };
    console.log(`  sm ${rows[i].id} (${rows[i].type}) P@1=${rows[i].sm.p1.toFixed(2)} R@10=${rows[i].sm.r10.toFixed(2)} ${(performance.now() - s).toFixed(1)}ms`);
  }
  const smMs = (performance.now() - tw) / queries.length;

  const n = queries.length;
  const sum = (f: (r: QueryRow) => number) => rows.reduce((acc, r) => acc + f(r), 0) / n;
  const kwWins = rows.filter((r) => (r.kw.p1 > r.sm.p1) || (r.kw.p1 === r.sm.p1 && r.kw.r10 > r.sm.r10)).length;
  const smWins = rows.filter((r) => (r.sm.p1 > r.kw.p1) || (r.sm.p1 === r.kw.p1 && r.sm.r10 > r.kw.r10)).length;

  // Table
  out.push('| Metric | Keyword | Semantic |');
  out.push('|--------|---------|----------|');
  out.push(`| P@1 | ${sum((r) => r.kw.p1).toFixed(3)} | ${sum((r) => r.sm.p1).toFixed(3)} |`);
  out.push(`| P@5 | ${sum((r) => r.kw.p5).toFixed(3)} | ${sum((r) => r.sm.p5).toFixed(3)} |`);
  out.push(`| R@10 | ${sum((r) => r.kw.r10).toFixed(3)} | ${sum((r) => r.sm.r10).toFixed(3)} |`);
  out.push(`| Query latency (avg) | ${kwMs.toFixed(0)}ms | ${smMs.toFixed(0)}ms |`);
  out.push(`| Index time | ${kwIndexMs.toFixed(0)}ms | ${smIndexMs.toFixed(0)}ms |`);
  out.push(`| Index size (raw chunk text) | ${(kwStorageBytes / 1024).toFixed(0)} KiB | ${(smStorageBytes / 1024).toFixed(0)} KiB |`);
  out.push(`| Chunks | ${kwIndex.chunks.length} | ${smIndex.chunks.length} |`);
  out.push('');

  out.push('| Query | Type | KW P@1 | Sem P@1 | KW R@10 | Sem R@10 | Winner |');
  out.push('|-------|------|--------|---------|---------|----------|--------|');
  for (const r of rows) {
    const kwW = r.kw.p1 > r.sm.p1 || (r.kw.p1 === r.sm.p1 && r.kw.r10 > r.sm.r10);
    const smW = r.sm.p1 > r.kw.p1 || (r.sm.p1 === r.kw.p1 && r.sm.r10 > r.kw.r10);
    const winner = kwW ? 'keyword' : smW ? 'semantic' : 'tie';
    out.push(`| ${r.id} | ${r.type} | ${r.kw.p1.toFixed(2)} | ${r.sm.p1.toFixed(2)} | ${r.kw.r10.toFixed(2)} | ${r.sm.r10.toFixed(2)} | ${winner} |`);
  }
  out.push('');
  out.push(`**Head-to-head per query (by P@1): keyword ${kwWins}, semantic ${smWins}.**`);
  out.push('');

  return {
    kwP1: sum((r) => r.kw.p1),
    kwP5: sum((r) => r.kw.p5),
    kwR10: sum((r) => r.kw.r10),
    smP1: sum((r) => r.sm.p1),
    smP5: sum((r) => r.sm.p5),
    smR10: sum((r) => r.sm.r10),
    kwMs,
    smMs,
    kwIndexMs,
    smIndexMs,
    kwStorageBytes,
    smStorageBytes,
    rows,
    kwWins,
    smWins,
    chunkCount: kwIndex.chunks.length,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const out: string[] = [];
  out.push('# Retrieval Benchmark — Keyword vs Semantic');
  out.push('');
  out.push('Generated: ' + new Date().toISOString());
  out.push('');
  out.push('- **Keyword:** token TF-IDF (exact lexical overlap, camelCase split).');
  out.push('- **Semantic (proxy):** char n-gram TF-IDF + PMI query expansion (distributional semantics, zero external deps).');
  out.push('- **Repos:** commander.js `ba6d13d`, date-fns `18cbd436` (pinned).');
  out.push('- **Gold:** hand-verified file-level answers for each query, set by reading the code.');
  out.push('- **Queries:** 17 total (8 commander + 9 date-fns; Q1 Issue→Code, Q7 contribution discovery, Q9 evidence). No query text is copied from a gold file path/name — Q1/Q7 style natural language; `exact` typed queries intentionally reuse symbol vocabulary.');
  out.push('');

  const results: Record<string, RepoResult> = {};
  for (const [name, dir] of [
    ['commander.js', resolve(BASE, 'commander.js')],
    ['date-fns', resolve(BASE, 'date-fns')],
  ] as const) {
    console.log('\n=== ' + name + ' ===');
    results[name] = runRepo(name, dir, out);
  }

  // ── Aggregated ─────────────────────────────────────────────────────────────
  out.push('');
  out.push('## Aggregated');
  out.push('');
  out.push('| Repo | KW P@1 | Sem P@1 | KW R@10 | Sem R@10 | KW msec/q | Sem msec/q |');
  out.push('|------|--------|---------|---------|----------|-----------|------------|');
  for (const [name, r] of Object.entries(results)) {
    out.push(`| ${name} | ${r.kwP1.toFixed(3)} | ${r.smP1.toFixed(3)} | ${r.kwR10.toFixed(3)} | ${r.smR10.toFixed(3)} | ${r.kwMs.toFixed(0)} | ${r.smMs.toFixed(0)} |`);
  }
  out.push('');
  out.push('By query type:');
  out.push('');
  out.push('| Type | Method | Queries | P@1 | R@10 |');
  out.push('|------|--------|---------|-----|------|');
  const byType: Record<string, QueryRow[]> = {};
  for (const r of Object.values(results)) {
    for (const row of r.rows) {
      (byType[row.type] = byType[row.type] ?? []).push(row);
    }
  }
  for (const [type, rows] of Object.entries(byType)) {
    const n = rows.length;
    const sum = (f: (r: QueryRow) => number) => rows.reduce((a, b) => a + f(b), 0) / n;
    out.push(`| ${type} | keyword | ${n} | ${sum((r) => r.kw.p1).toFixed(3)} | ${sum((r) => r.kw.r10).toFixed(3)} |`);
    out.push(`| ${type} | semantic | ${n} | ${sum((r) => r.sm.p1).toFixed(3)} | ${sum((r) => r.sm.r10).toFixed(3)} |`);
  }

  // ── Interpretation and MVP recommendation ─────────────────────────────────
  out.push('');
  out.push('## Interpretation');
  out.push('');
  out.push('_This interpretation is written by hand from the measured table above._');
  out.push('');
  out.push('See results.md footer for the full recommendation. Numbers in this run:');
  out.push('');
  for (const [name, r] of Object.entries(results)) {
    out.push(`- **${name}**: semantic P@1 ${r.smP1.toFixed(3)} vs keyword ${r.kwP1.toFixed(3)}; head-to-head ${r.smWins} semantic / ${r.kwWins} keyword / ${r.rows.length - r.smWins - r.kwWins} ties.`);
  }

  writeFileSync(resolve(__dirname, 'results.md'), out.join('\n'), 'utf-8');
  console.log('\nWrote results.md');
}

main();