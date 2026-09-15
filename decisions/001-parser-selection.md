# ADR 001 — MVP Parser: TypeScript Compiler API

**Status:** Accepted (Phase 0)
**Date:** 2026-09-15
**Trigger:** Parser comparison benchmark (`prototypes/parser-comparison/`) on pinned
repos commander.js `ba6d13d` (159 files) and date-fns `18cbd436` (1624 files).

## Context

The MVP analyzes JavaScript/TypeScript repositories via AST-based static analysis
(`docs/CODE-ANALYSIS.md`). Phase 0 needed to pick the parsing technology before any
ingestion code is written. The parser must produce the common code model
(`docs/COMMON-CODE-MODEL.md`): symbols, imports/exports, call relationships, tests.

Regex-based parsing was already known to be structurally insufficient (no scope, no
types, no reliable nesting); it was kept in the benchmark only as a labeled baseline
and was explicitly excluded from the decision.

## Options Considered

1. **TypeScript Compiler API** (`typescript@5.9.3`) — official compiler, used by the
   TS language service.
2. **Babel** (`@babel/parser@7.24.0` + `@babel/traverse@7.23.9`) — dominant JS/TS
   transpilation ecosystem.
3. **Regex baseline** — non-AST, reference only, not decision-eligible.

## Evidence (measured)

Accuracy (hand-verified gold files, both AST parsers):

- commander.js `lib/argument.js`: symbols/methods/imports/exports all P=100% R=100%
  for **both** parsers.
- date-fns `format/index.ts`: identical results for both parsers — symbols R=100%,
  imports P=100% R=100%, exports P=83% R=100%, with the same false positives
  (regex-literal consts, type-only `FormatDateOptions`).

Performance:

| Metric (date-fns, 1624 files) | TS Compiler API | Babel | Regex |
|---|---|---|---|
| Parse time | 4,380 ms | 5,579 ms | 1,533 ms |
| Memory | 10.4 MB | 19.7 MB | — |

| Metric (commander.js, 159 files) | TS Compiler API | Babel | Regex |
|---|---|---|---|
| Parse time | 688 ms | 1,001 ms | 34 ms |
| Memory | 8.0 MB | 13.0 MB | 1.6 MB |

Accuracy is equivalent; TypeScript wins on large-repo speed (~1.3× faster than Babel
on date-fns) and memory (~half of Babel). Regex is faster but not decision-eligible —
it cannot see methods (333 vs 0) or nesting.

Follow-up resolver work (`prototypes/resolver/`) confirmed the choice indirectly:
the TS Compiler API's optional TypeChecker pass raised method-call resolution from
20.3% to 48.9% on commander.js (ADR 004 context) — a capability Babel does not offer.

## Decision

Use the **TypeScript Compiler API** for MVP parsing of JavaScript and TypeScript.

## Consequences

- One dependency (`typescript`) covers JS, JSX, TS, TSX with official semantics.
- A TypeChecker pass is available later without a parser swap.
- The parser is ~29 MB of dependency weight; acceptable for a Node.js service.
- Full parse of a 1,600-file repo completes in ~4.4 s — full re-analysis is cheap
  at MVP scale (feeds ADR 004).

## Known Limitations

- Symbol extraction over-reports regex-literal `const`s and type-only exports
  (filter fixes listed in the benchmark's "Required Improvements", still open).
- TS version upgrades can shift AST shapes; pin the version.
- Non-TS/JS languages are out of MVP scope by design.

## Revisit Conditions

- Multi-language support beyond JS/TS (roadmap Phase 10) requires a parser-per-
  language strategy anyway.
- If parse time becomes a bottleneck on repos ≥10× date-fns size, revisit with
  measured data (see also ADR 004).

## Related

- `prototypes/parser-comparison/results.md` — full benchmark.
- `prototypes/resolver/type-aware-results.md` — TypeChecker uplift evidence.
