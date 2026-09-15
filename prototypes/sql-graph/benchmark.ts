/**
 * benchmark.ts — Graph Storage Benchmark: PostgreSQL suitabicy for the MVP
 * knowledge graph.
 *
 * Size matrix:
 *   small   commander.js (real, pinned ba6d13d)
 *   medium  date-fns      (real, pinned 18cbd436)
 *   large   synthetic ×S  (real date-fns topology cloned; LABELED synthetic)
 *   stress  synthetic ×S² (target ≥ ~250k relationships)
 *
 * Per size, per query: correctness vs in-memory gold, cold-cache latency
 * (postgres process restart + 1 run), warm-cache p50/p95/p99 (15 runs),
 * rows returned, EXPLAIN (plan node, index usage, buffers), and cost.
 * Plus: node/edge counts, insert throughput, storage, client memory.
 *
 * Writes results-data.json (machine-readable) and results.md (measured tables).
 * Interpretation + conclusion are hand-written AFTER inspecting the data.
 *
 * Run: npx tsx prototypes/sql-graph/benchmark.ts
 *      flags: --sizes small,medium,large,stress   --dbdir <path>
 */
import { readFileSync, writeFileSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { loadRealRepo, synthesize, type Graph } from './load-data';
import { QUERIES, type BenchmarkQuery } from './queries';

const { Client } = pg;

const PROTOTYPE = dirname(fileURLToPath(import.meta.url));
const HERE = PROTOTYPE;
const DB_DIR = process.argv.includes('--dbdir')
  ? resolve(process.argv[process.argv.indexOf("--dbdir") + 1])
  : resolve(PROTOTYPE, '.pgdata-bench');
const PORT = 55433;
const USER = 'postgres';
const PASS = 'postgres';
const DB_NAME = 'oscgraph';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Windows shared-memory quirk: `ep.stop()` does a tree-kill of the postmaster
 * PID, which can leave a postgres child alive; children hold the shared-memory
 * segment without LISTENING, so the next `ep.start()` fails with "pre-existing
 * shared memory block is still in use".
 *
 * Deterministic fix: kill EVERY postgres.exe whose image is inside our embedded
 * bundle (its bin dir), then resweep after a beat so stragglers caught mid-teardown
 * by the first sweep don't survive.
 */
const CLEANUP_SCRIPT = resolve(PROTOTYPE, 'cleanup-postgres.ps1');

/** Invoke the standalone sweep script (avoids PowerShell quoting traps). */
function runPs(action: 'kill' | 'count'): string {
  const out = execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -File "${CLEANUP_SCRIPT}" -Action ${action}`
  );
  return out.toString().trim();
}

/** Count our embedded postgres.exe processes. */
function embeddedPostgresCount(): number {
  try { const n = parseInt(runPs('count'), 10); return Number.isNaN(n) ? 0 : n; }
  catch { return 0; }
}

function killEmbeddedPostgres(): void {
  try { runPs('kill'); } catch { /* none */ }
}

/**
 * Kill every embedded postgres process and WAIT until none remain — the OS only
 * destroys the shared-memory mapping once the last participant exits, which is
 * the "pre-existing shared memory block is still in use" culprit on Windows.
 * Resweeps on a beat so a process caught mid-teardown dies before we proceed.
 */
async function ensureDead(maxMs = 8000): Promise<void> {
  const deadline = Date.now() + maxMs;
  killEmbeddedPostgres();
  for (;;) {
    if (embeddedPostgresCount() === 0) { await delay(400); return; }
    if (Date.now() > deadline) {
      throw new Error(`postgres still running after ${maxMs}ms (${embeddedPostgresCount()} left)`);
    }
    await delay(400);
    killEmbeddedPostgres();
  }
}

// ── PostgreSQL lifecycle wrapper ──────────────────────────────────────────────
class PG {
  private ep: EmbeddedPostgres;
  client!: pg.Client;
  constructor() {
    this.ep = new EmbeddedPostgres({
      databaseDir: DB_DIR,
      user: USER,
      password: PASS,
      port: PORT,
      persistent: true,
    });
  }

  /** Hard reset: stop server, wipe data dir, init fresh, start, create db. */
  async reset(): Promise<void> {
    // Close the old client BEFORE killing the server, or its socket emits an
    // unhandled 'error' when the postmaster dies under it (crashes the process).
    try { await this.client?.end(); } catch { /* noop */ }
    try { await this.ep.stop(); } catch { /* not running */ }
    await ensureDead();
    await wipeDir(DB_DIR);
    await this.ep.initialise();
    await this.start();
    // Windows initdb defaults to WIN1252; force UTF8/C so UTF-8 ids/props store.
    const boot = new Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASS, database: 'postgres' });
    await boot.connect();
    await boot.query(`CREATE DATABASE "${DB_NAME}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
    await boot.end();
    this.client = new Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASS, database: DB_NAME });
    this.client.on('error', () => { /* socket drop handled by query rejection */ });
    await this.client.connect();
  }

  async stop(): Promise<void> {
    try { await this.client?.end(); } catch { /* noop */ }
    try { await this.ep.stop(); } catch { /* noop */ }
  }

  /** Windows: a stray mapping can outlive the sweep by a beat; retry once. */
  async start(): Promise<void> {
    try { await this.ep.start(); return; }
    catch { await ensureDead(); await this.ep.start(); }
  }

  /** Stop+start to drop PG shared_buffers (process-cold). OS page cache persists. */
  async restartForCold(): Promise<void> {
    await this.client.end();
    try { await this.ep.stop(); } catch { /* already down */ }
    await ensureDead();
    await this.start();
    this.client = new Client({ host: '127.0.0.1', port: PORT, user: USER, password: PASS, database: DB_NAME });
    this.client.on('error', () => { /* socket drop handled by query rejection */ });
    await this.client.connect();
  }

  async applySchema(): Promise<void> {
    const sql = readFileSync(resolve(PROTOTYPE, 'schema.sql'), 'utf8');
    await this.client.query(sql);
  }

  async sizeNow(): Promise<{ nodes: number; rels: number }> {
    const a = await this.client.query('SELECT count(*) c FROM nodes');
    const b = await this.client.query('SELECT count(*) c FROM relationships');
    return { nodes: +a.rows[0].c, rels: +b.rows[0].c };
  }

  async dbSizeBytes(): Promise<number> {
    const r = await this.client.query(
      `SELECT pg_total_relation_size('nodes') + pg_total_relation_size('relationships') AS s`);
    return +r.rows[0].s;
  }
}

