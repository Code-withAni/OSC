# Architecture Decisions — Phase 0 Summary

All four Phase 0 architecture decisions, with evidence links.

---

## ADR 001 — Parser: TypeScript Compiler API

**File:** `decisions/001-parser-selection.md`

The MVP uses the TypeScript Compiler API (`typescript@5.9.3`) for parsing JS/TS
repos into AST. Chosen over Babel: same accuracy, ~1.3× faster on 1,624 files,
~half the memory. TypeChecker pass available for future resolver uplift without a
parser swap.

**Key number:** 4,380 ms full parse of 1,624 files (date-fns).

---

## ADR 002 — Retrieval: Keyword over Semantic

**File:** `decisions/002-retrieval-strategy.md`

Keyword TF-IDF is the default retrieval layer. No vector DB required for MVP.
A dependency-free semantic proxy (char n-gram + PMI) showed no precision gain
over keyword (P@1 identical on commander, worse on date-fns) at 8–9× index time.

**Key number:** R@10 0.78–0.81 for keyword; retrieve-then-rank absorbs recall gap.

---

## ADR 003 — Graph Storage: PostgreSQL

**File:** `decisions/003-graph-storage.md`

PostgreSQL is sufficient for the MVP knowledge graph (Conclusion A). 28/28
queries correct across 4 sizes (up to 205,264 relationships). All queries except
Q4 (recursive transitive callers) complete in <10 ms warm p50 at stress scale.
Q4 p99 at stress = 187 ms — acceptable, addressable if scale grows.

**Key number:** 28/28 correct; worst p99 = 187 ms at 205k rels.

---

## ADR 004 — Analysis Strategy: Full Re-analysis

**File:** `decisions/004-incremental-analysis.md`

The MVP runs full re-analysis per snapshot. Incremental re-analysis (diff-based)
is deferred to Phase 10. Full parse of 1,624 files = 4.4 s; graph insert adds
<0.5 s. Incremental would require transactional graph diff and staleness tracking
— not justified at MVP scale.

**Key number:** Full pipeline <5 s for date-fns-scale repo.

---

## Combined Infrastructure Summary

| Layer | Choice | Replacement candidate |
|---|---|---|
| Parser | TypeScript Compiler API | Babel (no measured gain) |
| Retrieval | TF-IDF keyword index | Embeddings (unmeasured) |
| Graph store | PostgreSQL recursive CTEs | Neo4j (not needed) |
| Analysis | Full re-analysis | Incremental (Phase 10) |

Single operational dependency: **PostgreSQL**. No vector DB, no graph DB, no
separate search engine.

---

## Remaining Risks

1. **Q4 scaling beyond 200k rels** — recursive CTE performance untested beyond
   stress size. Mitigation: path materialization or graph-native store.
2. **Embedding retrieval unmeasured** — real transformer embeddings were not
   tested (ADR 002 caveat). Revisit when eval set ≥100 queries and model is
   runnable.
3. **Large monorepo parse time** — repos >10k files untested; full re-analysis
   may take minutes. Not MVP scope.
4. **Symbol extraction false positives** — regex-literal consts and type-only
   exports over-reported (ADR 001 limitation). Filter fixes pending.
