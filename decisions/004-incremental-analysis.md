# ADR 004 — MVP Analysis Strategy: Full Re-analysis

**Status:** Accepted (Phase 0)
**Date:** 2026-09-15
**Trigger:** Parser benchmark (ADR 001) measured full-parse latency at 4.4 s for
1,600 files; roadmap `Phase 10` lists incremental re-analysis as a future
enhancement.

## Context

The MVP ingests a repository snapshot (one commit SHA) and runs the full analysis
pipeline: parse → symbols → graph → retrieval index. For MVP scope, the question
is whether this must support incremental updates (only re-analyze changed files)
or whether full re-analysis from scratch is fast enough.

## Evidence (measured)

| Repository | Files | Full parse time (TS Compiler API) |
|---|---|---|
| commander.js | 159 | 688 ms |
| date-fns | 1,624 | 4,380 ms |

Full symbol extraction + graph insert (from `prototypes/sql-graph/`):

| Repository | Nodes | Rels | Insert time (warm) |
|---|---|---|---|
| commander.js | 1,938 | 859 | ~130 ms |
| date-fns | 10,300 | 12,829 | ~445 ms |

The full pipeline (parse + insert) for a date-fns-scale repo completes in under
5 seconds. Even 4× that size (~6,500 files) remains under 20 seconds — well
within acceptable one-shot analysis time for an MVP user flow.

Incremental analysis would require: file-change detection, per-file re-parse,
graph diff (delete stale edges, insert new), and retrieval index update. This
introduces significant implementation complexity (transactional graph diff,
staleness tracking, provenance invalidation) that is not justified at MVP scale.

## Options Considered

1. **Full re-analysis per snapshot** — re-parse every file, rebuild graph from
   scratch, rebuild retrieval index.
2. **Incremental re-analysis** — detect changed files, re-parse only those, diff
   the graph and index.

## Decision

Use **full re-analysis** for the MVP. Incremental analysis is explicitly deferred
to Phase 10.

## Consequences

- Simple ingestion pipeline: clone snapshot → parse all files → insert all nodes
  and relationships → build index. No diff logic.
- No staleness tracking or provenance invalidation needed.
- Trade-off: re-analysis cost scales linearly with repo size. At 1,600 files,
  this is ~4.4 s; at 10,000 files it would be ~27 s — still acceptable for a
  user-initiated analysis.
- Full re-analysis guarantees correctness: no risk of stale edges or missed
  changes.

## Known Limitations

- Large monorepos (>50,000 files) would take minutes; not tested and not MVP
  scope.
- Repeated analyses of the same repo (e.g., tracking updates) waste work. Acceptable
  for MVP; addressed when incremental is added in Phase 10.

## Revisit Conditions

- MVP users routinely analyze repos with >5,000 files and complain about latency.
- The system begins tracking repos over time (watch mode) and needs to process
  only recent commits.
- Phase 10 explicitly calls for incremental re-analysis.

## Related

- `decisions/001-parser-selection.md` — parser choice determines re-analysis cost.
- `docs/ROADMAP.md` Phase 10 — incremental re-analysis listed as future work.
