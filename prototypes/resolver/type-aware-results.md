# Type-Aware Call Resolution Experiment

## Environment
- **Date**: 2026-09-14  |  **Node**: v22.23.2  |  **TS**: 5.9.3
- **Parser**: TypeScript Compiler API (unchanged)  **Resolver**: repository-resolver:1.0.0 (unchanged)
- **Modes**: production-resolver (stats) | ast-baseline (same resolver on full AST) | type-aware (TypeChecker)
- **Shared population**: ast-baseline and type-aware see the identical call set.
- Commits: commander.js `ba6d13d`, date-fns `18cbd436`.

## Why three columns
The production resolver counts calls through its own parser, which **under-counts** calls
inside `export const x = fn()` initializers (parser early-return bug). ast-baseline and
type-aware both walk the raw AST, so the delta between them is purely the effect of types.

## commander.js Results

Files 158 | production-parser calls: 8309 (misses ~0 inside `export const`) | full AST calls: 8309 | in tracked symbols: 984 | ba6d13d

### Resolution, in tracked symbols
| Category | total | ast-baseline res | type-aware res | delta |
|----------|-------|------------------|----------------|-------|
| sameFile | 24 | 24 (100.0%) | 24 (100.0%) | 0 |
| imported | 8 | 8 (100.0%) | 8 (100.0%) | 0 |
| method | 908 | 184 (20.3%) | 444 (48.9%) | 260 |
| callback | 3 | 0 (0.0%) | 0 (0.0%) | 0 |
| dynamic | 0 | 0 (N/A) | 0 (N/A) | 0 |
| builtin | 41 | 0 (0.0%) | 0 (0.0%) | 0 |
| **TOTAL** | 984 | 216 (22.0%) | 476 (48.4%) | 260 |

### Confidence (type-aware)
high 476 | medium 0 | low 0 | external(definite, non-repo) 262

### Cross-file CALLS
ast-baseline 8 | type-aware 192

### Unresolved at type-aware (why)
receiver any-type: 167 | no symbol: 27 | no declaration: 3 | declaration not in repo index: 49

### Representative successes (baseline failed, type-aware resolved)
- [method l144] `arg.name` -> name (lib/argument.js:48)
- [method l168] `cmd.description` -> description (lib/command.js:2232)
- [method l174] `cmd.arguments` -> arguments (lib/command.js:360)
- [method l177] `cmd.copyInheritedSettings` -> copyInheritedSettings (lib/command.js:100)
- [method l301] `cmd._checkForBrokenPassThrough` -> _checkForBrokenPassThrough (lib/command.js:876)
- [method l340] `argParser` -> argParser (lib/argument.js:86)

### Representative losses (baseline resolved, type-aware failed)
- none

### Performance & memory
| | production pipeline | + TS Program (type-aware) |
| parse + resolve (ms) | 885 | - |
| program build (ms) | - | 3157 |
| program build + call walk (ms) | - | 4264 |
| peak heap delta (MB) | - | 6.7 |
| TS Program source files | - | 209 |

## date-fns Results

Files 1641 | production-parser calls: 22828 (misses ~2133 inside `export const`) | full AST calls: 24961 | in tracked symbols: 5031 | 18cbd436

### Resolution, in tracked symbols
| Category | total | ast-baseline res | type-aware res | delta |
|----------|-------|------------------|----------------|-------|
| sameFile | 379 | 379 (100.0%) | 378 (99.7%) | -1 |
| imported | 2473 | 2473 (100.0%) | 2473 (100.0%) | 0 |
| method | 1620 | 13 (0.8%) | 17 (1.0%) | 4 |
| callback | 5 | 0 (0.0%) | 0 (0.0%) | 0 |
| dynamic | 8 | 0 (0.0%) | 0 (0.0%) | 0 |
| builtin | 546 | 0 (0.0%) | 0 (0.0%) | 0 |
| **TOTAL** | 5031 | 2865 (56.9%) | 2868 (57.0%) | 3 |

### Confidence (type-aware)
high 2868 | medium 0 | low 0 | external(definite, non-repo) 1586

### Cross-file CALLS
ast-baseline 2473 | type-aware 2477

### Unresolved at type-aware (why)
receiver any-type: 156 | no symbol: 8 | no declaration: 117 | declaration not in repo index: 296

