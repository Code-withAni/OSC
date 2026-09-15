# Resolver Benchmark

## Environment
- **Date**: 2026-09-14
- **Node**: v22.23.2
- **TypeScript**: 5.9.3
- **Parser**: TypeScript Compiler API, no type-checker pass
- **Resolver**: repository-resolver:1.0.0
- **Repos pinned**: commander.js `ba6d13d`, date-fns `18cbd436`
- **Correctness rule**: never invent a relationship; dynamic/ambiguous stay unresolved

## commander.js Results

Commit: `ba6d13d` | Files: 158 | Symbols: 513 | Call exprs: 8309

### Import Resolution
| Metric | Value |
|--------|-------|
| Total import statements | 405 |
| In-repo (relative) | 135 |
| External (packages/builtins) | 270 |
| Resolved | 134 |
| Unresolved | 1 |
| Resolution rate (upper bound on recall) | 99.3% |
| Precision (needs gold standard) | N/A - no hand-verified set |

### Export Resolution
| Metric | Value |
|--------|-------|
| Total export statements | 42 |
| Resolved | 34 |
| Re-exports (incl. `export *`) | 0 |
| Unresolved | 8 |
| Resolution rate | 81.0% |

### CALLS Resolution
| Category | Candidates | Resolved | High/Med/Low (candidates) | Unresolved | Resolved rate |
|----------|-----------|----------|---------------------------|------------|---------------|
| sameFile | 331 | 331 | high 331 / medium 0 / low 0 | 0 | 100.0% |
| imported | 88 | 88 | high 88 / medium 0 / low 0 | 0 | 100.0% |
| method | 6263 | 184 | high 0 / medium 184 / low 0 | 6079 | 2.9% |
| callback | 3 | 0 | high 0 / medium 0 / low 0 | 3 | 0.0% |
| dynamic | 0 | 0 | high 0 / medium 0 / low 0 | 0 | 0% (never guessed) |
| builtin | 1624 | 0 | high 0 / medium 0 / low 0 | 1624 | 0.0% |

Cross-file CALLS (caller file != callee file): **88** (of 603 resolved)
Method-type calls (need type info): candidates 6263; unresolved within an enclosing symbol: 6079 (rest are module-level, separately counted)
Calls with no enclosing symbol (module level): **0**

### TESTED_BY Resolution
| Type | Count |
|------|-------|
| Direct (test calls source symbol) | 84 |
| Indirect (heuristic, low confidence) | 4 |

Indirect coverage is a heuristic and is **not** deterministic coverage.

### Confidence Distribution (resolved CALLS)
| Confidence | Count | % of resolved |
|------------|-------|---------------|
| High | 419 | 69.5% |
| Medium | 184 | 30.5% |
| Low | 0 | 0.0% |

### Failure Classification
parser limitation: 1; resolver limitation: 1635; ambiguous code: 6079

Common unresolved cases:
- Could not resolve call to 'test' (1059)
- Could not resolve call to 'assert.equal' (751)
- Could not resolve call to 'program.parse' (593)
- Could not resolve call to 'expectType' (287)
- Could not resolve call to 'program.opts' (279)
- Could not resolve call to 'assert.deepEqual' (269)

### Performance
| Metric | Value |
|--------|-------|
| Total time | 518 ms |
| Time per file | 3.28 ms |
| Peak memory (heap delta) | 19.1 MB |
| Symbols | 513 |
| Relationships | 859 |
| Unresolved-reference count | 7715 |
| Parser errors | 0 |

## date-fns Results

Commit: `18cbd436` | Files: 1641 | Symbols: 4358 | Call exprs: 24961

### Import Resolution
| Metric | Value |
|--------|-------|
| Total import statements | 4563 |
| In-repo (relative) | 3835 |
| External (packages/builtins) | 728 |
| Resolved | 3831 |
| Unresolved | 4 |
| Resolution rate (upper bound on recall) | 99.9% |
| Precision (needs gold standard) | N/A - no hand-verified set |

### Export Resolution
| Metric | Value |
|--------|-------|
| Total export statements | 2372 |
| Resolved | 2361 |
| Re-exports (incl. `export *`) | 757 |
| Unresolved | 11 |
| Resolution rate | 99.5% |

### CALLS Resolution
| Category | Candidates | Resolved | High/Med/Low (candidates) | Unresolved | Resolved rate |
|----------|-----------|----------|---------------------------|------------|---------------|
| sameFile | 709 | 709 | high 709 / medium 0 / low 0 | 0 | 100.0% |
| imported | 6498 | 6498 | high 6498 / medium 0 / low 0 | 0 | 100.0% |
| method | 8060 | 13 | high 0 / medium 13 / low 0 | 8047 | 0.2% |
| callback | 5 | 0 | high 0 / medium 0 / low 0 | 5 | 0.0% |
| dynamic | 28 | 0 | high 0 / medium 0 / low 0 | 28 | 0% (never guessed) |
| builtin | 9661 | 0 | high 0 / medium 0 / low 0 | 9661 | 0.0% |

