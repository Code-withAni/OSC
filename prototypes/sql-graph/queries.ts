/**
 * queries.ts — the five Phase-0 graph queries benchmarked against PostgreSQL,
 * each with an in-memory gold-standard comparator over the same loaded graph.
 *
 *   Q2  find callers of a symbol
 *   Q3  find tests covering a symbol
 *   Q4  N-hop reverse impact analysis (transitive callers) — recursive CTE
 *   Q6  test-coverage gaps (public symbols with no TESTED_BY)
 *   Q9  evidence neighborhood — radius subgraph around a node (any rel type)
 *
 * Correctness = SQL result set equals the gold computed in memory from the
 * same graph data (exact set equality). This validates that PostgreSQL
 * executes the graph semantics, not the resolver's quality (validated in
 * prototypes/resolver).
 */

import type { Graph, GraphNode } from './load-data';

export interface BenchmarkQuery {
  key: string;
  label: string;
  /** Parameterized SQL. $1 onwards are query params that benchmark.ts fills. */
  sql: string;
  /** Human reading of what the query returns. */
  explain: string;
  /** Choose param values for one run of this query against a graph. */
  seedParams: (g: Graph) => unknown[];
  /** Gold result as a sorted array of node ids, for correctness comparison. */
  gold: (g: Graph, params: unknown[]) => string[];
  /** Limit rows returned for a benchmark iteration (big subgraphs). */
  rowCap: (g: Graph, params: unknown[]) => number;
}

/** Deterministic seed symbols: the top CALLS in-degree symbols. */
export function seedSymbols(g: Graph, n: number): string[] {
  const id = new Map<string, number>();
  for (const r of g.rels) if (r.type === 'CALLS') id.set(r.to, (id.get(r.to) ?? 0) + 1);
  return g.nodes
    .filter((x) => x.type === 'Symbol')
    .sort((a, b) => (id.get(b.id) ?? 0) - (id.get(a.id) ?? 0) || a.id.localeCompare(b.id))
    .slice(0, n)
    .map((x) => x.id);
}

export function nodeById(g: Graph, id: string): GraphNode | undefined {
  return g.byId.get(id);
}

// ── Q2: find callers ─────────────────────────────────────────────────────────
export const q2: BenchmarkQuery = {
  key: 'Q2-callers',
  label: 'Q2 — Find callers (direct)',
  sql: `
    SELECT DISTINCT n.id, n.name, n.kind, n.file_path, n.start_line
    FROM relationships r
    JOIN nodes n ON n.id = r.from_id
    WHERE r.rel_type = 'CALLS' AND r.to_id = $1
    ORDER BY n.id`,
  explain: 'Index scan on (to_id) partial CALLS index; join back to nodes.',
  seedParams: (g) => [seedSymbols(g, 1)[0]],
  gold: (g, params) => {
    const ids = g.rels.filter((r) => r.type === 'CALLS' && r.to === params[0]).map((r) => r.from);
    return [...new Set(ids)].sort();
  },
  rowCap: (g) => Math.max(50, seedInDegree(g)),
};

// ── Q3: tests covering a symbol ──────────────────────────────────────────────
export const q3: BenchmarkQuery = {
  key: 'Q3-tests',
  label: 'Q3 — Find tests covering a symbol',
  sql: `
    SELECT DISTINCT n.id, n.name, n.file_path
    FROM relationships r
    JOIN nodes n ON n.id = r.to_id
    WHERE r.rel_type = 'TESTED_BY' AND r.from_id = $1
    ORDER BY n.id`,
  explain: 'Index scan on (from_id, rel_type).',
  seedParams: (g) => [seedSymbols(g, 50).find((s) => g.rels.some((r) => r.type === 'TESTED_BY' && r.from === s)) ?? seedSymbols(g, 1)[0]],
  gold: (g, params) => {
    const ids = g.rels.filter((r) => r.type === 'TESTED_BY' && r.from === params[0]).map((r) => r.to);
    return [...new Set(ids)].sort();
  },
  rowCap: () => 50,
};

// ── Q4: N-hop impact (transitive callers) ────────────────────────────────────
export function q4(depth: number): BenchmarkQuery {
  return {
    key: `Q4-impact-depth${depth}`,
    label: `Q4 — Impact analysis (transitive callers, depth ${depth})`,
    sql: `
      WITH RECURSIVE impacted(sym, depth) AS (
        SELECT r.from_id, 1
        FROM relationships r
        WHERE r.rel_type = 'CALLS' AND r.to_id = $1
        UNION
        SELECT r.from_id, i.depth + 1
        FROM relationships r
        JOIN impacted i ON r.to_id = i.sym
        WHERE r.rel_type = 'CALLS' AND i.depth < $2
      )
      SELECT DISTINCT sym FROM impacted ORDER BY sym`,
    explain: `Recursive CTE over the CALLS partial (to_id) index; UNION dedups; depth capped at ${depth}.`,
    seedParams: (g) => [pickDeepSeed(g, depth), depth],
    gold: (g, params) => {
      const target = params[0];
      const depth = params[1] as number;
      const frontier = new Set(g.rels.filter((r) => r.type === 'CALLS' && r.to === target).map((r) => r.from));
      const seen = new Set(frontier);
      for (let d = 2; d <= depth; d++) {
        const next = new Set<string>();
        for (const sym of frontier) {
          for (const r of g.rels) if (r.type === 'CALLS' && r.to === sym && !seen.has(r.from)) next.add(r.from);
        }
        for (const x of next) seen.add(x);
        frontier.clear();
        for (const x of next) frontier.add(x);
        if (frontier.size === 0) break;
      }
      return [...seen].sort();
    },
    rowCap: (g, params) => Math.max(200, g.rels.filter((r) => r.type === 'CALLS').length),
  };
}