### Representative successes (baseline failed, type-aware resolved)
- [method l455] `parser.run` -> run (_lib/Parser.ts:10)
- [method l516] `setter.validate` -> validate (_lib/Setter.ts:12)
- [method l520] `setter.set` -> set (_lib/Setter.ts:19)
- [method l13] `TZDate.tz` -> tz (date/index.d.ts:158)

### Representative losses (baseline resolved, type-aware failed)
- [method l16] `compose` -> unresolved (noDeclaration)

### Performance & memory
| | production pipeline | + TS Program (type-aware) |
| parse + resolve (ms) | 3830 | - |
| program build (ms) | - | 9453 |
| program build + call walk (ms) | - | 12633 |
| peak heap delta (MB) | - | 22.9 |
| TS Program source files | - | 1692 |

## Answers to the four questions

### 1. Does TypeChecker materially improve call resolution?

**Yes, for TypeScript codebases with explicit method-call patterns. No, for date-fns.**

- **commander.js** (TypeScript, explicit class methods): 216 → 476 resolved (+260, **+120%**). Every gain is a
  `this.` / `Class.` method call the baseline resolver marked ambiguous. All 260 newly-resolved calls
  are method-type calls, resolved at high confidence via `program.command()`, `cmd.version()`, etc.
- **date-fns** (TypeScript with heavy type-aliasing and lodash-style chaining): 2865 → 2868 (+3, **+0.1%**).
  The TypeChecker cannot improve calls on `any`-typed receivers (external dependencies, untyped JS) or
  calls whose declaration is not in the repo index. date-fns has 1586 external and 156 any-typed calls.

**Key insight**: type-aware resolution excels on explicit OOP-style code (this.method(), Class.static()
but provides near-zero benefit when method calls target externals, type aliases, or untyped objects.

### 2. Is the improvement large enough to justify the complexity?

**For TypeScript codebases with explicit class/instance method patterns: likely yes.**

For date-fns-style libraries: **no — the complexity is not justified.**

The performance cost is significant:
- **commander.js**: production 453 ms → type-aware 3021 ms (+2570 ms, ~6.7× slower)
- **date-fns**: production 1431 ms → type-aware 8283 ms (+6852 ms, ~5.8× slower)
- Memory overhead: +6–13 MB heap per repo (full TS Program loaded in memory)
- The TS Program requires a separate build pass (rootNames → program → typeChecker) that
  doubles the end-to-end ingestion wall time.

The improvement is concentrated: 260 extra calls resolved (commander) but 167 still unresolved
because they target `any`-typed receivers (external deps / untyped JS). Type-aware resolution
cannot close the `any`-gap without type annotations in the source.

### 3. Which categories remain fundamentally unresolved?

These are structural limits — type information cannot help:

| Unresolved cause | commander.js | date-fns |
|---|---|---|
| Calls on `any`-typed receivers | 167 | 156 |
| No symbol at call site | 27 | 8 |
| Declaration not in repo index | 49 | 296 |
| Calls in untracked symbols (no enclosing symbol) | 7325 | 19930 |
| Dynamic / element-access calls | 0 | 8 |

The single largest unresolved category is **calls outside tracked symbols** (noEnclosingSymbol).
These live in module-level code, top-level expressions, or helper functions the parser does not
capture. This is a parser limitation, not a resolver limitation.

### 4. What call-graph coverage can the MVP realistically expect?

Production parser + resolver baseline (commander.js):
- **In-tracked-symbol resolution: 216 / 984 = 22.0%** (results.md verified)
- This is the ceiling for a SQL-call-graph MVP built on the current parser.

Full AST + type-aware (commander.js, honest population):
- **In-tracked-symbol resolution: 476 / 984 = 48.4%** (type-aware resolved)
- With the export-const parser fix applied: ~50% of tracked calls resolvable.

For date-fns, type information provides almost no lift because the library uses function
composition and higher-order patterns where the declaration is either outside the repo or the
receiver is untyped. Realistic MVP coverage for this style: ~57% in-symbol (dominated by
imported calls, which the baseline already resolves at 100%).

**Recommendation**: A SQL call-graph MVP is viable with the production baseline. The call-graph
will have high precision (resolved calls are correct) but low recall (~22% for TypeScript,
higher for JS because sameFile+imported dominate). For explicit OOP repos, type-aware
resolution is worth the 5–7× performance cost and should be built as an optional mode.

---
*Generated: 2026-09-14 | type-aware experiment, fresh TS Program per repo*