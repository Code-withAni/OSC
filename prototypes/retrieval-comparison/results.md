# Retrieval Benchmark — Keyword vs Semantic

Generated: 2026-09-14T15:08:19.302Z

- **Keyword:** token TF-IDF (exact lexical overlap, camelCase split).
- **Semantic (proxy):** char n-gram TF-IDF + PMI query expansion (distributional semantics, zero external deps).
- **Repos:** commander.js `ba6d13d`, date-fns `18cbd436` (pinned).
- **Gold:** hand-verified file-level answers for each query, set by reading the code.
- **Queries:** 17 total (8 commander + 9 date-fns; Q1 Issue→Code, Q7 contribution discovery, Q9 evidence). No query text is copied from a gold file path/name — Q1/Q7 style natural language; `exact` typed queries intentionally reuse symbol vocabulary.


## commander.js

| Metric | Keyword | Semantic |
|--------|---------|----------|
| P@1 | 0.375 | 0.375 |
| P@5 | 0.150 | 0.150 |
| R@10 | 0.813 | 1.000 |
| Query latency (avg) | 28ms | 16ms |
| Index time | 53ms | 492ms |
| Index size (raw chunk text) | 677 KiB | 677 KiB |
| Chunks | 341 | 341 |

| Query | Type | KW P@1 | Sem P@1 | KW R@10 | Sem R@10 | Winner |
|-------|------|--------|---------|---------|----------|--------|
| cQ1a | exact | 1.00 | 1.00 | 1.00 | 1.00 | tie |
| cQ1b | conceptual | 0.00 | 0.00 | 1.00 | 1.00 | tie |
| cQ1c | conceptual | 0.00 | 0.00 | 0.00 | 1.00 | semantic |
| cQ1d | exact | 1.00 | 1.00 | 1.00 | 1.00 | tie |
| cQ7a | conceptual | 0.00 | 0.00 | 0.50 | 1.00 | semantic |
| cQ7b | conceptual | 0.00 | 0.00 | 1.00 | 1.00 | tie |
| cQ9a | exact | 1.00 | 1.00 | 1.00 | 1.00 | tie |
| cQ9b | conceptual | 0.00 | 0.00 | 1.00 | 1.00 | tie |

**Head-to-head per query (by P@1): keyword 0, semantic 2.**


## date-fns

| Metric | Keyword | Semantic |
|--------|---------|----------|
| P@1 | 0.222 | 0.000 |
| P@5 | 0.133 | 0.111 |
| R@10 | 0.778 | 0.556 |
| Query latency (avg) | 124ms | 82ms |
| Index time | 313ms | 2470ms |
| Index size (raw chunk text) | 3050 KiB | 3050 KiB |
| Chunks | 2248 | 2248 |

| Query | Type | KW P@1 | Sem P@1 | KW R@10 | Sem R@10 | Winner |
|-------|------|--------|---------|---------|----------|--------|
| dQ1a | exact | 0.00 | 0.00 | 1.00 | 1.00 | tie |
| dQ1b | conceptual | 1.00 | 0.00 | 1.00 | 1.00 | keyword |
| dQ1c | conceptual | 0.00 | 0.00 | 0.00 | 1.00 | semantic |
| dQ1d | exact | 0.00 | 0.00 | 1.00 | 0.00 | keyword |
| dQ7a | exact | 0.00 | 0.00 | 1.00 | 1.00 | tie |
| dQ7b | conceptual | 0.00 | 0.00 | 1.00 | 0.00 | keyword |
| dQ7c | conceptual | 1.00 | 0.00 | 1.00 | 0.00 | keyword |
| dQ9a | conceptual | 0.00 | 0.00 | 1.00 | 0.00 | keyword |
| dQ9b | exact | 0.00 | 0.00 | 0.00 | 1.00 | semantic |

**Head-to-head per query (by P@1): keyword 5, semantic 2.**


## Aggregated

| Repo | KW P@1 | Sem P@1 | KW R@10 | Sem R@10 | KW msec/q | Sem msec/q |
|------|--------|---------|---------|----------|-----------|------------|
| commander.js | 0.375 | 0.375 | 0.813 | 1.000 | 28 | 16 |
| date-fns | 0.222 | 0.000 | 0.778 | 0.556 | 124 | 82 |

By query type:

| Type | Method | Queries | P@1 | R@10 |
|------|--------|---------|-----|------|
| exact | keyword | 7 | 0.429 | 0.857 |
| exact | semantic | 7 | 0.429 | 0.857 |
| conceptual | keyword | 10 | 0.200 | 0.750 |
| conceptual | semantic | 10 | 0.000 | 0.700 |

## Interpretation

Metrics above are measured from the pinned repos with hand-verified file golds (17 queries total; 8 commander + 9 date-fns).

**Headline numbers:**

- **commander.js:** P@1 is identical (0.375 / 0.375). Semantic lifts R@10 (1.000 vs 0.813) and is faster per query (16ms vs 28ms) but is 9× slower to index (492ms vs 53ms).
- **date-fns:** keyword wins on every aggregate. P@1 0.222 vs 0.000; R@10 0.778 vs 0.556. Index 313ms vs 2 470ms (≈8×).
- **By query type:** exact-vocabulary queries tie at P@1 0.429. Conceptual queries: keyword P@1 0.200 vs semantic 0.000 — keyword is still ahead; semantic only narrows R@10 (0.750 vs 0.700).

