# Call-Graph Coverage Analysis

**Date:** 2026-09-14
**Sources:** `prototypes/resolver/results.md` (static resolver) + `prototypes/resolver/type-aware-results.md` (TypeChecker experiment)
**Repos pinned:** commander.js `ba6d13d`, date-fns `18cbd436`
**Scope:** Phase 0 architectural finding. No production code changed.

## The Central Caveat

**22% (commander.js) and 57% (date-fns) are NOT measures of overall repository understanding.**

They measure one thing only: *of calls that sit inside a parser-tracked symbol, how many can be linked to a repo symbol*. The tracked-symbol population is itself a minority of all calls in the repository (11.8% for commander.js, 20.2% for date-fns), and the majority of all calls target language builtins or external packages — relationships that are not repo call-graph edges at all.

Any headline number must state its population. This document therefore reports every metric as a fraction of an explicitly named population.

## Populations (measured)

| Population | commander.js | date-fns |
|---|---|---|
| Total call expressions in full AST | 8,309 | 24,961 |
| Calls seen by production parser | 8,309 (misses ~0 in `export const` init) | 22,828 (misses ~2,133, ~8.5%) |
| Calls **inside tracked symbols** | 984 (11.8% of AST calls) | 5,031 (20.2% of AST calls) |
| Calls **outside tracked symbols** (module-level etc.) | 7,325 (88.1%) | 19,930 (79.8%) |

The single largest coverage gap is **extraction**, not resolution: calls outside tracked symbols are invisible to the call graph because the parser attributes calls to enclosing function/class symbols only. This is a parser limitation; no resolver — static or type-aware — can fix it.

## The Six-Category Taxonomy (measured counts)

All counts are within the **tracked-symbol population** unless noted.

### 1. Statically resolvable (parser extracts, resolver resolves without types)

Same-file and imported calls. Both resolve at 100% once the import/export tables are built.

| | commander.js | date-fns |
|---|---|---|
| sameFile resolved / candidates | 24 / 24 (100%) | 379 / 379 (100%) |
| imported resolved / candidates | 8 / 8 (100%) | 2,473 / 2,473 (100%) |
| **Category total** | **32** | **2,852** |

date-fns is dominated by this category (functional style: direct function imports). commander.js has almost none of it (class-internal style).

### 2. Calls that require type information for improved resolution