// ── insertion ─────────────────────────────────────────────────────────────────
async function insertGraph(pg: PG, g: Graph, batch = 4000): Promise<{ nodeMs: number; relMs: number; nodeRows: number; relRows: number }> {
  function placeholders(n: number, cols: number, offset = 0): string {
    const rows: string[] = [];
    for (let i = 0; i < n; i++) {
      const cells: string[] = [];
      for (let c = 0; c < cols; c++) cells.push(`$${i * cols + c + 1 + offset}`);
      rows.push(`(${cells.join(',')})`);
    }
    return rows.join(',');
  }
  const NODE_COLS = 10;
  const REL_COLS = 5;

  const t0 = performance.now();
  for (let i = 0; i < g.nodes.length; i += batch) {
    const chunk = g.nodes.slice(i, i + batch);
    const sql = `INSERT INTO nodes (id, node_type, name, kind, file_path, start_line, end_line, is_exported, is_test, props) VALUES ${placeholders(chunk.length, NODE_COLS)}`;
    const params: unknown[] = [];
    for (const n of chunk) params.push(n.id, n.type, n.name, n.kind ?? null, n.filePath ?? null, n.startLine ?? null, n.endLine ?? null, n.isExported ?? false, n.isTest ?? false, JSON.stringify(n.props));
    await pg.client.query(sql, params);
  }
  const nodeMs = performance.now() - t0;

  const t1 = performance.now();
  for (let i = 0; i < g.rels.length; i += batch) {
    const chunk = g.rels.slice(i, i + batch);
    const sql = `INSERT INTO relationships (from_id, to_id, rel_type, call_site_line, props) VALUES ${placeholders(chunk.length, REL_COLS)}`;
    const params: unknown[] = [];
    for (const r of chunk) params.push(r.from, r.to, r.type, r.callSiteLine ?? null, JSON.stringify(r.props));
    await pg.client.query(sql, params);
  }
  const relMs = performance.now() - t1;
  return { nodeMs, relMs, nodeRows: g.nodes.length, relRows: g.rels.length };
}