**What this means:**

1. **A dependency-free "semantic" layer does not beat exact keyword on this set.** Char n-gram + PMI expansion helps recall but hurts precision and costs far more to index. On the JSDoc-rich date-fns corpus, plain keyword is strictly better.
2. **The real hard case is not won by either.** On conceptual queries neither method reaches P@1 beyond 0.20. The query describes behavior; the right file is often the 2nd–10th hit. That gap (issue introduces vocabulary the code does not share) is exactly what Q1 names — and it confirms the Phase-0 evaluation doc: **semantic Issue→Code matching belongs to the LLM-reasoning step, not the lexicon retrieval layer.**
3. **Transformer embeddings are not measured here.** The `transformers.js` dependency could not be installed in this environment and no embedding API key was available. This benchmark validates the *cheap* semantic option only. It must NOT be read as a verdict on all-MiniLM / text-embedding-3-small — that is explicitly an unresolved question (below).

### Storage / complexity

- **Indexed chunk text** is the same for both (677 KiB / 3 050 KiB) — chunking is shared.
- **Semantic additionally** holds a per-term co-occurrence matrix (PMI): memory and index time grow super-linearly with corpus size (≈8–9× index time on date-fns). At 2 248 chunks this is trivial; at 100 K chunks (multi-repo MVP) it is not.
- **Keyword implementation** is ~70 LOC, zero deps, deterministic.
- **Semantic implementation** is ~180 LOC, zero deps, still fully deterministic (no API, no model download).

---

## Is semantic retrieval necessary for the MVP?

**Answer: No — keyword/full-text retrieval is sufficient for the MVP retrieval layer. Semantic matching is, and should be, a reasoning-layer concern, with real embeddings deferred until a labeled set and a runnable model exist.**

Rationale, in order of weight:

1. **Keyword recovered the correct file within the top 10 (R@10 = 0.78–0.81) on almost everything.** For a retrieve-then-rank pipeline, feeding 10 candidates to the LLM/evidence step is cheap and kills most recall risk. P@1 loss mainly costs a little latency, not correctness.
2. **A cheap semantic layer did not improve precision at all** (P@1 0.00 on date-fns; identical on commander), yet added 8–9× index time. There is no measurable win to take.
3. **The Q1 hard case (behavior without vocabulary) is a reasoning problem, not a ranking problem.** Neither method solves it. That is the job of the LLM interpretation step the architecture already plans (`docs/PHASE-0-EVALUATION.md` Q1: "AI Reasoning Required: YES"), and it should be tested there.
4. **Deterministic-first principle** (`CLAUDE.md`): a deterministic TF-IDF index with 100 % reproducible results beats a black-box embedding pipeline that provides no measured gain.

**MVP decision:** build retrieval as **keyword (camelCase-aware TF-IDF) + deterministic edges** — issue text that names a symbol/file resolves exactly; otherwise candidate retrieval hands top-N chunks to the reasoning step. No embedding pipeline in MVP.

**When to revisit:** the moment a) a labeled eval set is grown past ~17 queries (the point of this prototype) AND b) a real embedding model is runnable on this box. Both gates must pass; until then, embeddings are unmeasured magic.

---

## Unresolved Questions

1. **Transformer embeddings unmeasured.** Could not install `@huggingface/transformers` (npm state inconsistent) and no embedding API key was present. A real all-MiniLM / text-embedding benchmark against the same 17 golds is the first follow-up before any embedding decision.
2. **Gold set too small.** 17 queries, 2 repos. P@1 differences of 0.1–0.2 are not statistically meaningful. Grow to ≥100 queries/repo before trusting positive results.
3. **Chunk granularity.** 300-token chunks produced several near-miss P@1 cases where the right file was hit #2. Symbol-level chunks or a file-line map may serve Q1 issue→code better. Untested here.
4. **Query-construction bias.** Creating realistic *issue text* is the hardest part. Several "conceptual" queries in this set are arguably doc-literal (favors keyword). The eval set needs issue/PR titles copied from real repos.
5. **Rerank latency.** Keyword R@10 ≈ 0.8 means 2-of-10 retrieval misses on average. Whether a cheap rerank (embedding cosine over just the 10) recovers those is untested.
6. **Multi-repo routing** and **incremental index updates** still unaddressed (carried over).

---

## Files

- `keyword-search.ts` — camelCase-aware token TF-IDF (baseline; recommend MVP).
- `semantic-search.ts` — char n-gram TF-IDF + PMI expansion (cheap semantic baseline, measured 9×-slower index).
- `benchmark.ts` — measurement harness; per-repo queries; writes this file.
- `benchmark-run.log` — raw per-query output for this run.

---
*Phase 0 finding. No production retrieval infrastructure chosen. No vector database selected. Deterministic prototype confirmed sufficient for MVP retrieval layer.*