/** Pick a seed whose 2-hop impact set is nontrivial but bounded (to avoid O(n²)-ish gold scans). */
function pickDeepSeed(g: Graph, depth: number): string {
  const all = seedSymbols(g, 200);
  // Prefer symbols with a real transitive fan-in; else fall back to the top symbol.
  const adj = new Map<string, string[]>();
  for (const r of g.rels) if (r.type === 'CALLS') (adj.get(r.to) ?? adj.set(r.to, []).get(r.to)!).push(r.from);
  for (const s of all) {
    const twoHop = new Set(adj.get(s) ?? []);
    for (const f of adj.get(s) ?? []) for (const f2 of adj.get(f) ?? []) twoHop.add(f2);
    if (twoHop.size >= 3) return s;
  }
  return all[0];
}

// ── Q6: test coverage gaps ───────────────────────────────────────────────────
export const q6: BenchmarkQuery = {
  key: 'Q6-coverage-gaps',
  label: 'Q6 — Test coverage gaps',
  sql: `
    SELECT n.id, n.name, n.kind
    FROM nodes n
    WHERE n.node_type = 'Symbol'
      AND n.kind IN ('function', 'method', 'class')
      AND NOT EXISTS (
        SELECT 1 FROM relationships r
        WHERE r.from_id = n.id AND r.rel_type = 'TESTED_BY'
      )
    ORDER BY n.id LIMIT $1`,
  explain: 'Full scan over Symbol nodes with NOT-EXISTS anti-join using (from_id, rel_type) index.',
  seedParams: (g) => [500],
  gold: (g) => {
    const tested = new Set(g.rels.filter((r) => r.type === 'TESTED_BY').map((r) => r.from));
    return g.nodes
      .filter((n) => n.type === 'Symbol' && ['function', 'method', 'class'].includes(n.kind ?? '') && !tested.has(n.id))
      .map((n) => n.id)
      .sort()
      .slice(0, 500);
  },
  rowCap: () => 500,
};

// ── Q9: evidence neighborhood (radius subgraph) ──────────────────────────────
export function q9(radius: number): BenchmarkQuery {
  return {
    key: `Q9-neighborhood-r${radius}`,
    label: `Q9 — Evidence neighborhood (radius ${radius})`,
    sql: `
      WITH RECURSIVE sub(id, depth) AS (
        SELECT $1::text, 0
        UNION ALL
        SELECT
          CASE WHEN r.from_id = s.id THEN r.to_id ELSE r.from_id END,
          s.depth + 1
        FROM relationships r
        JOIN sub s ON r.from_id = s.id OR r.to_id = s.id
        WHERE s.depth < $2
      )
      SELECT id, MIN(depth) AS depth FROM sub GROUP BY id ORDER BY id, depth`,
    explain: `Recursive CTE with bidirectional OR join; radial expansion, depth cap ${radius}.`,
    seedParams: (g) => [seedSymbols(g, 1)[0], radius],
    gold: (g, params) => {
      const root = params[0];
      const radius = params[1] as number;
      const frontier = new Set([root]);
      const seen = new Set([root]);
      for (let d = 1; d <= radius; d++) {
        const next = new Set<string>();
        for (const node of frontier) {
          for (const r of g.rels) {
            if (r.from === node && !seen.has(r.to)) next.add(r.to);
            if (r.to === node && !seen.has(r.from)) next.add(r.from);
          }
        }
        for (const x of next) seen.add(x);
        frontier.clear();
        for (const x of next) frontier.add(x);
        if (frontier.size === 0) break;
      }
      return [...seen].sort();
    },
    rowCap: (_g, params) => Math.max(200, 100 * (params[1] as number)),
  };
}

export const QUERIES: BenchmarkQuery[] = [q2, q3, q4(2), q4(4), q6, q9(1), q9(2)];

function seedInDegree(g: Graph): number {
  let max = 0;
  const m = new Map<string, number>();
  for (const r of g.rels) if (r.type === 'CALLS') m.set(r.to, (m.get(r.to) ?? 0) + 1);
  for (const v of m.values()) if (v > max) max = v;
  return max;
}