// ── query measurement ─────────────────────────────────────────────────────────
function pct(list: number[], p: number): number {
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

interface QueryReport {
  key: string;
  label: string;
  correct: boolean;
  goldCount: number;
  rowCount: number;
  coldMs: number;
  warm: { p50: number; p95: number; p99: number };
  plan: string;
  indexUsed: boolean;
  buffers: { hit: number; read: number };
  tempBytes?: number | null;
  nodeCount: number;
  depthLimit?: number;
}

async function measureQuery(pg: PG, q: BenchmarkQuery, g: Graph): Promise<QueryReport> {
  const params = q.seedParams(g);

  // Correctness: SQL rows vs gold set.
  const gold = q.gold(g, params);
  const corr = await pg.client.query(q.sql, params);
  const sqlIds = corr.rows.map((r) => r.id ?? r.sym ?? r.id + '').sort();
  const goldSorted = gold.sort();
  const correct = JSON.stringify(sqlIds) === JSON.stringify(goldSorted);
  const rowCount = corr.rows.length;
  const depthLimit = q.sql.includes('$2') ? (params[1] as number) : undefined;

  // Index usage + buffers via EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON).
  const exp = await pg.client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, params);
  const plan = exp.rows[0]['QUERY PLAN'];
  const root = plan[0];
  const planJson = JSON.stringify(plan);
  const indexUsed = planJson.includes('"Index Scan"') || planJson.includes('"Index Only Scan"');
  const top = root.Plan ?? root;
  const buffers = {
    hit: top['Shared Hit Blocks'] ?? 0,
    read: top['Shared Read Blocks'] ?? 0,
  };
  const tempBytes = (planJson.match(/"Temp Size": ?([0-9]+)/g) ?? [])
    .reduce((a: number, m: string) => a + +m.replace(/[^0-9]/g, ''), 0) || null;

  // Cold: restart server, then one run.
  await pg.restartForCold();
  let t = performance.now();
  await pg.client.query(q.sql, params);
  const coldMs = performance.now() - t;

  // Warm: 2 warmups + 15 timed.
  await pg.client.query(q.sql, params);
  await pg.client.query(q.sql, params);
  const times: number[] = [];
  for (let i = 0; i < 15; i++) {
    t = performance.now();
    await pg.client.query(q.sql, params);
    times.push(performance.now() - t);
  }

  // Plan node label (top-level).
  const planLabel = planNodeLabel(root);

  return {
    key: q.key, label: q.label, correct, goldCount: goldSorted.length, rowCount,
    coldMs, warm: { p50: +pct(times, 50).toFixed(1), p95: +pct(times, 95).toFixed(1), p99: +pct(times, 99).toFixed(1) },
    plan: planLabel, indexUsed, buffers, tempBytes: tempBytes ?? null,
    nodeCount: g.nodes.length, depthLimit,
  };
}

function planNodeLabel(root: Record<string, any>): string {
  const parts: string[] = [];
  let n: Record<string, any> | undefined = root.Plan;
  while (n) {
    parts.push(n['Node Type']);
    n = n['Plans']?.[0];
  }
  return parts.join(' › ');
}

// ── size definitions ──────────────────────────────────────────────────────────
interface SizeDef { name: string; build: () => Promise<Graph>; }

