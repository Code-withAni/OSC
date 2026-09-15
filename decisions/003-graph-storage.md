# ADR 003 — MVP Graph Storage: PostgreSQL over Graph DB

**Status:** Accepted (Phase 0)
**Date:** 2026-09-15
**Trigger:** Graph storage benchmark (`prototypes/sql-graph/`) — 28 measured query
executions across 4 graph sizes, validated against in-memory gold standards.

## Context

The MVP knowledge graph needs to store repository nodes and relationships, then
answer graph queries: callers (Q2), tests for a symbol (Q3), transitive impact
(Q4), coverage gaps (Q6), and evidence neighborhoods (Q9). Phase 0 needed to
determine whether standard PostgreSQL is sufficient or a specialized graph DB
(e.g., Neo4j) is required. The user explicitly prohibited installing Neo4j.

## Options Considered

1. **PostgreSQL** with a flat `relationships` table, partial indexes on hot types,
   and recursive CTEs for traversal queries.
2. **Graph DB** (Neo4j, etc.) — not measured; out of scope per user instruction.

## Evidence (measured)

Benchmark on 4 graph sizes, all validated against in-memory gold (SQL vs
computed-from-loaded-data):

| Size | Nodes | Rels | Source | Correct | Worst p99 |
|---|---|---|---|---|---|
| small | 1,938 | 859 | commander.js | 7/7 ✓ | 5.2 ms |
| medium | 10,300 | 12,829 | date-fns | 7/7 ✓ | 9.4 ms |
| large | 41,196 | 51,316 | date-fns×4 | 7/7 ✓ | 11.2 ms |
| stress | 164,784 | 205,264 | date-fns×16 | 7/7 ✓ | **187.4 ms** |

All 28 query executions were correct. No SQL-vs-gold divergence at any size.

Latency breakdown (p50 warm, representative):

| Query | small | medium | large | stress |
|---|---|---|---|---|
| Q2 callers | 3 ms | 6.3 ms | 3 ms | 1.9 ms |
| Q3 tests | 1.2 ms | 1 ms | 0.9 ms | 0.8 ms |
| Q4 depth 2 | 1.5 ms | 6.7 ms | 7.9 ms | 138 ms |
| Q4 depth 4 | 1.6 ms | 6.8 ms | 7.1 ms | 133.5 ms |
| Q6 gaps | 2.2 ms | 3.7 ms | 2.8 ms | 3.7 ms |
| Q9 radius 1 | 1 ms | 1.4 ms | 1.4 ms | 1.4 ms |
| Q9 radius 2 | 4.2 ms | 6.9 ms | 7.6 ms | 5.6 ms |

Insert throughput: 15k–42k nodes/s, 13k–30k rels/s across sizes.
Storage: ~0.6 KB per relationship (tables + indexes).

Primary observed bottleneck: Q4 (recursive transitive callers) at stress scale
(205k rels) — falls back to sequential scan per recursive iteration (~133–187 ms
p50/p99). The other queries are well below interactive thresholds at all sizes.

Indexes are used selectively: Q3 (Index Scan), Q6 (Index Scan on nodes), Q2
(Bitmap Index Scan). Q4 and Q9 use sequential scans because recursive CTEs cannot
use `from_id`/`to_id` index directly; index on the `rel_type` partial filter
reduces the scan scope for single-type traversals.

## Decision

Use **PostgreSQL** for the MVP knowledge graph. No graph database is required.

## Consequences

- Single database for graph data and metadata; no multi-store coordination.
- Full CRUD in SQL with ACID guarantees.
- Recursive CTEs handle Q4 and Q9 correctly — no query translation needed.
- One operational dependency (PostgreSQL 18.4+).
- The stress-workload Q4 bottleneck (187 ms) remains; acceptable for MVP but
  addressable with path-materialization or graph index if scale grows.

## Known Limitations

- This conclusion is based on the tested workloads and query patterns only:
  - CALLS, IMPORTS, EXPORTS, TESTED_BY relationship types
  - Radii up to 4, depth caps up to 4
  - Graphs up to ~205k relationships
- Bidirectional recursive traversal (Q9) requires a single recursive arm with
  OR-join; a two-arm UNION breaks PostgreSQL's CTE rules — the fix is in the
  benchmark code.
- PostgreSQL parameter limit (65,535) requires batched INSERT with per-batch SQL
  rebuild for large graphs.
- Q4 recursive scans will not parallelize across edges in the way a native graph
  engine's traversal might.
- **No claim of universal scalability**: if recursive graph workloads grow
  substantially beyond ~200k edges or require deep unbounded traversal,
  re-evaluate graph-native stores.

## Revisit Conditions

- Recursive traversal latency exceeds SLA on production-scale repos.
- Path queries (shortest path, cycle detection, weighted relationships) become MVP
  scope.
- Graph grows beyond ~500k edges with deep traversal as a common query.

## Related

- `prototypes/sql-graph/results.md` — full measured tables and interpretation.
- `prototypes/sql-graph/results-data.json` — machine-readable benchmark data.