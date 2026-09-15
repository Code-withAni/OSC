# ADR 002 — MVP Retrieval Strategy: Keyword over Semantic

**Status:** Accepted (Phase 0)
**Date:** 2026-09-15
**Trigger:** Retrieval Benchmark (`prototypes/retrieval-comparison/`) — deterministic,
reproducible numbers on pinned repos commander.js `ba6d13d` and date-fns `18cbd436`.

## Decision

Keyword / full-text retrieval is the default MVP retrieval strategy.

- A token TF-IDF index (camelCase-aware) is the MVP retrieval layer.
- No vector database is required for the MVP based on current evidence.
- Retrieval feeds a retrieve-then-rank pipeline: top-N chunks → reasoning/evidence step.
- Semantic embeddings are a future experiment, not an MVP dependency.

## Context

Phase 0 asked whether semantic/vector retrieval provides measurable benefit over
keyword/full-text retrieval for Q1 (Issue→Code), Q7 (contribution discovery),
Q9 (evidence retrieval). A benchmark compared both on the pinned repositories with
17 hand-verified gold queries (8 commander + 9 date-fns), using the same queries and
same golds for both methods.

## Decision Drivers (measured, not assumed)

| Repo | Keyword P@1 | Semantic P@1 | Keyword R@10 | Semantic R@10 |
|------|------------|-------------|-------------|--------------|
| commander.js | 0.375 | 0.375 | 0.813 | 1.000 |
| date-fns | 0.222 | 0.000 | 0.778 | 0.556 |

1. **Keyword recovered the right file in the top 10 at 0.78–0.81 R@10.** In a
   retrieve-then-rank pipeline, feeding ≤10 candidates to the reasoning step is cheap
   and absorbs most recall risk. P@1 loss costs latency, not correctness.
2. **A dependency-free semantic proxy added no precision** (identical P@1 on commander,
   0.000 on date-fns) at 8–9× index time. No measurable win exists in this set.
3. **The genuinely hard Q1 case** (issue text describes behavior without sharing code
   vocabulary) is a reasoning problem, not a ranking problem — scheduled for the
   LLM interpretation step, per `docs/PHASE-0-EVALUATION.md` (Q1: "AI Reasoning
   Required: YES").
4. **Deterministic-first principle** (`CLAUDE.md`): a fully reproducible index beats a
   black-box embedding pipeline with no measured gain.

## What This Does NOT Claim

- **Transformer embeddings were not disproven.** The semantic comparator here was a
  char n-gram + PMI proxy with zero external dependencies and zero API cost. Real
  embeddings (e.g., all-MiniLM-L6-v2, text-embedding-3) were NOT measured: the
  `transformers.js` dependency could not be installed in this environment and no
  embedding API key was present. This decision must not be read as a verdict on them.
- This is not an infrastructure choice for the reasoning layer.

## Benchmark Limitations (preserved)

- 17 queries, 2 repositories. P@1 deltas of 0.1–0.2 are not statistically meaningful.
- "Semantic" here = dependency-free proxy (char n-gram TF-IDF + PMI expansion).
- 300-token chunk granularity; several near-miss P@1 cases were hit #2 — chunk
  granularity is an open variable.
- Query text is hand-written; some conceptual queries are doc-literal (favors keyword).

## Consequences / When to Revisit

Adopt keyword retrieval for the MVP pipeline. Reopen the embedding question only when
BOTH gates pass:
1. a labeled eval set is grown beyond ~17 queries (≥100/repo target), AND
2. a real embedding model is runnable in this environment.

Until then, embeddings are unmeasured magic.

## Related

- `prototypes/retrieval-comparison/results.md` — full per-query tables and unresolved questions.
- `docs/PHASE-0-EVALUATION.md` — Q1/Q7/Q9 specifications.