function sizesFromArg(): SizeDef[] {
  const repoTpl = (dir: string, label: string) => async () => loadRealRepo(resolve(HERE, dir), label);
  const synth = (scale: number) => async () => {
    const tpl = await loadRealRepo(resolve(HERE, '../../benchmarks/date-fns'), 'date-fns');
    return synthesize(tpl, scale);
  };
  const all: SizeDef[] = [
    { name: 'small', build: repoTpl('../../benchmarks/commander.js', 'commander.js') },
    { name: 'medium', build: repoTpl('../../benchmarks/date-fns', 'date-fns') },
    { name: 'large', build: synth(4) },
    { name: 'stress', build: synth(16) },
  ];
  const arg = process.argv.find((a) => a.startsWith('--sizes='));
  if (!arg) return all;
  const want = arg.split('=')[1].split(',');
  return all.filter((s) => want.includes(s.name));
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pg = new PG();
  const out: Record<string, any> = {};
  const md: string[] = [];

  md.push('# Graph Storage Benchmark — PostgreSQL for the MVP Knowledge Graph', '');
  md.push('Measured run. Interpretation + conclusion are hand-written below the tables.', '');

  for (const size of sizesFromArg()) {
    const g = await size.build();
    console.log(`\n=== ${size.name}: building graph ${g.label} (${g.nodes.length} nodes, ${g.rels.length} rels) ===`);
    md.push('', `### ${size.name} — ${g.label} (${g.nodes.length} nodes, ${g.rels.length} rels, kind=${g.kind})`, '');

    await pg.reset();
    // Discover PG version on first reset (avoids a separate initdb cycle that
    // causes Windows shared-memory conflicts).
    if (md.length <= 3) {
      const v = await pg.client.query('select version() v');
      const ver = (v.rows[0].v as string).match(/PostgreSQL [0-9.]+/)?.[0] ?? 'unknown';
      md.push(`- **Environment:** Windows 11 · Node ${process.version} · embedded ${ver}`);
    }
    await pg.applySchema();
    const ins = await insertGraph(pg, g);
    await pg.client.query('ANALYZE nodes; ANALYZE relationships;');
    const counts = await pg.sizeNow();
    const bytes = await pg.dbSizeBytes();

    const reports: QueryReport[] = [];
    for (const q of QUERIES) {
      const r = await measureQuery(pg, q, g);
      reports.push(r);
      console.log(`  ${r.key.padEnd(16)} ${r.correct ? 'correct' : '!!! WRONG'} cold=${r.coldMs.toFixed(1)}ms p50=${r.warm.p50}ms p95=${r.warm.p95}ms p99=${r.warm.p99}ms (${r.rowCount} rows)`);
    }

    const row = {
      label: g.label, kind: g.kind,
      nodes: counts.nodes, rels: counts.rels,
      insertNodeRowsSec: Math.round(ins.nodeRows / (ins.nodeMs / 1000)),
      insertRelRowsSec: Math.round(ins.relRows / (ins.relMs / 1000)),
      insertNodeMs: Math.round(ins.nodeMs), insertRelMs: Math.round(ins.relMs),
      storageBytes: bytes,
      clientPeakMemMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      queries: reports.map((r) => ({
        key: r.key, correct: r.correct, goldCount: r.goldCount, rowCount: r.rowCount,
        coldMs: +r.coldMs.toFixed(1), p50: r.warm.p50, p95: r.warm.p95, p99: r.warm.p99,
        plan: r.plan, indexUsed: r.indexUsed, bufHit: r.buffers.hit, bufRead: r.buffers.read,
        tempBytes: r.tempBytes, depthLimit: r.depthLimit,
      })),
    };
    out[size.name] = row;

    md.push('| Metric | Value |', '|---|---|');
    md.push(`| kind | ${row.kind} |`);
    md.push(`| rows | ${row.nodes} nodes / ${row.rels} rels |`);
    md.push(`| insert | ${row.insertNodeRowsSec.toLocaleString()} node/s · ${row.insertRelRowsSec.toLocaleString()} rel/s |`);
    md.push(`| storage (tables+indexes) | ${(row.storageBytes / 1024 / 1024).toFixed(2)} MiB |`);
    md.push(`| client peak heap (run) | ~${row.clientPeakMemMB} MB |`, '');

    md.push('| Query | Correct | Rows | Cold (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Plan | Index? | Buf H/R |');
    md.push('|-------|---------|------|-----------|----------|----------|----------|------|--------|---------|');
    for (const r of reports) {
      md.push(`| ${r.label} | ${r.correct ? 'yes' : '**NO**'} | ${r.rowCount} | ${r.coldMs.toFixed(0)} | ${r.warm.p50} | ${r.warm.p95} | ${r.warm.p99} | ${r.plan} | ${r.indexUsed ? 'yes' : 'no'} | ${r.buffers.hit}/${r.buffers.read} |`);
    }
    md.push('');
  }

  await pg.stop();
  writeFileSync(resolve(PROTOTYPE, 'results-data.json'), JSON.stringify(out, null, 2), 'utf8');
  writeFileSync(resolve(PROTOTYPE, 'results.md'), md.join('\n'), 'utf8');
  console.log('\nWrote results-data.json + results.md (tables only; interpretation follows by hand)');
}

/** Retry rmdir a few times — postgres children release the dir late on Windows. */
async function wipeDir(dir: string): Promise<void> {
  let last: unknown;
  for (let i = 0; i < 5; i++) {
    try { rmSync(dir, { recursive: true, force: true }); return; }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 400)); }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

main().catch((e) => { console.error(e); process.exit(1); });