Method calls on typed receivers (`this.foo()`, `obj.method()` where `obj`'s type is known).

| | commander.js | date-fns |
|---|---|---|
| method candidates (tracked) | 908 | 1,620 |
| resolved statically (baseline) | 184 (20.3%) | 13 (0.8%) |
| resolved with TypeChecker | 444 (48.9%) | 17 (1.0%) |
| **type-aware improvement** | **+260 (+120% relative)** | **+4 (+0.1%)** |

commander.js is OOP-heavy: the TypeChecker converts ambiguous `this.`/receiver method calls into high-confidence edges. date-fns gains nearly nothing — its unresolved methods target externals or untyped objects, where no type information exists to exploit.

### 3. Calls involving external dependencies

Definitively identified as non-repo targets (packages, language globals, `.d.ts` from packages).

| | commander.js | date-fns |
|---|---|---|
| builtin (tracked population) | 41 | 546 |
| external-definite (type-aware classification) | 262 | 1,586 |
| **Category total** | **~303 (30.8% of tracked)** | **~2,132 (42.4% of tracked)** |

These are *correctly* non-edges for a repo call graph. The value of the type-aware pass here is classification: it moves calls from "unresolved, unknown why" to "resolved-as-external, definite", which improves accountability without adding edges. Static baseline classifies builtins by name; it cannot classify package-external methods.

### 4. Calls on `any`-typed receivers

| | commander.js | date-fns |
|---|---|---|
| any-typed receiver calls (tracked) | 167 (17.0% of tracked) | 156 (3.1% of tracked) |

Structurally unresolvable without type annotations in source. Type information cannot help; only heuristics could, and heuristics violate the correctness rule (never invent a relationship). These stay unresolved **by design**.

### 5. Calls outside tracked symbols

| | commander.js | date-fns |
|---|---|---|
| Module-level / no enclosing symbol | 7,325 (88.1% of all calls) | 19,930 (79.8% of all calls) |

Parser extraction gap. Fix belongs in the parser (attribute module-level calls to a synthetic module symbol, fix the `export const` initializer early-return bug — worth ~2,133 recovered calls in date-fns), not in the resolver.

### 6. Dynamic / otherwise unresolvable

| | commander.js | date-fns |
|---|---|---|
| dynamic / element-access | 0 | 8 |
| callback (heuristic) | 3 | 5 |
| no symbol at call site | 27 | 8 |
| no declaration found | 3 | 117 |
| declaration not in repo index | 49 | 296 |

Small in both repos. The resolver never guesses: 0 dynamic calls were resolved in either repo.

## Coverage, Stated Honestly

### Extraction coverage (calls the pipeline can see)

| | commander.js | date-fns |
|---|---|---|
| Production parser / full AST | 100% | 91.5% |
| Tracked-symbol attribution / full AST | 11.8% | 20.2% |

### Resolution coverage (within tracked-symbol population)

| | commander.js | date-fns |
|---|---|---|
| Static resolver | 216 / 984 = **22.0%** | 2,865 / 5,031 = **56.9%** |
| + TypeChecker | 476 / 984 = **48.4%** | 2,868 / 5,031 = **57.0%** |

### Type-aware improvement

- commander.js: +260 calls (**+120% relative**), entirely method-type calls, all high confidence.
- date-fns: +3 calls (**+0.1% relative**). Not justified for this code style.

### External / unresolvable (within tracked-symbol population)

- commander.js: ~303 external/builtin (correctly excluded) + 167 any-typed + ~80 no-symbol/no-declaration/not-in-index + 3 dynamic/callback → the residual beyond static resolution is dominated by any-typed and external targets.
- date-fns: ~2,132 external/builtin + 156 any-typed + ~421 no-symbol/no-declaration/not-in-index + 13 dynamic/callback.

### What this means end-to-end

Resolved repo call-graph edges as a fraction of *all* call expressions: commander.js 216/8,309 = **2.6%** static (5.7% type-aware); date-fns 2,865/24,961 = **11.5%** static (11.5% type-aware). These low fractions are *not a defect*: most calls are builtins, externals, or module-level glue. The call graph's job is to capture repo-to-repo symbol relationships, and within the population where those exist, precision is the guarantee (never-guess rule) while recall is bounded by extraction and typing.

## Recommended Resolver Strategy

### MVP default: static AST + import/export + symbol-table resolution

- Ships the existing resolver: same-file, imported, direct TESTED_BY.
- 100% resolution on the categories it covers; high precision by construction (never-guess rule).
- Performance: ~1 s (commander.js), ~3.8 s (date-fns) end-to-end. Ample for MVP.
- Known ceiling: method calls on typed receivers stay unresolved. Documented, acceptable.

### Optional enhancement: TypeChecker-assisted resolution

Run a TS Program pass **only** when static resolution leaves a materially improvable gap. Measured costs and gains:

| Metric | commander.js | date-fns |
|---|---|---|
| Additional latency (program build) | +3,157 ms (≈3.6× pipeline time) | +9,453 ms (≈2.5× pipeline time) |
| Additional peak heap | +6.7 MB | +22.9 MB |
| Expected in-symbol resolution gain | +260 calls (22.0% → 48.4%) | +3 calls (56.9% → 57.0%) |
| Confidence change | 184 medium → high; 262 calls reclassified external-definite | negligible |

### When to trigger the optional type-aware pass

Trigger when **all** of the following hold (measurable from static-pass output alone, before building the TS Program):

1. **TypeScript-dominant repository** (majority of parsed files are `.ts`/`.tsx`).
2. **OOP-heavy call profile**: method-call candidates ≥ ~50% of tracked-symbol calls (commander.js: 92%; date-fns: 32%).
3. **High unresolved method rate**: ≥ ~70% of method candidates unresolved after the static pass (commander.js: 80%; date-fns: 99%, but its method population is tiny and external-targeting).
4. **Explicit user request** for deeper analysis, overriding the heuristics.

date-fns fails conditions 2–3 on volume: its method calls are few and target externals, so the 2.5× latency buys nothing. commander.js passes all: the 3.6× latency buys a 2.2× larger call graph.

The trigger thresholds are provisional (two data points); recalibrate after the parser's tracked-symbol coverage improves, which will change the denominator.

## Sequencing Note

Before any type-aware work, the higher-leverage fixes are parser-side:
1. Fix the `export const` initializer early-return bug (~2,133 calls recovered in date-fns — larger than the entire type-aware gain on either repo).
2. Attribute module-level calls (a synthetic module symbol) — unlocks the 80–88% of calls currently outside the graph's population.

These improve extraction coverage, which multiplies the value of both static and type-aware resolution.

---
*Phase 0 finding. No production architecture modified.*