Cross-file CALLS (caller file != callee file): **6498** (of 7220 resolved)
Method-type calls (need type info): candidates 8060; unresolved within an enclosing symbol: 8057 (rest are module-level, separately counted)
Calls with no enclosing symbol (module level): **0**

### TESTED_BY Resolution
| Type | Count |
|------|-------|
| Direct (test calls source symbol) | 54 |
| Indirect (heuristic, low confidence) | 120 |

Indirect coverage is a heuristic and is **not** deterministic coverage.

### Confidence Distribution (resolved CALLS)
| Confidence | Count | % of resolved |
|------------|-------|---------------|
| High | 7207 | 99.8% |
| Medium | 13 | 0.2% |
| Low | 0 | 0.0% |

### Failure Classification
parser limitation: 4; resolver limitation: 9677; ambiguous code: 8047

Common unresolved cases:
- Could not resolve call to 'expect' (4132)
- Could not resolve call to 'it' (3107)
- Could not resolve call to 'toBe' (2573)
- Could not resolve call to 'toEqual' (1088)
- Could not resolve call to 'describe' (894)
- Could not resolve call to 'tz' (546)

### Performance
| Metric | Value |
|--------|-------|
| Total time | 2898 ms |
| Time per file | 1.77 ms |
| Peak memory (heap delta) | 24.9 MB |
| Symbols | 4358 |
| Relationships | 12829 |
| Unresolved-reference count | 17728 |
| Parser errors | 0 |

## Import Resolution (merged)
| Metric | commander.js | date-fns |
|--------|--------------|----------|
| Total / Resolved / Unresolved | 405 / 134 / 1 | 4563 / 3831 / 4 |

## Export Resolution (merged)
| Metric | commander.js | date-fns |
|--------|--------------|----------|
| Resolved / Total / Unresolved | 34 / 42 / 8 | 2361 / 2372 / 11 |
| Re-exports | 0 | 757 |

## CALLS Resolution (merged)
| Category | commander res/total (rate) | date-fns res/total (rate) |
|----------|---------------------------|---------------------------|
| sameFile | 331/331 (100.0%) | 709/709 (100.0%) |
| imported | 88/88 (100.0%) | 6498/6498 (100.0%) |
| method | 184/6263 (2.9%) | 13/8060 (0.2%) |
| callback | 0/3 (0.0%) | 0/5 (0.0%) |
| dynamic | 0/0 (N/A) | 0/28 (0.0%) |
| builtin | 0/1624 (0.0%) | 0/9661 (0.0%) |
| **TOTAL** | 603/8309 (7.3%) | 7220/24961 (28.9%) |

Categories are deliberately **not** combined into a single score. Callback = heuristic.

## TESTED_BY Resolution (merged)
| Type | commander.js | date-fns |
|------|--------------|----------|
| Direct | 84 | 54 |
| Indirect (heuristic) | 4 | 120 |

## Confidence Distribution (merged, resolved CALLS)
| Confidence | commander.js | date-fns |
|------------|--------------|----------|
| High | 419 | 7207 |
| Medium | 184 | 13 |
| Low | 0 | 0 |

## Ground Truth Comparison
- **Unit suite**: 256 assertions / 11 scenarios encode verified-correct behavior; all pass.
- **Real repos**: no external gold standard exists for these pinned commits' call graphs.
  Precision/recall are reported as resolution rates (an upper bound on recall); true precision
  requires a hand-verified sample, which is not invented here.
- The correctness rule (never guess) is the primary precision guarantee.

## Limitations
1. Method calls needing type info are unresolved by design (no type-checker pass); they dominate CALLS totals.
2. Module-level (no-enclosing-symbol) calls are counted but not attributed to a caller symbol.
3. Callback detection is a heuristic: a name used as a call argument elsewhere in the file.
4. Config-file and type-only exports inflate unresolved-export counts.
5. `new Foo()` and type-based calls are missed without type checking.

## Recommendation
Import/export resolution is strong on real repos and performance is ample for an MVP. Sound
edges (IMPORTS, EXPORTS, same-file / imported CALLS, TESTED_BY direct+heuristic) are reliable
enough to feed the SQL graph prototype. CALLS method resolution is a correctness-first ceiling,
not a bug. Add a type-checking pass before claiming call-graph completeness. Not production-ready
on the basis of unit tests alone; real-repo precision is unverified against a gold standard.

---
*Generated: 2026-09-14 | resolver benchmark, fresh resolver per repo*
